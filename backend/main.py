import os
import io
import json
import requests
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader

from services.rag_service import RAGIndex
from services.agent_service import DebateAgent
from services.session_store import save_session, load_session

load_dotenv()

LUXIA_API_KEY = os.getenv("LUXIA_API_KEY")
if not LUXIA_API_KEY:
    raise RuntimeError(
        "LUXIA_API_KEY not found. Make sure backend/.env exists and contains LUXIA_API_KEY."
    )

LUXIA_URL   = "https://bridge.luxiacloud.com/luxia/v1/chat"
LUXIA_MODEL = "luxia3-llm-32b-0731"
AGENT_MODEL = "luxia3-llm-8b-0731"


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="DebateCoach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = DebateAgent(luxia_api_key=LUXIA_API_KEY, model_name=AGENT_MODEL)


# ─── Level-specific prompts (based on rubric) ──────────────────────────────────

LEVEL_PROMPTS = {
    "easy": {
        "opening": (
            "You are a Supportive Guide helping a student practice debating. "
            "Use simple vocabulary. Take a clear position on the document's thesis "
            "and invite the user to respond. Be encouraging and accessible. "
            "Keep your opening to 2-3 sentences."
        ),
        "debate": (
            "You are a Supportive Guide. Use simple vocabulary. "
            "Ask exactly ONE question per response to help the user develop their thinking. "
            "Do NOT introduce counter-arguments — focus on helping the user articulate "
            "and strengthen their own position. Respond in 2-3 sentences. "
            "Reference the document where helpful."
        ),
        "scoring": (
            "Evaluate the user on these THREE dimensions only:\n"
            "- Claim Clarity (35%): how precisely they stated their position\n"
            "- Evidence Integration (35%): whether they cited the document\n"
            "- Logical Structure (30%): whether their argument was coherent\n"
        ),
    },
    "intermediate": {
        "opening": (
            "You are an Analytical Challenger. Take the strongest position "
            "FOR or AGAINST the document's thesis and signal that you will "
            "challenge the user's reasoning. Keep your opening to 2-3 sentences."
        ),
        "debate": (
            "You are an Analytical Challenger. Introduce counter-arguments that "
            "directly test the user's reasoning. Expect them to engage with your "
            "opposing claims rather than simply restating their position. "
            "Respond in 2-4 sentences. Draw on the reference document."
        ),
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
        "opening": (
            "You are a Rigorous Adversary. Take the strongest possible position "
            "on the document's thesis. Make clear you will hold the user to the "
            "highest standard of argumentation with no concessions. 2-3 sentences."
        ),
        "debate": (
            "You are a Rigorous Adversary. Use the document as a weapon — find "
            "passages that contradict the user's claims. Exploit vague language, "
            "logical gaps, and inconsistencies without concession. Demand rhetorical "
            "precision. Never concede unless the user's argument is airtight. "
            "Respond in 2-4 sentences. Be direct and unrelenting."
        ),
        "scoring": (
            "Evaluate the user on these SIX dimensions:\n"
            "- Claim Clarity (15%): how precisely they stated their position\n"
            "- Evidence Integration (15%): whether they cited specific document passages\n"
            "- Logical Structure (15%): whether their argument followed coherent cause-and-effect reasoning\n"
            "- Rebuttal Quality (20%): how effectively they countered the AI's specific claims\n"
            "- Consistency (15%): whether their position stayed coherent across all rounds\n"
            "- Rhetorical Depth (20%): sophistication of persuasion — analogy, ethos, pathos, rhetorical register\n"
        ),
    },
}


# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class DebateRequest(BaseModel):
    message: str
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: str


# ─── In-memory session store ───────────────────────────────────────────────────
# RAGIndex (FAISS) cannot be serialised to DynamoDB, so we always keep it here.
# DynamoDB is used for durable metadata (history, positions, filenames).

sessions: dict[str, dict] = {}


# ─── Helpers ───────────────────────────────────────────────────────────────────

