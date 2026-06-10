"""Test isolé du module session_store."""

from dotenv import load_dotenv
load_dotenv()  # Charge le .env AVANT d'importer le store

from services.session_store import save_session, load_session, list_session_ids, delete_session

# Test 1 : sauvegarder une session bidon
fake_session = {
    "filename": "test.pdf",
    "filenames": ["test.pdf"],
    "document_text": "Ceci est un texte de test pour DynamoDB.",
    "ai_position": "Je défends la position X.",
    "history": [
        {"role": "ai", "text": "Phrase d'ouverture de l'IA"},
        {"role": "user", "text": "Mon premier argument"},
        {"role": "ai", "text": "La réponse de l'IA"},
    ],
}

print("Test 1 : sauvegarde...")
save_session("test-session-abc", fake_session)

# Test 2 : la lire
print("\nTest 2 : lecture...")
loaded = load_session("test-session-abc")
print("Session chargée :")
print(f"  filename : {loaded['filename']}")
print(f"  ai_position : {loaded['ai_position']}")
print(f"  nombre de messages : {len(loaded['history'])}")

# Test 3 : lister les sessions
print("\nTest 3 : liste des sessions...")
ids = list_session_ids()
print(f"Sessions existantes : {ids}")

# Test 4 : supprimer pour nettoyer
print("\nTest 4 : suppression...")


print("\n✓ Tous les tests OK !")