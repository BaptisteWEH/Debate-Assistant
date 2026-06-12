# main.py
import os
import io
import json
import time
import random
import requests
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from services.rag_service import RAGIndex
from services.agent_service import DebateAgent
from services.session_store import save_session, load_session


# Configuration loading

load_dotenv()

LUXIA_API_KEY = os.getenv("LUXIA_API_KEY")
if not LUXIA_API_KEY:
    raise RuntimeError(
        "LUXIA_API_KEY not found. Make sure the .env file exists "
        "and contains the LUXIA_API_KEY variable."
    )

LUXIA_MODEL = "luxia3-llm-8b-0731"
LUXIA_CHAT_URL = "https://bridge.luxiacloud.com/luxia/v1/chat"


# FastAPI application

app = FastAPI(title="DebateCoach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helper function: call_luxia

def call_luxia(prompt: str, system_instruction: str | None = None, retries: int = 5) -> str:
    """Call Luxia's chat endpoint. System instruction is prepended to the prompt
    since the bridge endpoint only accepts a single 'user' message."""
    full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt

    wait_time = 1.0
    for attempt in range(retries):
        try:
            response = requests.post(
                LUXIA_CHAT_URL,
                headers={"apikey": LUXIA_API_KEY, "Content-Type": "application/json"},
                json={
                    "model": LUXIA_MODEL,
                    "messages": [{"role": "user", "content": full_prompt}],
                    "temperature": 0,
                    "stream": False,
                },
                timeout=30,
            )

            if response.status_code == 429:
                print(f"[LUXIA 429] sleeping {wait_time:.1f}s...")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2
                continue

            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()

        except Exception as e:
            print(f"[LUXIA ERROR] {e}")
            time.sleep(wait_time + random.uniform(0, 0.5))
            wait_time *= 2

    raise HTTPException(status_code=500, detail="Luxia error after retries")


# Agent system initialization

debate_agent = DebateAgent(
    luxia_api_key=LUXIA_API_KEY,
    model_name=LUXIA_MODEL,
)


# Helper function: PDF text extraction

def extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append(text.strip())
        return "\n\n".join(pages_text)
    except Exception as e:
        print(f"[PDF EXTRACT ERROR] {e}")
        return ""


def extract_pdf_pages(pdf_bytes: bytes) -> list[dict]:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                pages.append({"page": i + 1, "text": text})
        return pages
    except Exception as e:
        print(f"[PDF PAGE EXTRACT ERROR] {e}")
        return []


def make_evidence_snippets(text: str, max_snippets: int = 3) -> list[dict]:
    if not text:
        return []
    chunk_size = 400
    total = len(text)
    if total < chunk_size:
        return [{"id": "chunk-1", "page": 1, "text": text.strip(), "score": 1.0}]
    positions = [0, total // 2, max(0, total - chunk_size)]
    snippets = []
    for i, pos in enumerate(positions[:max_snippets]):
        excerpt = text[pos:pos + chunk_size].strip()
        if excerpt:
            snippets.append({
                "id": f"chunk-{i+1}",
                "page": (pos // 2000) + 1,
                "text": excerpt,
                "score": round(0.9 - i * 0.1, 2),
            })
    return snippets


# Pydantic schemas

class DebateRequest(BaseModel):
    message: str
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: str


# RAM CACHE for FAISS indexes ONLY
# DynamoDB persists everything except the FAISS index (too big, > 400 KB).
# We keep a RAM cache for the index, keyed by session_id. If the server
# restarts, this cache is empty and the index is rebuilt from document_text.

faiss_cache: dict[str, RAGIndex] = {}


def get_or_rebuild_rag_index(session_id: str, session_data: dict) -> RAGIndex:
    """
    Returns the FAISS index for this session.
    Rebuilds from document_text if not in cache (e.g. after server restart).
    """
    if session_id in faiss_cache:
        return faiss_cache[session_id]

    print(f"[FAISS CACHE MISS] Rebuilding index for session {session_id}")
    document_text = session_data.get("document_text", "")
    if not document_text:
        raise HTTPException(
            status_code=500,
            detail="Cannot rebuild FAISS index: no document text in session."
        )

    pseudo_pages = [{"page": 1, "text": document_text}]
    rag_index = RAGIndex.from_pages_documents([
        {
            "filename": session_data.get("filename", "document.pdf"),
            "pages": pseudo_pages,
        }
    ])
    faiss_cache[session_id] = rag_index
    return rag_index


# Route 1: POST /upload

@app.post("/upload")
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[UPLOAD] Received: {file.filename} (session: {session_id})")

    pdf_bytes = await file.read()
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
        {"filename": file.filename, "pages": pages}
    ])
    print(f"[UPLOAD] RAG index created with {len(rag_index.chunks)} chunks "
          f"(config: {rag_index.config})")

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
    opening = call_luxia(prompt, system_instruction=system)

    # Cache FAISS index in RAM
    faiss_cache[session_id] = rag_index

    # Persist everything else in DynamoDB
    session_data = {
        "filename": file.filename,
        "filenames": [file.filename],
        "document_text": document_text,
        "ai_position": opening,
        "history": [{"role": "ai", "text": opening}],
    }
    save_session(session_id, session_data)

    return {
        "session_id": session_id,
        "opening_statement": opening,
    }


# Route 1.2: POST /upload-multiple

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
        raise HTTPException(status_code=400, detail="Upload at least one PDF file.")

    print(f"[UPLOAD-MULTIPLE] Received {len(files)} file(s) (session: {session_id})")

    documents = []
    document_text_parts = []

    for file in files:
        print(f"[UPLOAD-MULTIPLE] Reading: {file.filename}")
        pdf_bytes = await file.read()
        pages = extract_pdf_pages(pdf_bytes)
        text = "\n\n".join(page["text"] for page in pages)

        if not text:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to extract text from PDF: {file.filename}"
            )

        documents.append({"filename": file.filename, "text": text, "pages": pages})
        document_text_parts.append(f"\n\n===== DOCUMENT: {file.filename} =====\n\n{text}")

    document_text = "\n".join(document_text_parts)
    print(f"[UPLOAD-MULTIPLE] Total extracted text: {len(document_text)} characters")

    rag_index = RAGIndex.from_pages_documents(documents)
    print(f"[UPLOAD-MULTIPLE] RAG index created with {len(rag_index.chunks)} chunks "
          f"(config: {rag_index.config})")

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
    opening = call_luxia(prompt, system_instruction=system)

    faiss_cache[session_id] = rag_index

    session_data = {
        "filename": files[0].filename,
        "filenames": [doc["filename"] for doc in documents],
        "document_text": document_text,
        "ai_position": opening,
        "history": [{"role": "ai", "text": opening}],
    }
    save_session(session_id, session_data)

    return {
        "session_id": session_id,
        "filenames": [doc["filename"] for doc in documents],
        "opening_statement": opening,
    }