def call_luxia(prompt: str, system_instruction: str | None = None) -> str:
    messages = []
    if system_instruction:
        full_prompt = f"{system_instruction}\n\n{prompt}"
        messages.append({"role": "user", "content": full_prompt})
    else:
        messages.append({"role": "user", "content": prompt})

    try:
        response = requests.post(
            LUXIA_URL,
            headers={"apikey": LUXIA_API_KEY, "Content-Type": "application/json"},
            json={"model": LUXIA_MODEL, "messages": messages},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except requests.exceptions.RequestException as e:
        print(f"[LUXIA ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Luxia error: {str(e)}")
    except (KeyError, IndexError) as e:
        print(f"[LUXIA PARSE ERROR] {e}")
        raise HTTPException(status_code=500, detail="Unexpected response format from Luxia.")


def extract_pdf_pages(pdf_bytes: bytes, filename: str) -> list[dict]:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages.append({"page_num": i + 1, "text": text.strip()})
        return pages
    except Exception as e:
        print(f"[PDF ERROR] {filename}: {e}")
        return []


def _persist_session(session_id: str, session: dict) -> None:
    try:
        save_session(session_id, session)
    except Exception as e:
        print(f"[DDB WARN] Could not persist session {session_id}: {e}")


def generate_feedback(session_data: dict) -> dict:
    """Quick feedback payload used for email sending mid-debate."""
    return {
        "score": {"user": 0, "ai": 0},
        "summary": "Your full results will be available when you end the debate session.",
    }


# ─── POST /upload ──────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload(
    session_id: str = Form(...),
    level: str = Form("easy"),
    # Accept single 'file' (legacy) or up to 5 named files
    file:  UploadFile = File(None),
    file1: UploadFile = File(None),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
):
    level = level if level in LEVEL_PROMPTS else "easy"

    # Collect whichever files were sent
    raw_files = [f for f in [file, file1, file2, file3, file4, file5] if f is not None]
    if not raw_files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required.")

    print(f"[UPLOAD] session={session_id}  level={level}  files={[f.filename for f in raw_files]}")

    documents = []
    all_text_parts = []
    filenames = []

    for f in raw_files:
        pdf_bytes = await f.read()
        pages = extract_pdf_pages(pdf_bytes, f.filename)
        if pages:
            documents.append({"filename": f.filename, "pages": pages})
            all_text_parts.append("\n\n".join(p["text"] for p in pages))
            filenames.append(f.filename)

    if not documents:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from any of the uploaded PDFs. Make sure they contain selectable text.",
        )

    all_text = "\n\n".join(all_text_parts)

    # Build FAISS RAG index
    rag_index = None
    try:
        rag_index = RAGIndex.from_pages_documents(documents)
        print(f"[UPLOAD] RAG index built with {len(rag_index.chunks)} chunks")
        context_chunks = rag_index.search("main thesis argument position", top_k=3)
        context = "\n\n---\n\n".join(c["text"] for c in context_chunks)
    except Exception as e:
        print(f"[RAG WARN] FAISS build failed ({e}), falling back to naive context")
        context = all_text[:3000]

    prompt = (
        f"Here is context from the document(s):\n\n---\n{context}\n---\n\n"
        "Read the document, identify its main thesis, and write an opening "
        "statement where you take a clear position and invite the user to "
        "present their argument. State your position explicitly."
    )

    opening = call_luxia(prompt, system_instruction=LEVEL_PROMPTS[level]["opening"])

    sessions[session_id] = {
        "session_id": session_id,
        "filename": filenames[0] if filenames else "",
        "filenames": filenames,
        "document_text": all_text,
        "level": level,
        "ai_position": opening,
        "history": [{"role": "ai", "text": opening}],
        "rag_index": rag_index,
    }

    _persist_session(session_id, sessions[session_id])

    return {"session_id": session_id, "opening_statement": opening}


