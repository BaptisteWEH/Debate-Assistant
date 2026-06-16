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
from services.file_store import upload_pdf, upload_faiss_index, download_faiss_index

load_dotenv()

LUXIA_API_KEY = os.getenv("LUXIA_API_KEY")
if not LUXIA_API_KEY:
    raise RuntimeError(
        "LUXIA_API_KEY not found. Make sure backend/.env exists and contains LUXIA_API_KEY."
    )

LUXIA_MODEL = "luxia3-llm-8b-0731"
LUXIA_CHAT_URL = "https://bridge.luxiacloud.com/luxia/v1/chat"

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", ""),
]

app = FastAPI(title="DebateCoach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

debate_agent = DebateAgent(luxia_api_key=LUXIA_API_KEY, model_name=LUXIA_MODEL)

# ─── Level-specific scoring criteria (used only in /end-session) ───────────────

LEVEL_PROMPTS = {
    "easy": {
        "scoring": (
            "Evaluate the user on these THREE dimensions only:\n"
            "- Claim Clarity (35%): how precisely they stated their position\n"
            "- Evidence Integration (35%): whether they cited the document\n"
            "- Logical Structure (30%): whether their argument was coherent\n"
        ),
    },
    "intermediate": {
        "scoring": (
            "Evaluate the user on these FIVE dimensions:\n"
            "- Claim Clarity (20%): how precisely they stated their position\n"
            "- Evidence Integration (20%): whether they cited the document\n"
            "- Logical Structure (20%): whether their argument was coherent\n"
            "- Rebuttal Quality (25%): how effectively they countered the AI's specific claims\n"
            "- Consistency (15%): whether their position stayed coherent across rounds\n"
        ),
    },
    "hard": {
        "scoring": (
            "Evaluate the user on these SIX dimensions:\n"
            "- Claim Clarity (15%): how precisely they stated their position\n"
            "- Evidence Integration (15%): whether they cited specific document passages\n"
            "- Logical Structure (15%): whether their argument followed coherent cause-and-effect reasoning\n"
            "- Rebuttal Quality (20%): how effectively they countered the AI's specific claims\n"
            "- Consistency (15%): whether their position stayed coherent across all rounds\n"
            "- Rhetorical Depth (20%): sophistication of persuasion - analogy, ethos, pathos, rhetorical register\n"
        ),
    },
}

# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class DebateRequest(BaseModel):
    message: str
    session_id: str
    regenerate: bool = False


class EndSessionRequest(BaseModel):
    session_id: str


class SendReportRequest(BaseModel):
    email: str
    result: dict


# ─── RAM cache for FAISS indexes + in-memory session fallback ─────────────────

faiss_cache: dict[str, RAGIndex] = {}
sessions: dict = {}           # fallback when DynamoDB credentials not available
user_sessions: dict[str, list[str]] = {}  # user_id → [session_ids] fallback


# ─── Helpers ───────────────────────────────────────────────────────────────────

def call_luxia(prompt: str, system_instruction: str | None = None, retries: int = 5, timeout: int = 30) -> str:
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
                timeout=timeout,
            )
            if response.status_code == 429:
                print(f"[LUXIA 429] sleeping {wait_time:.1f}s...")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2
                continue
            if not response.ok:
                print(f"[LUXIA HTTP {response.status_code}] {response.text[:300]}")
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            print(f"[LUXIA ERROR] attempt={attempt+1} {e}")
            time.sleep(wait_time + random.uniform(0, 0.5))
            wait_time *= 2
    raise HTTPException(status_code=500, detail="Luxia error after retries")


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


def _persist_session(session_id: str, session: dict) -> None:
    sessions[session_id] = session  # always keep in memory
    user_id = session.get("user_id")
    if user_id:
        if user_id not in user_sessions:
            user_sessions[user_id] = []
        if session_id not in user_sessions[user_id]:
            user_sessions[user_id].append(session_id)
    try:
        save_session(session_id, session)
    except Exception as e:
        print(f"[DDB WARN] Falling back to in-memory for session {session_id}: {e}")


def _load_session(session_id: str) -> dict | None:
    try:
        data = load_session(session_id)
        if data:
            sessions[session_id] = data
            return data
    except Exception as e:
        print(f"[DDB WARN] Falling back to in-memory for session {session_id}: {e}")
    return sessions.get(session_id)