# Route 2: POST /debate

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] Message received: {req.message[:80]}...")

    # 1. Load session from DynamoDB
    session_data = load_session(req.session_id)
    if not session_data:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Did you upload a document first?"
        )

    # 2. Get FAISS index from RAM cache (or rebuild from document_text)
    rag_index = get_or_rebuild_rag_index(req.session_id, session_data)

    history = session_data.get("history", [])
    ai_position = session_data.get("ai_position", "")

    # 3. Run the agent
    agent_result = debate_agent.process_turn(
        user_message=req.message,
        history=history,
        rag_index=rag_index,
        ai_position=ai_position,
    )

    ai_response = agent_result["response"]

    # 4. Append the new turn to history
    session_data["history"].append({"role": "user", "text": req.message})
    session_data["history"].append({"role": "ai", "text": ai_response})

    # 5. Persist updated session in DynamoDB
    save_session(req.session_id, session_data)

    print("[AGENT RESULT]", agent_result)

    return {
        "response": ai_response,
        "audio_url": None,
        "evidence": agent_result["evidence"],
        "fallacy": agent_result["fallacy"],
        "strategy": agent_result["strategy"],
        "agent_actions": agent_result["agent_actions"],
        "session_id": req.session_id,
    }


# Route 3: POST /end-session

