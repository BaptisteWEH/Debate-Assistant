import re
import numpy as np
import faiss
import google.generativeai as genai


EMBEDDING_MODEL = "gemini-embedding-001"


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[dict]:
    words = re.findall(r"\S+", text)
    chunks = []

    start = 0
    chunk_id = 1

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]

        chunks.append({
            "id": f"chunk-{chunk_id}",
            "page": max(1, start // 350),
            "text": " ".join(chunk_words),
        })

        chunk_id += 1

        if end == len(words):
            break

        start = end - overlap

    return chunks


def embed_text(text: str, task_type: str) -> np.ndarray:
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type=task_type,
    )
    return np.array(result["embedding"], dtype="float32")


class RAGIndex:
    def __init__(self, chunks: list[dict], index: faiss.IndexFlatIP):
        self.chunks = chunks
        self.index = index

    @classmethod
    def from_text(cls, text: str):
        chunks = chunk_text(text)

        if not chunks:
            raise ValueError("No chunks created from document.")

        embeddings = []
        for chunk in chunks:
            embedding = embed_text(
                chunk["text"],
                task_type="retrieval_document",
            )
            embeddings.append(embedding)

        matrix = np.vstack(embeddings).astype("float32")
        faiss.normalize_L2(matrix)

        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)

        return cls(chunks=chunks, index=index)

    def search(self, query: str, top_k: int = 3) -> list[dict]:
        query_embedding = embed_text(
            query,
            task_type="retrieval_query",
        ).reshape(1, -1).astype("float32")

        faiss.normalize_L2(query_embedding)

        scores, indices = self.index.search(query_embedding, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue

            chunk = self.chunks[idx]

            results.append({
                "id": chunk["id"],
                "page": chunk["page"],
                "text": chunk["text"],
                "score": float(round(score, 4)),
            })

        return results