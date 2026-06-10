import re
import numpy as np
import faiss
import google.generativeai as genai


EMBEDDING_MODEL = "models/gemini-embedding-001"


def safe_source_name(filename: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", filename)


def flatten_pages(pages: list[dict]) -> list[dict]:
    """
    Transforme des pages en liste de mots avec leur numéro de page.
    """
    tokens = []

    for page in pages:
        page_number = page["page"]
        words = re.findall(r"\S+", page["text"])

        for word in words:
            tokens.append({
                "word": word,
                "page": page_number,
            })

    return tokens


def chunk_pages(
    pages: list[dict],
    source: str,
    chunk_size: int = 300,
    overlap: int = 60,
) -> list[dict]:
    """
    Crée des chunks glissants sur tout le document,
    même si un chunk traverse plusieurs pages.
    """
    tokens = flatten_pages(pages)
    chunks = []
    safe_source = safe_source_name(source)

    start = 0
    chunk_id = 1

    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]

        text = " ".join(token["word"] for token in chunk_tokens)
        start_page = chunk_tokens[0]["page"]
        end_page = chunk_tokens[-1]["page"]

        chunks.append({
            "id": f"{safe_source}_chunk_{chunk_id}",
            "source": source,
            "start_page": start_page,
            "end_page": end_page,
            "text": text,
        })

        chunk_id += 1

        if end == len(tokens):
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
    def from_pages_documents(cls, documents: list[dict]):
        all_chunks = []

        for doc in documents:
            chunks = chunk_pages(
                pages=doc["pages"],
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