FEEDBACK_PROMPT_TEMPLATE = """You are an experienced debate coach.

Below is the transcript of a debate between a USER and an AI debate assistant based on a source document.

Transcript:
{transcript}

Your task is to evaluate ONLY the USER's debate performance. Do not critique the AI debater except where necessary to explain the user's missed opportunities.

Write feedback with the following sections:

1. Summary (2-3 sentences)
   - Briefly summarize the debate.
   - Identify the user's main arguments and strategy.

2. Strengths
   - Identify 2-3 things the user did well.
   - Reference specific arguments or moments from the transcript.

3. Areas for Improvement
   - Focus on weaknesses in reasoning, evidence, rebuttal quality, or engagement with the document.
   - If you identify a logical fallacy, only label it if there is clear evidence for that specific fallacy. Only mention the fallacy if the transcript itself clearly supports the classification. Otherwise ignore the label.
   - Do NOT speculate or force a fallacy label.
   - Prefer explaining why an argument was weak rather than naming a fallacy.
   - Distinguish between:
       * unsupported claims,
       * weak evidence,
       * missed opportunities,
       * logical fallacies,
       * repetition.

4. Suggestions
   - Give 1-2 concrete ways the user could improve future debates.

5. Ratings (1-10)
   - Clarity
   - Use of Evidence
   - Rebuttal Quality
   - Engagement with Opponent's Arguments
   - Logical Rigor

For each rating, provide a brief one-sentence justification.

Guidelines:
- Base all feedback strictly on the transcript.
- Cite specific examples from the user's arguments.
- Do not invent evidence or claims.
- Do not criticize the user for failing to make arguments that were impossible given the transcript.
- Automatically generated fallacy labels may be present in the transcript. Treat them as unreliable signals and verify them against the user's actual statements before mentioning them.
- Be constructive, specific, and encouraging.
- Keep total feedback under 200 words.
"""

SCORE_PROMPT_TEMPLATE = """Based on this debate transcript, give two scores from 0-100:
- user_score: how well the human user performed in the debate
- ai_score: how well the AI debater performed

Transcript:
{transcript}

Respond ONLY in valid JSON with this structure and nothing else:
{{"user_score": <int 0-100>, "ai_score": <int 0-100>}}
"""


@app.post("/end-session")
async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] Ending session: {req.session_id}")

    session_data = load_session(req.session_id)
    if not session_data or not session_data.get("history"):
        return {
            "score": {"user": 0, "ai": 0},
            "summary": "No debate to analyze.",
            "transcript_url": None,
        }

    transcript = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
        for msg in session_data["history"]
    )

    # 1. Detailed qualitative feedback (free-form prose)
    feedback_prompt = FEEDBACK_PROMPT_TEMPLATE.format(transcript=transcript)
    summary = call_luxia(feedback_prompt)

    # 2. Separate numeric scoring (kept as its own JSON-only call for reliability)
    score_prompt = SCORE_PROMPT_TEMPLATE.format(transcript=transcript)
    raw_score = call_luxia(score_prompt)

    cleaned = raw_score.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        user_score = int(data.get("user_score", 50))
        ai_score = int(data.get("ai_score", 50))
    except (json.JSONDecodeError, ValueError):
        print(f"[END-SESSION] Invalid score JSON received: {raw_score}")
        user_score, ai_score = 50, 50

    return {
        "score": {"user": user_score, "ai": ai_score},
        "summary": summary,
        "transcript_url": None,
    }


# Root route

@app.get("/")
async def root():
    return {
        "status": "DebateCoach backend is running",
        "model": LUXIA_MODEL,
        "active_faiss_indexes": len(faiss_cache),
        "rag_mode": "FAISS + Luxia embeddings/chunking, sessions in DynamoDB",
    }