import re
import numpy as np
import faiss
import google.generativeai as genai


EMBEDDING_MODEL = "models/gemini-embedding-001"


def safe_source_name(filename: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", filename)


def chunk_text(
    text: str,
    source: str,
    chunk_size: int = 300,
    overlap: int = 60,
) -> list[dict]:
    words = re.findall(r"\S+", text)
    chunks = []
    start = 0
    chunk_id = 1
    safe_source = safe_source_name(source)

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]

        chunks.append({
            "id": f"{safe_source}_chunk_{chunk_id}",
            "source": source,
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
    def from_text(cls, text: str, source: str = "document"):
        return cls.from_documents([
            {"filename": source, "text": text}
        ])

    @classmethod
    def from_documents(cls, documents: list[dict]):
        all_chunks = []

        for doc in documents:
            chunks = chunk_text(
                text=doc["text"],
                source=doc["filename"],
            )
            all_chunks.extend(chunks)

        if not all_chunks:
            raise ValueError("No chunks created from documents.")

        embeddings = []
        for chunk in all_chunks:
            embedding = embed_text(
                chunk["text"],
                task_type="retrieval_document",
            )
            embeddings.append(embedding)

        matrix = np.vstack(embeddings).astype("float32")
        faiss.normalize_L2(matrix)

        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)

        return cls(chunks=all_chunks, index=index)

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
                "source": chunk["source"],
                "page": chunk["page"],
                "text": chunk["text"],
                "score": float(round(score, 4)),
            })

        return results