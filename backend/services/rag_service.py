import os
import re
import time
import random
import requests
import numpy as np
import faiss

LUXIA_API_KEY = os.getenv("LUXIA_API_KEY")
EMBED_URL = "https://bridge.luxiacloud.com/luxia/v1/embedding"
CHUNK_URL = "https://bridge.luxiacloud.com/luxia/v1/document-chunk"
MAX_EMBED_CHARS = 4000
EMBED_BATCH_SIZE = 32


def safe_source_name(filename: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", filename)


def get_chunk_config(text_len: int) -> dict:
    """Pick chunk_size / overlap / k based on document length."""
    if text_len < 15000:
        return {"chunk_size": 800, "overlap": 100, "k": 3}
    elif text_len < 40000:
        return {"chunk_size": 1000, "overlap": 150, "k": 4}
    else:
        return {"chunk_size": 1500, "overlap": 200, "k": 6}


def luxia_chunk(text: str, chunk_size: int, overlap: int) -> list[dict]:
    response = requests.post(
        CHUNK_URL,
        headers={
            "apikey": LUXIA_API_KEY,
            "Content-Type": "application/json",
            "accept": "application/json",
        },
        json={
            "text": text,
            "chunk_sizes": chunk_size,
            "overlap": overlap,
            "type": "length",
            "separator": "chapterWW+d",
            "enhanceChunkQuality": True,
        },
        timeout=60,
    )
    if response.status_code != 200:
        print("CHUNK ERROR:", response.text)
    response.raise_for_status()
    return response.json()["chunks"]


def embed_text(text: str, retries: int = 8) -> np.ndarray:
    text = text.replace("\x00", " ").strip()
    if len(text) > MAX_EMBED_CHARS:
        print(f"[WARN] Truncating text from {len(text)} to {MAX_EMBED_CHARS} chars before embedding")
        text = text[:MAX_EMBED_CHARS]

    wait = 1.0
    for attempt in range(retries):
        response = requests.post(
            EMBED_URL,
            headers={"apikey": LUXIA_API_KEY, "Content-Type": "application/json"},
            json={"inputs": [text]},
            timeout=60,
        )
        if response.status_code == 200:
            return np.array(response.json()["data"][0]["embedding"], dtype="float32")

        print(f"[LUXIA EMBED ERROR] {response.status_code}: {response.text[:300]}")
        if response.status_code in (429, 500):
            time.sleep(wait + random.uniform(0, 0.5))
            wait = min(wait * 2, 60)
            continue
        response.raise_for_status()

    raise RuntimeError("Luxia embedding failed after retries")


def embed_texts_batch(texts: list[str], retries: int = 8) -> list[np.ndarray]:
    """Embed multiple texts in one API call instead of N sequential calls."""
    cleaned = []
    for t in texts:
        t = t.replace("\x00", " ").strip()
        cleaned.append(t[:MAX_EMBED_CHARS] if len(t) > MAX_EMBED_CHARS else t)

    wait = 1.0
    for attempt in range(retries):
        response = requests.post(
            EMBED_URL,
            headers={"apikey": LUXIA_API_KEY, "Content-Type": "application/json"},
            json={"inputs": cleaned},
            timeout=120,
        )
        if response.status_code == 200:
            data = response.json()["data"]
            return [np.array(item["embedding"], dtype="float32") for item in data]

        print(f"[LUXIA EMBED BATCH ERROR] {response.status_code}: {response.text[:300]}")
        if response.status_code in (429, 500):
            time.sleep(wait + random.uniform(0, 0.5))
            wait = min(wait * 2, 60)
            continue
        response.raise_for_status()

    raise RuntimeError("Luxia batch embedding failed after retries")


class RAGIndex:
    def __init__(self, chunks: list[dict], index: faiss.IndexFlatIP, config: dict):
        self.chunks = chunks
        self.index = index
        self.config = config

    @classmethod
    def from_pages_documents(cls, documents: list[dict]):
        """
        documents: list of {"filename": str, "pages": [{"page": int, "text": str}, ...]}

        Joins all pages per document, picks an adaptive chunk config based on
        the combined text length across all documents, then chunks each
        document via the Luxia chunking API and embeds every chunk in batches.
        """
        full_texts = {}
        total_text_len = 0
        for doc in documents:
            text = "\n\n".join(p["text"] for p in doc["pages"])
            full_texts[doc["filename"]] = text
            total_text_len += len(text)

        config = get_chunk_config(total_text_len)
        print(f"[CHUNK CONFIG] total_len={total_text_len} -> {config}")

        all_chunks = []
        for doc in documents:
            safe_source = safe_source_name(doc["filename"])
            text = full_texts[doc["filename"]]

            raw_chunks = luxia_chunk(text, config["chunk_size"], config["overlap"])
            print(f"[CHUNK] {doc['filename']}: {len(raw_chunks)} chunks")

            for i, c in enumerate(raw_chunks):
                all_chunks.append({
                    "id": f"{safe_source}_chunk_{i+1}",
                    "source": doc["filename"],
                    "start_page": 1,
                    "end_page": 1,
                    "text": c["child_chunk"],
                })

        if not all_chunks:
            raise ValueError("No chunks created from documents.")

        texts = [c["text"] for c in all_chunks]
        n_batches = (len(texts) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
        print(f"[EMBED] {len(texts)} chunks -> {n_batches} batch call(s)")

        embeddings = []
        for i in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[i : i + EMBED_BATCH_SIZE]
            batch_num = i // EMBED_BATCH_SIZE + 1
            print(f"[EMBED] batch {batch_num}/{n_batches} ({len(batch)} texts)")
            embeddings.extend(embed_texts_batch(batch))

        matrix = np.vstack(embeddings).astype("float32")
        faiss.normalize_L2(matrix)

        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)

        return cls(chunks=all_chunks, index=index, config=config)

    def search(self, query: str, top_k: int | None = None) -> list[dict]:
        if top_k is None:
            top_k = self.config.get("k", 3)

        query_embedding = embed_text(query).reshape(1, -1).astype("float32")
        faiss.normalize_L2(query_embedding)

        scores, indices = self.index.search(query_embedding, top_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            chunk = self.chunks[idx]
            results.append({
                "id": chunk["id"],
                "source": chunk["source"],
                "start_page": chunk["start_page"],
                "end_page": chunk["end_page"],
                "pages": (
                    str(chunk["start_page"])
                    if chunk["start_page"] == chunk["end_page"]
                    else f"{chunk['start_page']}-{chunk['end_page']}"
                ),
                "text": chunk["text"],
                "score": float(round(score, 4)),
            })
        return results