# ─── POST /debate ──────────────────────────────────────────────────────────────

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] session={req.session_id}  msg={req.message[:80]}...")

    session = sessions.get(req.session_id)
    if not session:
        # Attempt recovery from DynamoDB (RAGIndex will be missing)
        stored = load_session(req.session_id)
        if not stored:
            raise HTTPException(
                status_code=404,
                detail="Session not found. Did you upload a document first?",
            )
        stored["rag_index"] = None
        sessions[req.session_id] = stored
        session = stored

    result = agent.process_turn(
        user_message=req.message,
        history=session["history"],
        rag_index=session.get("rag_index"),
        ai_position=session["ai_position"],
        session_data=session,
        feedback_fn=generate_feedback,
    )

    session["history"].append({"role": "user", "text": req.message})
    session["history"].append({"role": "ai",   "text": result["response"]})

    _persist_session(req.session_id, session)

    # If agent decided to end the debate, include session feedback in response
    session_feedback = None
    if result.get("agent_decision") == "end_debate":
        session_feedback = _build_end_session_feedback(session)

    return {
        "response":        result["response"],
        "audio_url":       None,
        "evidence":        result.get("evidence", []),
        "fallacy":         result.get("fallacy", {}),
        "agent_decision":  result.get("agent_decision", "continue_debate"),
        "session_id":      req.session_id,
        "session_feedback": session_feedback,
    }


# ─── POST /transcribe ──────────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[TRANSCRIBE] session={session_id} — stub, AWS Transcribe planned for step 4")
    return {
        "transcript": "This is a placeholder transcript. AWS Transcribe will replace this in step 4."
    }


# ─── POST /end-session ─────────────────────────────────────────────────────────

@app.post("/end-session")
async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] session={req.session_id}")

    session = sessions.get(req.session_id)
    if not session:
        stored = load_session(req.session_id)
        if not stored:
            return {"score": {"user": 0, "ai": 0}, "summary": "No debate to analyse.", "transcript_url": None}
        stored["rag_index"] = None
        sessions[req.session_id] = stored
        session = stored

    if not session.get("history"):
        return {"score": {"user": 0, "ai": 0}, "summary": "No debate to analyse.", "transcript_url": None}

    return _build_end_session_feedback(session)


def _build_end_session_feedback(session: dict) -> dict:
    """Call Luxia to score the debate and return the rich feedback payload."""
    level = session.get("level", "easy")
    transcript = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
        for msg in session["history"]
    )
    document_text = session.get("document_text", "")
    scoring_criteria = LEVEL_PROMPTS[level]["scoring"]

    system = (
        "You are an expert debate coach. Analyse the user's performance. "
        "Reply ONLY with valid JSON — no markdown, no explanation."
    )

    prompt = (
        f"Reference document (excerpt):\n---\n{document_text[:2000]}...\n---\n\n"
        f"Full debate transcript:\n{transcript}\n\n"
        f"Difficulty level: {level.upper()}\n\n"
        f"Score the user based on these dimensions:\n{scoring_criteria}\n\n"
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
        '    "strongest_argument": "<1-2 sentences identifying the user\'s best argument>",\n'
        '    "weakest_point": "<1-2 sentences identifying their biggest weakness>",\n'
        '    "missed_opportunity": "<1-2 sentences on what they could have said but didn\'t>",\n'
        '    "argument_pattern": "<1-2 sentences describing a recurring pattern in their argumentation>",\n'
        '    "ai_assessment": "<1-2 sentences on the overall strength of the user\'s position>"\n'
        '  }\n'
        "}"
    )

    raw = call_luxia(prompt, system_instruction=system)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data        = json.loads(cleaned)
        user_score  = int(data.get("user_score", 0))
        ai_score    = int(data.get("ai_score", 0))
        summary     = data.get("summary", "Analysis unavailable.")
        dimensions  = data.get("dimensions", {})
        qualitative = data.get("qualitative", {})
    except (json.JSONDecodeError, ValueError):
        print(f"[END-SESSION] Invalid JSON from Luxia: {raw}")
        user_score, ai_score = 50, 50
        summary     = "The debate went well, but the detailed analysis could not be generated."
        dimensions  = {}
        qualitative = {}

    return {
        "score":          {"user": user_score, "ai": ai_score},
        "summary":        summary,
        "dimensions":     dimensions,
        "qualitative":    qualitative,
        "transcript_url": None,
    }


# ─── GET / ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status":          "DebateCoach backend is running",
        "model":           LUXIA_MODEL,
        "agent_model":     AGENT_MODEL,
        "active_sessions": len(sessions),
        "rag_mode":        "FAISS (semantic retrieval with Luxia embeddings)",
    }
