# main.py
import os
import io
import re
import json
import time
import random
import requests
import unicodedata
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from services.rag_service import RAGIndex
from services.agent_service import DebateAgent, DIFFICULTY_CONFIG, get_difficulty_config
from services.session_store import save_session, load_session
from services.file_store import (
    upload_pdf,
    upload_faiss_index,
    download_faiss_index,
)


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

def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\x00", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()

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

    Lookup order:
    1. RAM cache (fastest, free)
    2. S3 (slower but avoids re-embedding the whole document)
    3. Rebuild from document_text in DynamoDB (last resort, costs Luxia calls)
    """
    # 1. RAM cache hit: return immediately
    if session_id in faiss_cache:
        return faiss_cache[session_id]

    # 2. Try to download the saved index from S3
    print(f"[FAISS CACHE MISS] Trying to reload index from S3 for session {session_id}")
    try:
        rag_index = download_faiss_index(session_id)
        if rag_index is not None:
            faiss_cache[session_id] = rag_index
            return rag_index
    except Exception as e:
        print(f"[S3 RELOAD WARNING] Could not reload from S3, will rebuild. Reason: {e}")

    # 3. Last resort: rebuild the index from document_text stored in DynamoDB
    print(f"[FAISS REBUILD] Rebuilding index from document_text for session {session_id}")
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

    # Save the freshly rebuilt index back to S3 so we don't redo this work
    try:
        upload_faiss_index(session_id, rag_index)
    except Exception as e:
        print(f"[S3 SAVE WARNING] Could not save rebuilt index to S3: {e}")

    return rag_index


def get_session_difficulty_cfg(session_data: dict) -> dict:
    """
    Returns the DIFFICULTY_CONFIG entry for this session.
    Falls back to 'medium' for older sessions created before
    difficulty was tracked.
    """
    difficulty = session_data.get("difficulty", "medium")
    _, cfg = get_difficulty_config(difficulty)
    return cfg


def generate_session_feedback(session_data: dict) -> dict:
    """Shared logic: generates feedback + score from session history.
    Returns the same shape as /end-session's response body."""
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

    difficulty_cfg = get_session_difficulty_cfg(session_data)

    feedback_prompt = FEEDBACK_PROMPT_TEMPLATE.format(
        transcript=transcript,
        feedback_focus=difficulty_cfg["feedback_focus"],
    )
    summary = call_luxia(feedback_prompt)

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
        print(f"[FEEDBACK] Invalid score JSON received: {raw_score}")
        user_score, ai_score = 50, 50

    return {
        "score": {"user": user_score, "ai": ai_score},
        "summary": summary,
        "transcript_url": None,
    }


# Route 1: POST /upload (5 files)

