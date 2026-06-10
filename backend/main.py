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


# ─── Chargement de la configuration ────────────────────────────────────────────

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY introuvable. Vérifie que le fichier .env existe "
        "et contient bien la variable GEMINI_API_KEY."
    )

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-2.5-flash-lite"


# ─── Application FastAPI ───────────────────────────────────────────────────────

app = FastAPI(title="DebateCoach Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Fonction helper : call_gemini ─────────────────────────────────────────────

def call_gemini(prompt: str, system_instruction: str | None = None) -> str:
    """Appelle Gemini et retourne le texte généré."""
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


# ─── Fonction helper : extraction du texte d'un PDF ────────────────────────────

def extract_pdf_text(pdf_bytes: bytes) -> str:
    """
    Prend les bytes d'un fichier PDF et retourne tout son texte en une seule
    chaîne. Si l'extraction échoue, retourne une chaîne vide.
    """
    try:
        # PdfReader veut un objet "file-like", on enveloppe les bytes dans BytesIO
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
    Extrait le texte page par page pour conserver les vrais numéros de page.
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
    Découpe le texte en quelques extraits courts pour le panneau Evidence.
    Version naïve : on prend des chunks fixes du début, milieu, fin du document.
    L'étape 3b remplacera ça par une vraie recherche sémantique.
    """
    if not text:
        return []

    chunk_size = 400  # ~400 caractères par snippet
    total = len(text)

    if total < chunk_size:
        return [{
            "id": "chunk-1",
            "page": 1,
            "text": text.strip(),
            "score": 1.0,
        }]

    # On prend des extraits espacés dans le document
    positions = [0, total // 2, max(0, total - chunk_size)]
    snippets = []
    for i, pos in enumerate(positions[:max_snippets]):
        excerpt = text[pos:pos + chunk_size].strip()
        if excerpt:
            snippets.append({
                "id": f"chunk-{i+1}",
                "page": (pos // 2000) + 1,  # approximation page
                "text": excerpt,
                "score": round(0.9 - i * 0.1, 2),
            })
    return snippets


# ─── Schémas Pydantic ──────────────────────────────────────────────────────────

class DebateRequest(BaseModel):
    message: str
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: str


# ─── Mémoire de session ────────────────────────────────────────────────────────

sessions: dict[str, dict] = {}


# ─── Route 1 : POST /upload ────────────────────────────────────────────────────

@app.post("/upload")
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[UPLOAD] Reçu : {file.filename} (session : {session_id})")

    # Lire les bytes du fichier
    pdf_bytes = await file.read()

    # Extraire le texte du PDF
    pages = extract_pdf_pages(pdf_bytes)
    document_text = "\n\n".join(page["text"] for page in pages)

    if not document_text:
        raise HTTPException(
            status_code=400,
            detail="Impossible d'extraire le texte de ce PDF. "
                "Est-il bien un PDF avec du texte (pas une image scannée) ?"
        )

    print(f"[UPLOAD] Texte extrait : {len(document_text)} caractères")

    rag_index = RAGIndex.from_pages_documents([
    {
        "filename": file.filename,
        "pages": pages,
    }
    ])
    
    print(f"[UPLOAD] Index RAG créé avec {len(rag_index.chunks)} chunks")

    # Demander à Gemini une position d'ouverture, basée sur le VRAI contenu
    system = (
        "Tu es un débatteur expérimenté. Tu vas débattre contre un utilisateur "
        "humain sur le sujet d'un document qu'il vient de fournir. Tu prends "
        "une position claire (POUR ou CONTRE la thèse du document, à toi de choisir) "
        "et tu la défendras tout au long du débat en t'appuyant sur le document."
    )

    prompt = (
        f"Voici le contenu du document :\n\n---\n{document_text}\n---\n\n"
        f"Lis ce document, identifie sa thèse principale, et génère une phrase "
        f"d'ouverture (2-3 phrases) où tu prends position et invites l'utilisateur "
        f"à présenter son argument. Indique clairement quelle position tu défends."
    )

    opening = call_gemini(prompt, system_instruction=system)

    # Stocker tout dans la session
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

# ─── Route 1.2 : POST /upload-multiple ────────────────────────────────────────────────────

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

    print(f"[UPLOAD-MULTIPLE] Reçu {len(files)} fichier(s) (session : {session_id})")

    documents = []
    document_text_parts = []

    for file in files:
        print(f"[UPLOAD-MULTIPLE] Lecture : {file.filename}")

        pdf_bytes = await file.read()

        # Extraction page par page pour conserver les vraies pages
        pages = extract_pdf_pages(pdf_bytes)
        text = "\n\n".join(page["text"] for page in pages)

        if not text:
            raise HTTPException(
                status_code=400,
                detail=f"Impossible d'extraire le texte du PDF : {file.filename}"
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

    print(f"[UPLOAD-MULTIPLE] Texte total extrait : {len(document_text)} caractères")

    # Création de l'index FAISS avec chunks source-aware et page-aware
    rag_index = RAGIndex.from_pages_documents(documents)
    print(f"[UPLOAD-MULTIPLE] Index RAG créé avec {len(rag_index.chunks)} chunks")

    system = (
        "Tu es un débatteur expérimenté. Tu vas débattre contre un utilisateur "
        "humain sur le sujet de plusieurs documents fournis. Tu prends "
        "une position claire et tu la défendras tout au long du débat en "
        "t'appuyant sur les documents."
    )

    prompt = (
        f"Voici le contenu des documents :\n\n---\n{document_text[:8000]}\n---\n\n"
        f"Lis ces documents, identifie leur thème commun ou leurs désaccords, "
        f"et génère une phrase d'ouverture de 2-3 phrases où tu prends position "
        f"et invites l'utilisateur à présenter son argument. "
        f"Indique clairement quelle position tu défends."
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


# ─── Route 2 : POST /debate ────────────────────────────────────────────────────

@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] Message reçu : {req.message[:80]}...")

    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session introuvable. As-tu bien uploadé un document d'abord ?"
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
        f"{'AI' if msg['role'] == 'ai' else 'User'} : {msg['text']}"
        for msg in session["history"]
    )

    system = (
        "Tu es un débatteur exigeant mais juste. Tu défends la position prise "
        "au début du débat. Tu réponds en 2-4 phrases maximum, de manière "
        "conversationnelle. Tu DOIS t'appuyer sur le contenu du document fourni "
        "pour étayer tes arguments. Si l'utilisateur commet une erreur logique "
        "évidente (ex : ad hominem, faux dilemme), signale-la avec respect."
    )

    prompt = (
        f"Passages pertinents récupérés par RAG :\n---\n{evidence_text}\n---\n\n"
        f"Historique du débat :\n{history_text}\n\n"
        f"L'utilisateur vient de dire : « {req.message} »\n\n"
        f"Réponds en défendant ta position et en t'appuyant sur le document."
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


# ─── Route 3 : POST /transcribe (toujours factice) ─────────────────────────────

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[TRANSCRIBE] Audio reçu (session : {session_id}) — factice pour l'instant")
    return {
        "transcript": "Ceci est un texte transcrit factice. AWS Transcribe viendra à l'étape 4."
    }


# ─── Route 4 : POST /end-session ───────────────────────────────────────────────

@app.post("/end-session")
async def end_session(req: EndSessionRequest):
    print(f"[END-SESSION] Fin de session : {req.session_id}")

    session = sessions.get(req.session_id)
    if not session or not session["history"]:
        return {
            "score": {"user": 0, "ai": 0},
            "summary": "Aucun débat à analyser.",
            "transcript_url": None,
        }

    document_text = session.get("document_text", "")
    transcript = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'} : {msg['text']}"
        for msg in session["history"]
    )

    system = (
        "Tu es un coach de débat expert. Tu analyses la performance d'un "
        "utilisateur dans un débat contre une IA, sur un sujet défini par un "
        "document de référence. Tu réponds UNIQUEMENT au format JSON valide, "
        "avec cette structure : "
        '{"user_score": <0-100>, "ai_score": <0-100>, "summary": "<texte>"}'
    )

    prompt = (
        f"Document de référence (résumé) :\n---\n{document_text[:2000]}...\n---\n\n"
        f"Transcript complet du débat :\n{transcript}\n\n"
        f"Évalue la performance de l'utilisateur (User) sur 100 et celle de "
        f"l'IA (AI) sur 100. Donne un résumé (2-3 phrases) avec des conseils "
        f"concrets pour aider l'utilisateur à progresser. Évalue notamment si "
        f"l'utilisateur s'est bien appuyé sur le document. Réponds en JSON valide."
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
        summary = data.get("summary", "Analyse indisponible.")
    except (json.JSONDecodeError, ValueError):
        print(f"[END-SESSION] JSON invalide reçu de Gemini : {raw_response}")
        user_score, ai_score = 50, 50
        summary = "Le débat s'est bien déroulé, mais l'analyse détaillée n'a pas pu être générée."

    return {
        "score": {"user": user_score, "ai": ai_score},
        "summary": summary,
        "transcript_url": None,
    }


# ─── Route racine ──────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status": "DebateCoach backend is running",
        "model": GEMINI_MODEL,
        "active_sessions": len(sessions),
        "rag_mode": "FAISS + Gemini embeddings with source-aware chunks",
    }