def get_or_rebuild_rag_index(session_id: str, session_data: dict) -> RAGIndex:
    if session_id in faiss_cache:
        return faiss_cache[session_id]

    print(f"[FAISS CACHE MISS] Trying S3 for session {session_id}")
    try:
        rag_index = download_faiss_index(session_id)
        if rag_index is not None:
            faiss_cache[session_id] = rag_index
            return rag_index
    except Exception as e:
        print(f"[S3 RELOAD WARNING] {e}")

    print(f"[FAISS REBUILD] Rebuilding from document_text for session {session_id}")
    document_text = session_data.get("document_text", "")
    if not document_text:
        raise HTTPException(
            status_code=500,
            detail="Cannot rebuild FAISS index: no document text in session.",
        )
    pseudo_pages = [{"page": 1, "text": document_text}]
    rag_index = RAGIndex.from_pages_documents([
        {"filename": session_data.get("filename", "document.pdf"), "pages": pseudo_pages}
    ])
    faiss_cache[session_id] = rag_index
    try:
        upload_faiss_index(session_id, rag_index)
    except Exception as e:
        print(f"[S3 SAVE WARNING] {e}")
    return rag_index


def generate_feedback(session_data: dict) -> dict:
    """Minimal feedback payload used for mid-debate email sends."""
    return {
        "score": {"user": 0, "ai": 0},
        "summary": "Your full results will be available when you end the debate session.",
    }


# ─── POST /upload ──────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload(
    session_id: str = Form(...),
    level: str = Form("easy"),
    user_id: str = Form(None),
    file1: UploadFile = File(None),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
):
    raw_files = [f for f in [file1, file2, file3, file4, file5] if f is not None]
    if not raw_files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required.")

    _, difficulty_cfg = get_difficulty_config(level)
    print(f"[UPLOAD] session={session_id} level={level} user_id={user_id} files={[f.filename for f in raw_files]}")

    documents = []
    all_text_parts = []
    filenames = []

    for f in raw_files:
        pdf_bytes = await f.read()
        try:
            upload_pdf(session_id, f.filename, pdf_bytes)
        except Exception as e:
            print(f"[S3 SAVE WARNING] Could not save PDF to S3: {e}")
        pages = extract_pdf_pages(pdf_bytes)
        for p in pages:
            p["text"] = clean_text(p["text"])
        if pages:
            documents.append({"filename": f.filename, "pages": pages})
            all_text_parts.append("\n\n".join(p["text"] for p in pages))
            filenames.append(f.filename)

    if not documents:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from any of the uploaded PDFs.",
        )

    all_text = "\n\n".join(all_text_parts)

    rag_index = RAGIndex.from_pages_documents(documents)
    print(f"[UPLOAD] RAG index built: {len(rag_index.chunks)} chunks")
    faiss_cache[session_id] = rag_index

    try:
        upload_faiss_index(session_id, rag_index)
    except Exception as e:
        print(f"[S3 SAVE WARNING] Could not save FAISS index: {e}")

    opening_result = debate_agent.generate_opening_stance(rag_index, difficulty_cfg)
    opening = opening_result["response"]

    import datetime
    session_data = {
        "session_id": session_id,
        "filename": filenames[0] if filenames else "",
        "filenames": filenames,
        "document_text": all_text,
        "level": level,
        "ai_position": opening,
        "history": [{"role": "ai", "text": opening}],
        "topic_summary": opening[:120],
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    if user_id:
        session_data["user_id"] = user_id

    _persist_session(session_id, session_data)

    return {"session_id": session_id, "opening_statement": opening}


# ─── POST /debate ──────────────────────────────────────────────────────────────

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] session={req.session_id} msg={req.message[:80]}...")

    session = _load_session(req.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Did you upload a document first?",
        )
    session["session_id"] = req.session_id

    rag_index = get_or_rebuild_rag_index(req.session_id, session)
    _, difficulty_cfg = get_difficulty_config(session.get("level", "easy"))

    result = debate_agent.process_turn(
        user_message=req.message,
        history=session["history"],
        rag_index=rag_index,
        ai_position=session["ai_position"],
        session_data=session,
        feedback_fn=generate_feedback,
        difficulty_cfg=difficulty_cfg,
        regenerate=req.regenerate,
    )

    session["history"].append({"role": "user", "text": req.message})
    session["history"].append({"role": "ai", "text": result["response"]})
    _persist_session(req.session_id, session)

    session_feedback = None
    if result.get("agent_decision") == "end_debate":
        try:
            session_feedback = _build_end_session_feedback(session)
        except Exception as e:
            print(f"[DEBATE END-FEEDBACK ERROR] {e}")
            session_feedback = {"score": {"user": 50, "ai": 50}, "summary": "Debate complete, but detailed analysis is temporarily unavailable.", "dimensions": {}, "qualitative": {}}

    return {
        "response": result["response"],
        "audio_url": None,
        "evidence": result.get("evidence", []),
        "fallacy": result.get("fallacy", {}),
        "agent_decision": result.get("agent_decision", "continue_debate"),
        "agent_reason": result.get("agent_reason", ""),
        "strategy": result.get("strategy", ""),
        "pipeline_steps": result.get("pipeline_steps", []),
        "session_id": req.session_id,
        "session_feedback": session_feedback,
    }


