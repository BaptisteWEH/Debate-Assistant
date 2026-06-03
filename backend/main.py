"""
DebateCoach — Backend (étape 2 : branchement Gemini)
 
Les routes /upload, /debate et /end-session appellent maintenant Gemini
pour générer de vraies réponses. La route /transcribe reste factice
(elle sera branchée sur AWS Transcribe à l'étape 4).
 
L'IA ne connaît pas encore le contenu du document — elle répond avec sa
culture générale. Le RAG arrive à l'étape 3.
"""
 
import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

# ─── Chargement de la configuration ────────────────────────────────────────────
# load_dotenv() lit le fichier .env et expose ses variables via os.getenv().
 
load_dotenv()
 
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY introuvable. Vérifie que le fichier .env existe "
        "et contient bien la variable GEMINI_API_KEY."
    )
 
# On configure le SDK Gemini une seule fois au démarrage.
genai.configure(api_key=GEMINI_API_KEY)
 
# Le modèle qu'on utilise — celui qui a marché dans Postman.
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
# Toutes les routes passent par ici pour parler à Gemini. C'est notre point
# de contact unique avec l'API — facile à modifier ou remplacer plus tard.
 
def call_gemini(prompt: str, system_instruction: str | None = None) -> str:
    """
    Appelle Gemini avec un prompt et retourne le texte généré.
 
    - prompt : la question/demande à envoyer
    - system_instruction : optionnel, le "rôle" que doit jouer le modèle
 
    Retourne le texte de la réponse. Lève une exception en cas d'erreur.
    """
    try:
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=system_instruction,
        )
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        # On affiche l'erreur dans la console et on remonte une erreur HTTP
        # claire au frontend au lieu d'un crash silencieux.
        print(f"[GEMINI ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
    



# ─── Schémas Pydantic ──────────────────────────────────────────────────────────
 
class DebateRequest(BaseModel):
    message: str
    session_id: str
 
 
class EndSessionRequest(BaseModel):
    session_id: str
 

# ─── Mémoire de session (temporaire — sera DynamoDB plus tard) ─────────────────
# Pour l'instant, on stocke les sessions en mémoire dans un simple dict.
# Limitation : si le serveur redémarre, tout est perdu. C'est OK pour développer.
 
sessions: dict[str, dict] = {}


# ─── Route 1 : POST /upload ────────────────────────────────────────────────────
 
@app.post("/upload")
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
    print(f"[UPLOAD] Reçu : {file.filename} (session : {session_id})")
 
    # Pour l'instant on n'extrait pas le contenu du PDF (ça vient à l'étape 3).
    # On demande juste à Gemini de générer une phrase d'ouverture générique
    # basée sur le titre du fichier.
 
    system = (
        "Tu es un débatteur expérimenté. Tu vas débattre contre un utilisateur "
        "humain sur le sujet d'un document qu'il vient de fournir. Tu prends "
        "une position claire et tu la défendras tout au long du débat."
    )
 
    prompt = (
        f"Le document s'appelle : « {file.filename} ». "
        f"Génère une phrase d'ouverture (2-3 phrases maximum) qui prend une "
        f"position claire sur le sujet supposé de ce document et qui invite "
        f"l'utilisateur à présenter son argument."
    )
 
    opening = call_gemini(prompt, system_instruction=system)
 
    # On initialise la session avec l'historique vide et la position de l'IA
    sessions[session_id] = {
        "filename": file.filename,
        "ai_position": opening,
        "history": [
            {"role": "ai", "text": opening}
        ],
    }
 
    return {
        "session_id": session_id,
        "opening_statement": opening,
    }
 
 
# ─── Route 2 : POST /debate ────────────────────────────────────────────────────
 
@app.post("/debate")
async def debate(req: DebateRequest):
    print(f"[DEBATE] Message reçu : {req.message[:80]}...")
 
    # Récupérer l'historique de la session (ou créer une session vide si elle
    # n'existe pas, par exemple en cas de redémarrage du serveur).
    session = sessions.get(req.session_id)
    if not session:
        session = {"history": [], "ai_position": ""}
        sessions[req.session_id] = session
 
    # Construire un prompt qui inclut l'historique pour que l'IA garde le fil
    history_text = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'} : {msg['text']}"
        for msg in session["history"]
    )
 
    system = (
        "Tu es un débatteur exigeant mais juste. Tu défends une position que "
        "tu as prise au début du débat. Tu réponds à l'utilisateur en 2-4 phrases "
        "maximum, de manière conversationnelle. Tu peux signaler si l'utilisateur "
        "commet une erreur logique évidente, mais avec respect."
    )
 
    prompt = (
        f"Voici l'historique du débat jusqu'à présent :\n\n{history_text}\n\n"
        f"L'utilisateur vient de dire : « {req.message} »\n\n"
        f"Réponds en défendant ta position et en répliquant à son argument."
    )
 
    ai_response = call_gemini(prompt, system_instruction=system)
 
    # Mettre à jour l'historique
    session["history"].append({"role": "user", "text": req.message})
    session["history"].append({"role": "ai", "text": ai_response})
 
    return {
        "response": ai_response,
        "audio_url": None,  # pas d'audio pour l'instant
        "evidence": [],     # pas de RAG pour l'instant
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
        # Pas d'historique — on retourne des valeurs neutres
        return {
            "score": {"user": 0, "ai": 0},
            "summary": "Aucun débat à analyser.",
            "transcript_url": None,
        }
 
    # Construire le transcript complet
    transcript = "\n".join(
        f"{'AI' if msg['role'] == 'ai' else 'User'} : {msg['text']}"
        for msg in session["history"]
    )
 
    system = (
        "Tu es un coach de débat expert. Tu analyses la performance d'un "
        "utilisateur dans un débat contre une IA. Tu réponds UNIQUEMENT au "
        "format JSON valide, sans aucun texte autour, avec exactement cette "
        "structure : "
        '{"user_score": <0-100>, "ai_score": <0-100>, "summary": "<texte>"}'
    )
 
    prompt = (
        f"Voici le transcript complet du débat :\n\n{transcript}\n\n"
        f"Évalue la performance de l'utilisateur (User) sur 100 et celle de "
        f"l'IA (AI) sur 100. Rédige un résumé de 2-3 phrases avec des conseils "
        f"concrets pour aider l'utilisateur à progresser. Réponds uniquement "
        f"en JSON valide."
    )
 
    raw_response = call_gemini(prompt, system_instruction=system)

    # Parser le JSON renvoyé par Gemini. On nettoie au cas où il a mis des
    # backticks markdown autour.
    import json
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        # Enlever les ``` ou ```json en début et fin
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
 
    try:
        data = json.loads(cleaned)
        user_score = int(data.get("user_score", 0))
        ai_score = int(data.get("ai_score", 0))
        summary = data.get("summary", "Analyse indisponible.")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"[END-SESSION] JSON invalide reçu de Gemini : {raw_response}")
        # Fallback : on retourne quand même quelque chose plutôt que de crasher
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
    }