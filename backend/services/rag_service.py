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


class RAGIndex:
    def __init__(self, chunks: list[dict], index: faiss.IndexFlatIP, config: dict):
        self.chunks = chunks
        self.index = index
        self.config = config  # contains "chunk_size", "overlap", "k"

    @classmethod
    def from_pages_documents(cls, documents: list[dict]):
        """
        documents: list of {"filename": str, "pages": [{"page": int, "text": str}, ...]}

        Joins all pages per document, picks an adaptive chunk config based on
        the combined text length across all documents, then chunks each
        document via the Luxia chunking API and embeds every chunk.

        NOTE: Luxia's document-chunk endpoint does not return page numbers,
        so start_page/end_page default to 1 for all chunks. Page-level
        attribution from the original PDF is lost with this strategy.
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

        embeddings = []
        for i, c in enumerate(all_chunks):
            print(f"[EMBED] {i+1}/{len(all_chunks)}")
            embeddings.append(embed_text(c["text"]))

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