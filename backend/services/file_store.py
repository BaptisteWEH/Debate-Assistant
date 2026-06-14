"""
Module de stockage de fichiers dans S3.

Stocke 3 choses :
- Les PDFs uploadés (archive permanente)
- Les index FAISS sérialisés (évite de rebuild après un crash)
- Les chunks et métadonnées associés à chaque index

Organisation du bucket :
    documents/{session_id}/{filename}     ← PDFs originaux
    indexes/{session_id}/index.faiss      ← index FAISS binaire
    indexes/{session_id}/chunks.json      ← métadonnées des chunks
"""

import os
import io
import json
import tempfile
import boto3
import faiss
from botocore.exceptions import ClientError


# Le bucket name est lu depuis .env pour que chaque membre de l'équipe
# puisse pointer vers le sien (les noms S3 sont uniques au monde entier).
BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "debatecoach-baptiste-2026")


def _get_client():
    """Crée un client S3 avec les credentials du .env."""
    return boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )


# ─── PDFs ──────────────────────────────────────────────────────────────────────

def upload_pdf(session_id: str, filename: str, pdf_bytes: bytes) -> str:
    """Upload le PDF original dans S3. Retourne la clé S3."""
    s3 = _get_client()
    key = f"documents/{session_id}/{filename}"
    try:
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        print(f"[S3] PDF uploadé : s3://{BUCKET_NAME}/{key} ({len(pdf_bytes)} octets)")
        return key
    except ClientError as e:
        print(f"[S3 ERROR] {e}")
        raise


def download_pdf(session_id: str, filename: str) -> bytes | None:
    """Télécharge un PDF depuis S3. Retourne None si introuvable."""
    s3 = _get_client()
    key = f"documents/{session_id}/{filename}"
    try:
        response = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return response["Body"].read()
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return None
        print(f"[S3 ERROR] {e}")
        raise


# ─── Index FAISS ──────────────────────────────────────────────────────────────

def upload_faiss_index(session_id: str, rag_index) -> None:
    """
    Sauvegarde un RAGIndex (FAISS + chunks) dans S3.

    On extrait l'index FAISS et les chunks depuis l'objet RAGIndex,
    puis on les sérialise séparément.
    """
    s3 = _get_client()

    # 1. Sérialiser l'index FAISS via un fichier temporaire
    # faiss.write_index() veut un chemin de fichier, pas un buffer mémoire.
    with tempfile.NamedTemporaryFile(suffix=".faiss", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        faiss.write_index(rag_index.index, tmp_path)
        with open(tmp_path, "rb") as f:
            index_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    # 2. Upload l'index FAISS
    index_key = f"indexes/{session_id}/index.faiss"
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=index_key,
        Body=index_bytes,
    )

    # 3. Upload les chunks en JSON
    chunks_key = f"indexes/{session_id}/chunks.json"
    chunks_data = {
        "chunks": rag_index.chunks,
        "config": rag_index.config,
    }
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=chunks_key,
        Body=json.dumps(chunks_data).encode("utf-8"),
        ContentType="application/json",
    )

    print(f"[S3] Index FAISS uploadé pour la session {session_id} "
          f"({len(index_bytes)} octets, {len(rag_index.chunks)} chunks)")


def download_faiss_index(session_id: str):
    """
    Télécharge un index FAISS et reconstruit un RAGIndex.
    Retourne None si introuvable.

    L'import de RAGIndex est fait à l'intérieur pour éviter les imports
    circulaires (rag_service importe parfois file_store indirectement).
    """
    from services.rag_service import RAGIndex

    s3 = _get_client()
    index_key = f"indexes/{session_id}/index.faiss"
    chunks_key = f"indexes/{session_id}/chunks.json"

    try:
        # 1. Télécharger les bytes de l'index FAISS
        response = s3.get_object(Bucket=BUCKET_NAME, Key=index_key)
        index_bytes = response["Body"].read()

        # 2. Télécharger les chunks JSON
        response = s3.get_object(Bucket=BUCKET_NAME, Key=chunks_key)
        chunks_data = json.loads(response["Body"].read())

    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return None
        print(f"[S3 ERROR] {e}")
        raise

    # 3. Désérialiser l'index FAISS depuis un fichier temporaire
    with tempfile.NamedTemporaryFile(suffix=".faiss", delete=False) as tmp:
        tmp.write(index_bytes)
        tmp_path = tmp.name

    try:
        faiss_index = faiss.read_index(tmp_path)
    finally:
        os.unlink(tmp_path)

    # 4. Reconstituer un objet RAGIndex manuellement
    # On crée une instance vide et on remplit ses attributs.
    rag_index = RAGIndex.__new__(RAGIndex)
    rag_index.index = faiss_index
    rag_index.chunks = chunks_data["chunks"]
    rag_index.config = chunks_data.get("config", {})

    print(f"[S3] Index FAISS rechargé pour la session {session_id} "
          f"({len(rag_index.chunks)} chunks)")
    return rag_index


def delete_session_files(session_id: str) -> None:
    """Supprime tous les fichiers d'une session (utile pour nettoyer)."""
    s3 = _get_client()
    prefixes = [f"documents/{session_id}/", f"indexes/{session_id}/"]

    for prefix in prefixes:
        response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
        if "Contents" in response:
            for obj in response["Contents"]:
                s3.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])
                print(f"[S3] Supprimé : {obj['Key']}")