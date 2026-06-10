"""
Module de persistance des sessions dans DynamoDB.

Remplace le dict `sessions = {}` en mémoire par une vraie base de données.

Limitation actuelle : l'index FAISS n'est PAS persisté (il reste en mémoire RAM).
Si le serveur redémarre, l'index est perdu et doit être reconstruit à partir
du document original (qui lui est bien sauvegardé).
"""

import os
import json
import boto3
from botocore.exceptions import ClientError


# Nom de la table créée dans la console AWS
TABLE_NAME = "DebateSessions"


def _get_table():
    """
    Crée un client DynamoDB et retourne l'objet table.
    Utilise les credentials du .env (chargés par main.py via load_dotenv).
    """
    dynamodb = boto3.resource(
        "dynamodb",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    return dynamodb.Table(TABLE_NAME)


def save_session(session_id: str, data: dict) -> None:
    """
    Sauvegarde une session complète dans DynamoDB.

    `data` contient tout sauf l'index FAISS (qui reste en mémoire).
    On serialise les structures complexes en JSON pour les stocker.
    """
    # On copie pour ne pas modifier l'original
    persistable = {
        "session_id": session_id,
        "filename": data.get("filename", ""),
        "filenames": data.get("filenames", []),
        "document_text": data.get("document_text", ""),
        "ai_position": data.get("ai_position", ""),
        # L'historique est une liste, DynamoDB sait gérer ça nativement
        "history": data.get("history", []),
    }

    table = _get_table()
    try:
        table.put_item(Item=persistable)
        print(f"[DYNAMODB] Session {session_id} sauvegardée")
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        raise


def load_session(session_id: str) -> dict | None:
    """
    Récupère une session depuis DynamoDB.
    Retourne None si la session n'existe pas.

    Attention : ne retourne PAS l'index FAISS (qui n'est pas persisté).
    Le code appelant doit le reconstruire si nécessaire.
    """
    table = _get_table()
    try:
        response = table.get_item(Key={"session_id": session_id})
        item = response.get("Item")

        if item is None:
            print(f"[DYNAMODB] Session {session_id} introuvable")
            return None

        print(f"[DYNAMODB] Session {session_id} chargée")
        return item

    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        return None


def delete_session(session_id: str) -> None:
    """Supprime une session (utile pour les tests)."""
    table = _get_table()
    try:
        table.delete_item(Key={"session_id": session_id})
        print(f"[DYNAMODB] Session {session_id} supprimée")
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")


def list_session_ids() -> list[str]:
    """Liste tous les session_id existants (utile pour debug)."""
    table = _get_table()
    try:
        response = table.scan(ProjectionExpression="session_id")
        return [item["session_id"] for item in response.get("Items", [])]
    except ClientError as e:
        print(f"[DYNAMODB ERROR] {e}")
        return []