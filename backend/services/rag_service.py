import re
import os
import requests
import numpy as np
import faiss

LUXIA_API_KEY = os.getenv("LUXIA_API_KEY")
EMBED_URL = "https://bridge.luxiacloud.com/luxia/v1/embedding"
MAX_EMBED_CHARS = 4000


def safe_source_name(filename: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", filename)


def flatten_pages(pages: list[dict]) -> list[dict]:
    tokens = []
    for page in pages:
        page_number = page["page"]
        for word in re.findall(r"\S+", page["text"]):
            tokens.append({"word": word, "page": page_number})
    return tokens


def chunk_pages(pages: list[dict], source: str, chunk_size: int = 300, overlap: int = 60) -> list[dict]:
    tokens = flatten_pages(pages)
    chunks = []
    safe_source = safe_source_name(source)

    start = 0
    chunk_id = 1
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]

        text = " ".join(t["word"] for t in chunk_tokens)
        chunks.append({
            "id": f"{safe_source}_chunk_{chunk_id}",
            "source": source,
            "start_page": chunk_tokens[0]["page"],
            "end_page": chunk_tokens[-1]["page"],
            "text": text,
        })

        chunk_id += 1
        if end == len(tokens):
            break
        start = end - overlap

    return chunks


def embed_text(text: str, retries: int = 5) -> np.ndarray:
    """Embed a single text via Luxia's embedding endpoint."""
    text = text.replace("\x00", " ").strip()
    if len(text) > MAX_EMBED_CHARS:
        text = text[:MAX_EMBED_CHARS]

    import time, random
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
    def __init__(self, chunks: list[dict], index: faiss.IndexFlatIP):
        self.chunks = chunks
        self.index = index

    @classmethod
    def from_pages_documents(cls, documents: list[dict]):
        all_chunks = []
        for doc in documents:
            all_chunks.extend(chunk_pages(pages=doc["pages"], source=doc["filename"]))

        if not all_chunks:
            raise ValueError("No chunks created from documents.")

        embeddings = [embed_text(c["text"]) for c in all_chunks]
        matrix = np.vstack(embeddings).astype("float32")
        faiss.normalize_L2(matrix)

        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)

        return cls(chunks=all_chunks, index=index)

    def search(self, query: str, top_k: int = 3) -> list[dict]:
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