# ─── POST /transcribe ──────────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), session_id: str = Form(...)):
    return {
        "transcript": "Placeholder transcript. AWS Transcribe coming in step 4."
    }


# ─── POST /end-session ─────────────────────────────────────────────────────────

@app.post("/end-session")
async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] session={req.session_id}")
    session = _load_session(req.session_id)
    if not session or not session.get("history"):
        return {"score": {"user": 0, "ai": 0}, "summary": "No debate to analyse.", "dimensions": {}, "qualitative": {}, "transcript_url": None}
    try:
        return _build_end_session_feedback(session)
    except Exception as e:
        print(f"[END-SESSION ERROR] {e}")
        return {"score": {"user": 50, "ai": 50}, "summary": "Debate complete, but detailed analysis is temporarily unavailable.", "dimensions": {}, "qualitative": {}, "transcript_url": None}


def _build_end_session_feedback(session: dict) -> dict:
    level = session.get("level", "easy")
    level_key = "intermediate" if level == "intermediate" else level
    scoring_criteria = LEVEL_PROMPTS.get(level_key, LEVEL_PROMPTS["easy"])["scoring"]
    _, difficulty_cfg = get_difficulty_config(level)

    all_turns = [
        f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
        for msg in session["history"]
    ]
    transcript = "\n".join(all_turns)
    if len(transcript) > 3000:
        # Keep most recent turns — they reflect the user's developed arguments
        recent = []
        chars = 0
        for turn in reversed(all_turns):
            if chars + len(turn) > 3000:
                break
            recent.insert(0, turn)
            chars += len(turn)
        transcript = "[Earlier turns omitted]\n" + "\n".join(recent)
    document_text = session.get("document_text", "")

    system = (
        "You are an expert debate coach evaluating the USER's performance only. "
        "Every field in your response must describe the user — their arguments, their strengths, their weaknesses. "
        "Never describe the AI's performance. "
        "Reply ONLY with valid JSON - no markdown, no explanation."
    )
    prompt = (
        f"Reference document (excerpt):\n---\n{document_text[:800]}...\n---\n\n"
        f"Full debate transcript:\n{transcript}\n\n"
        f"Difficulty level: {level.upper()}\n\n"
        f"Score the user based on these dimensions:\n{scoring_criteria}\n\n"
        f"Feedback focus: {difficulty_cfg['feedback_focus']}\n\n"
        "Reply ONLY with this exact JSON structure:\n"
        "{\n"
        '  "user_score": <overall 0-100 weighted by dimension weights>,\n'
        '  "ai_score": <overall 0-100>,\n'
        '  "summary": "<2-3 sentences with concrete tips for improvement>",\n'
        '  "dimensions": {\n'
        '    "claim_clarity": <0-100 or null if not scored at this level>,\n'
        '    "evidence_integration": <0-100 or null>,\n'
        '    "logical_structure": <0-100 or null>,\n'
        '    "rebuttal_quality": <0-100 or null>,\n'
        '    "consistency": <0-100 or null>,\n'
        '    "rhetorical_depth": <0-100 or null>\n'
        '  },\n'
        '  "qualitative": {\n'
        '    "strongest_argument": "<quote the exact sentence or phrase the user said that was their strongest argument, then in one sentence explain why it was effective>",\n'
        '    "weakest_point": "<1-2 sentences about where the user\'s reasoning was weakest>",\n'
        '    "missed_opportunity": "<1-2 sentences about a strong counter the user could have made but didn\'t>",\n'
        '    "argument_pattern": "<1-2 sentences about a recurring pattern or habit in how the user argues>",\n'
        '    "ai_assessment": "<1-2 sentences giving an overall verdict on the user\'s debate performance and what they should work on next>"\n'
        '  }\n'
        "}"
    )

    raw = call_luxia(prompt, system_instruction=system, timeout=90)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        user_score = int(data.get("user_score") or 0)
        ai_score = int(data.get("ai_score") or 0)
        summary = data.get("summary", "Analysis unavailable.")
        dimensions = data.get("dimensions", {})
        qualitative = data.get("qualitative", {})
    except (json.JSONDecodeError, ValueError, TypeError):
        print(f"[END-SESSION] Invalid JSON from Luxia: {raw}")
        user_score, ai_score = 50, 50
        summary = "The debate went well, but the detailed analysis could not be generated."
        dimensions = {}
        qualitative = {}

    return {
        "score": {"user": user_score, "ai": ai_score},
        "summary": summary,
        "dimensions": dimensions,
        "qualitative": qualitative,
        "transcript_url": None,
    }


