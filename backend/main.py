import os
import io
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from pypdf import PdfReader
from services.rag_service import RAGIndex


# ─── Configuration loading ─────────────────────────────────────────────────────

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY not found. Make sure the .env file exists "
        "and contains the GEMINI_API_KEY variable."
    )

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-2.5-flash-lite"


# ─── FastAPI application ───────────────────────────────────────────────────────

app = FastAPI(title="DebateCoach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helper function: call_gemini ──────────────────────────────────────────────

def call_gemini(prompt: str, system_instruction: str | None = None) -> str:
    """Calls Gemini and returns the generated text."""
    try:
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=system_instruction,
        )
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"[GEMINI ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")


# ─── Helper function: PDF text extraction ─────────────────────────────────────

def extract_pdf_text(pdf_bytes: bytes) -> str:
    """
    Takes the bytes of a PDF file and returns all its text as a single string.
    Returns an empty string if extraction fails.
    """
    try:
        # PdfReader expects a file-like object, so we wrap the bytes in BytesIO
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append(text.strip())
        full_text = "\n\n".join(pages_text)
        return full_text
    except Exception as e:
        print(f"[PDF EXTRACT ERROR] {e}")
        return ""


def extract_pdf_pages(pdf_bytes: bytes) -> list[dict]:
    """
    Extracts text page by page to preserve real page numbers.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            text = text.strip()

            if text:
                pages.append({
                    "page": i + 1,
                    "text": text,
                })

        return pages

    except Exception as e:
        print(f"[PDF PAGE EXTRACT ERROR] {e}")
        return []


def make_evidence_snippets(text: str, max_snippets: int = 3) -> list[dict]:
    """
    Splits the text into a few short excerpts for the Evidence panel.
    Naive version: takes fixed chunks from the beginning, middle, and end of the document.
    """
    if not text:
        return []

    chunk_size = 400  # ~400 characters per snippet
    total = len(text)

    if total < chunk_size:
        return [{
            "id": "chunk-1",
            "page": 1,
            "text": text.strip(),
            "score": 1.0,
        }]

    # Take evenly spaced excerpts throughout the document
    positions = [0, total // 2, max(0, total - chunk_size)]
    snippets = []
    for i, pos in enumerate(positions[:max_snippets]):
        excerpt = text[pos:pos + chunk_size].strip()
        if excerpt:
            snippets.append({
                "id": f"chunk-{i+1}",
                "page": (pos // 2000) + 1,  # page approximation
                "text": excerpt,
                "score": round(0.9 - i * 0.1, 2),
            })
    return snippets


# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class DebateRequest(BaseModel):
    message: str
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: str


# ─── Session memory ────────────────────────────────────────────────────────────

sessions: dict[str, dict] = {}


# ─── Route 1: POST /upload ─────────────────────────────────────────────────────

@app.post("/upload")
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[UPLOAD] Received: {file.filename} (session: {session_id})")

    # Read file bytes
    pdf_bytes = await file.read()

    # Extract PDF text
    pages = extract_pdf_pages(pdf_bytes)
    document_text = "\n\n".join(page["text"] for page in pages)

    if not document_text:
        raise HTTPException(
            status_code=400,
            detail="Unable to extract text from this PDF. "
                "Is it a text-based PDF (not a scanned image)?"
        )

    print(f"[UPLOAD] Extracted text: {len(document_text)} characters")

    rag_index = RAGIndex.from_pages_documents([
        {
            "filename": file.filename,
            "pages": pages,
        }
    ])

    print(f"[UPLOAD] RAG index created with {len(rag_index.chunks)} chunks")

    # Ask Gemini for an opening statement based on the actual document content
    system = (
        "You are an experienced debater. You will debate against a human user "
        "on the topic of a document they have just provided. Take a clear stance "
        "(FOR or AGAINST the document's thesis, your choice) "
        "and defend it throughout the debate using evidence from the document."
    )

    prompt = (
        f"Here is the document content:\n\n---\n{document_text}\n---\n\n"
        f"Read this document, identify its main thesis, and generate an opening "
        f"statement (2-3 sentences) where you take a position and invite the user "
        f"to present their argument. Clearly state which position you are defending."
    )

    opening = call_gemini(prompt, system_instruction=system)

    # Store everything in the session
    sessions[session_id] = {
        "filename": file.filename,
        "filenames": [file.filename],
        "document_text": document_text,
        "rag_index": rag_index,
        "ai_position": opening,
        "history": [
            {"role": "ai", "text": opening}
        ],
    }

    return {
        "session_id": session_id,
        "opening_statement": opening,
    }


# ─── Route 1.2: POST /upload-multiple ─────────────────────────────────────────

@app.post("/upload-multiple")
async def upload_multiple(
    session_id: str = Form(...),
    file1: UploadFile | None = File(None),
    file2: UploadFile | None = File(None),
    file3: UploadFile | None = File(None),
    file4: UploadFile | None = File(None),
    file5: UploadFile | None = File(None),
):
    files = [f for f in [file1, file2, file3, file4, file5] if f is not None]

    if not files:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one PDF file."
        )

    print(f"[UPLOAD-MULTIPLE] Received {len(files)} file(s) (session: {session_id})")

    documents = []
    document_text_parts = []

    for file in files:
        print(f"[UPLOAD-MULTIPLE] Reading: {file.filename}")

        pdf_bytes = await file.read()

        # Page-by-page extraction to preserve real page numbers
        pages = extract_pdf_pages(pdf_bytes)
        text = "\n\n".join(page["text"] for page in pages)

        if not text:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to extract text from PDF: {file.filename}"
            )

        documents.append({
            "filename": file.filename,
            "text": text,
            "pages": pages,
        })

        document_text_parts.append(
            f"\n\n===== DOCUMENT: {file.filename} =====\n\n{text}"
        )

    document_text = "\n".join(document_text_parts)

    print(f"[UPLOAD-MULTIPLE] Total extracted text: {len(document_text)} characters")

    # Build FAISS index with source-aware and page-aware chunks
    rag_index = RAGIndex.from_pages_documents(documents)
    print(f"[UPLOAD-MULTIPLE] RAG index created with {len(rag_index.chunks)} chunks")

    system = (
        "You are an experienced debater. You will debate against a human user "
        "on the topic of several provided documents. Take a clear stance "
        "and defend it throughout the debate using evidence from the documents."
    )

    prompt = (
        f"Here is the content of the documents:\n\n---\n{document_text[:8000]}\n---\n\n"
        f"Read these documents, identify their common theme or points of disagreement, "
        f"and generate an opening statement of 2-3 sentences where you take a position "
        f"and invite the user to present their argument. "
        f"Clearly state which position you are defending."
    )

    opening = call_gemini(prompt, system_instruction=system)

    sessions[session_id] = {
        "filenames": [doc["filename"] for doc in documents],
        "document_text": document_text,
        "rag_index": rag_index,
        "ai_position": opening,
        "history": [
            {"role": "ai", "text": opening}
        ],
    }

    return {
        "session_id": session_id,
        "filenames": [doc["filename"] for doc in documents],
        "opening_statement": opening,
    }


# ─── Route 2: POST /debate ─────────────────────────────────────────────────────

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] Message received: {req.message[:80]}...")

    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Did you upload a document first?"
        )

    document_text = session.get("document_text", "")

    rag_index = session.get("rag_index")

    if rag_index:
        evidence = rag_index.search(req.message, top_k=3)
    else:
        evidence = make_evidence_snippets(document_text, max_snippets=3)

    evidence_text = "\n\n".join(
        f"[{item['id']} | source {item.get('source', 'unknown')} | pages {item.get('pages', 'unknown')} | score {item['score']}]\n{item['text']}"
        for item in evidence
    )

    history_text = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
        for msg in session["history"]
    )

    system = (
        "You are a rigorous but fair debater. You defend the position taken "
        "at the start of the debate. Respond in 2-4 sentences maximum, in a "
        "conversational tone. You MUST support your arguments with content from "
        "the provided document. If the user commits an obvious logical fallacy "
        "(e.g. ad hominem, false dilemma), point it out respectfully."
    )

    prompt = (
        f"Relevant passages retrieved by RAG:\n---\n{evidence_text}\n---\n\n"
        f"Debate history:\n{history_text}\n\n"
        f"The user just said: \"{req.message}\"\n\n"
        f"Respond by defending your position using evidence from the document."
    )

    ai_response = call_gemini(prompt, system_instruction=system)

    session["history"].append({"role": "user", "text": req.message})
    session["history"].append({"role": "ai", "text": ai_response})

    return {
        "response": ai_response,
        "audio_url": None,
        "evidence": evidence,
        "session_id": req.session_id,
    }


# ─── Route 3: POST /transcribe (still a stub) ─────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[TRANSCRIBE] Audio received (session: {session_id}) — stub for now")
    return {
        "transcript": "This is a stub transcript. AWS Transcribe will be integrated at step 4."
    }


# ─── Route 4: POST /end-session ───────────────────────────────────────────────

@app.post("/end-session")
async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] Ending session: {req.session_id}")

    session = sessions.get(req.session_id)
    if not session or not session["history"]:
        return {
            "score": {"user": 0, "ai": 0},
            "summary": "No debate to analyze.",
            "transcript_url": None,
        }

    document_text = session.get("document_text", "")
    transcript = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
        for msg in session["history"]
    )

    system = (
        "You are an expert debate coach. You analyze the performance of a user "
        "in a debate against an AI, on a topic defined by a reference document. "
        "Respond ONLY in valid JSON format with this structure: "
        '{"user_score": <0-100>, "ai_score": <0-100>, "summary": "<text>"}'
    )

    prompt = (
        f"Reference document (summary):\n---\n{document_text[:2000]}...\n---\n\n"
        f"Full debate transcript:\n{transcript}\n\n"
        f"Score the user's performance out of 100 and the AI's out of 100. "
        f"Provide a summary (2-3 sentences) with concrete advice to help the user improve. "
        f"Assess in particular whether the user drew on the document effectively. "
        f"Respond in valid JSON."
    )

    raw_response = call_gemini(prompt, system_instruction=system)

    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        user_score = int(data.get("user_score", 0))
        ai_score = int(data.get("ai_score", 0))
        summary = data.get("summary", "Analysis unavailable.")
    except (json.JSONDecodeError, ValueError):
        print(f"[END-SESSION] Invalid JSON received from Gemini: {raw_response}")
        user_score, ai_score = 50, 50
        summary = "The debate went well, but the detailed analysis could not be generated."

    return {
        "score": {"user": user_score, "ai": ai_score},
        "summary": summary,
        "transcript_url": None,
    }


# ─── Root route ────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status": "DebateCoach backend is running",
        "model": GEMINI_MODEL,
        "active_sessions": len(sessions),
        "rag_mode": "FAISS + Gemini embeddings with source-aware chunks",
    }