@app.post("/upload")
async def upload(
    session_id: str = Form(...),
    difficulty: str = Form("medium"),
    file1: UploadFile | None = File(None),
    file2: UploadFile | None = File(None),
    file3: UploadFile | None = File(None),
    file4: UploadFile | None = File(None),
    file5: UploadFile | None = File(None),
):
    files = [f for f in [file1, file2, file3, file4, file5] if f is not None]

    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one PDF file.")

    difficulty, difficulty_cfg = get_difficulty_config(difficulty)
    print(f"[UPLOAD] Received {len(files)} file(s) (session: {session_id}, difficulty: {difficulty})")

    documents = []
    document_text_parts = []

    for file in files:
        print(f"[UPLOAD] Reading: {file.filename}")
        pdf_bytes = await file.read()

        # Persist the original PDF in S3 (archive + fallback)
        try:
            upload_pdf(session_id, file.filename, pdf_bytes)
        except Exception as e:
            print(f"[S3 SAVE WARNING] Could not save PDF to S3: {e}")

        pages = extract_pdf_pages(pdf_bytes)
        for p in pages:
            p["text"] = clean_text(p["text"])
        text = "\n\n".join(page["text"] for page in pages)

        if not text:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to extract text from PDF: {file.filename}"
            )

        documents.append({"filename": file.filename, "text": text, "pages": pages})
        document_text_parts.append(f"\n\n===== DOCUMENT: {file.filename} =====\n\n{text}")

    document_text = "\n".join(document_text_parts)
    print(f"[UPLOAD] Total extracted text: {len(document_text)} characters")

    rag_index = RAGIndex.from_pages_documents(documents)
    print(f"[UPLOAD] RAG index created with {len(rag_index.chunks)} chunks "
          f"(config: {rag_index.config})")

    # Persist the FAISS index in S3 so we can reload it without re-embedding
    try:
        upload_faiss_index(session_id, rag_index)
    except Exception as e:
        print(f"[S3 SAVE WARNING] Could not save FAISS index to S3: {e}")

    # Generate the AI's opening stance via RAG retrieval over the uploaded
    # document(s), using the persona for the chosen difficulty.
    opening_result = debate_agent.generate_opening_stance(rag_index, difficulty_cfg)
    opening = opening_result["response"]

    faiss_cache[session_id] = rag_index

    session_data = {
        "filename": files[0].filename,
        "filenames": [doc["filename"] for doc in documents],
        "document_text": document_text,
        "difficulty": difficulty,
        "ai_position": opening,
        "history": [{"role": "ai", "text": opening}],
    }
    save_session(session_id, session_data)

    return {
        "session_id": session_id,
        "filenames": [doc["filename"] for doc in documents],
        "difficulty": difficulty,
        "opening_statement": opening,
    }


# Route 2: POST /debate

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] Message received: {req.message[:80]}...")

    # 1. Load session from DynamoDB
    session_data = load_session(req.session_id)
    session_data["session_id"] = req.session_id
    if not session_data:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Did you upload a document first?"
        )

    # 2. Get FAISS index from RAM cache (or rebuild from document_text)
    rag_index = get_or_rebuild_rag_index(req.session_id, session_data)

    history = session_data.get("history", [])
    ai_position = session_data.get("ai_position", "")
    difficulty_cfg = get_session_difficulty_cfg(session_data)

    # 3. Run the agent
    agent_result = debate_agent.process_turn(
        user_message=req.message,
        history=history,
        rag_index=rag_index,
        ai_position=ai_position,
        session_data=session_data,
        feedback_fn=generate_session_feedback,
        difficulty_cfg=difficulty_cfg,
    )

    ai_response = agent_result["response"]

    # 4. Append the new turn to history
    session_data["history"].append({"role": "user", "text": req.message})
    session_data["history"].append({"role": "ai", "text": ai_response})

    # 5. Persist updated session in DynamoDB
    save_session(req.session_id, session_data)

    print("[AGENT RESULT]", agent_result)

    response_body = {
            "response": ai_response,
            "audio_url": None,
            "evidence": agent_result["evidence"],
            "fallacy": agent_result["fallacy"],
            "strategy": agent_result["strategy"],
            "agent_decision": agent_result["agent_decision"],
            "agent_reason": agent_result["agent_reason"],
            "pipeline_steps": agent_result["pipeline_steps"],
            "session_id": req.session_id,
            "session_feedback": None,
        }

    if agent_result["agent_decision"] == "end_debate":
        response_body["session_feedback"] = generate_session_feedback(session_data)

    return response_body


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

{feedback_focus}

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

#decomment if we want to add a button to end the debate and get feedback in the frontend
"""async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] Ending session: {req.session_id}")
    session_data = load_session(req.session_id)
    return generate_session_feedback(session_data)"""


# Root route

@app.get("/")
async def root():
    return {
        "status": "DebateCoach backend is running",
        "model": LUXIA_MODEL,
        "active_faiss_indexes": len(faiss_cache),
        "rag_mode": "FAISS + Luxia embeddings/chunking, sessions in DynamoDB, files in S3",
        "difficulty_levels": list(DIFFICULTY_CONFIG.keys()),
    }