# ─── POST /send-report ─────────────────────────────────────────────────────────

@app.post("/send-report")
async def send_report(req: SendReportRequest):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    sender = os.getenv("SMTP_EMAIL")
    app_password = os.getenv("SMTP_APP_PASSWORD")
    if not sender or not app_password:
        raise HTTPException(status_code=500, detail="Email not configured.")

    result = req.result
    user_score = result.get("user_score", result.get("score", {}).get("user", 0))
    ai_score   = result.get("ai_score",   result.get("score", {}).get("ai",   0))
    dimensions = result.get("dimensions", {})
    qualitative = result.get("qualitative", {})

    dim_lines = "\n".join(
        f"  {k.replace('_', ' ').title()}: {v}/100"
        for k, v in dimensions.items() if v is not None
    )

    body = (
        f"Your DebateCoach Report\n\n"
        f"Score: {user_score}/100\n\n"
        f"Summary:\n{result.get('summary', '')}\n\n"
        f"Dimension Scores:\n{dim_lines}\n\n"
        f"Strongest Argument:\n{qualitative.get('strongest_argument', '')}\n\n"
        f"Weakest Point:\n{qualitative.get('weakest_point', '')}\n\n"
        f"Missed Opportunity:\n{qualitative.get('missed_opportunity', '')}\n\n"
        f"- DebateCoach\n"
    )

    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = req.email
    msg["Subject"] = "Your DebateCoach Report"
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender, app_password)
            server.send_message(msg)
        return {"success": True}
    except Exception as e:
        print(f"[SEND-REPORT ERROR] {e}")
        return {"success": False}


# ─── GET /history/{user_id} ────────────────────────────────────────────────────

@app.get("/history/{user_id}")
async def get_history(user_id: str):
    # Try DynamoDB first
    try:
        import boto3
        from botocore.exceptions import ClientError
        dynamodb = boto3.resource(
            "dynamodb",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        table = dynamodb.Table("DebateSessions")
        response = table.query(
            IndexName="user_id-created_at-index",
            KeyConditionExpression="user_id = :uid",
            ExpressionAttributeValues={":uid": user_id},
            ScanIndexForward=False,
        )
        items = response.get("Items", [])
        return [
            {
                "session_id": item["session_id"],
                "topic_summary": item.get("topic_summary", "Debate session"),
                "created_at": item.get("created_at", ""),
                "level": item.get("level", "easy"),
                "filenames": item.get("filenames", []),
            }
            for item in items
        ]
    except Exception as e:
        print(f"[HISTORY] DynamoDB unavailable, using in-memory fallback: {e}")

    # In-memory fallback
    session_ids = user_sessions.get(user_id, [])
    result = []
    for sid in reversed(session_ids):
        s = sessions.get(sid)
        if s:
            result.append({
                "session_id": sid,
                "topic_summary": s.get("topic_summary", "Debate session"),
                "created_at": s.get("created_at", ""),
                "level": s.get("level", "easy"),
                "filenames": s.get("filenames", []),
            })
    return result


# ─── GET / ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status": "DebateCoach backend is running",
        "model": LUXIA_MODEL,
        "active_faiss_indexes": len(faiss_cache),
        "rag_mode": "FAISS + Luxia embeddings, sessions in DynamoDB, files in S3",
        "difficulty_levels": list(DIFFICULTY_CONFIG.keys()),
    }
