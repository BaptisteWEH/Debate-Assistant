import fitz
import json
import faiss
import requests
import numpy as np
import time
import random
from pathlib import Path


API_KEY = "key"
MODEL = "luxia3-llm-32b-0731"

CACHE_FOLDER = Path("cache_chunks")
CACHE_FOLDER.mkdir(exist_ok=True)

EMBED_DELAY = 0.5

FALLACY_LABELS = [
    "slippery_slope",
    "appeal_to_worse_problems",
    "false_dilemma",
    "hasty_generalization",
    "appeal_to_authority",
    "none",
]


def get_chunk_config(text_len):
    """Pick chunk_size / overlap / k based on document length."""
    if text_len < 15000:
        return {"chunk_size": 800, "overlap": 100, "k": 3}
    elif text_len < 40000:
        return {"chunk_size": 1000, "overlap": 150, "k": 4}
    else:
        return {"chunk_size": 1500, "overlap": 200, "k": 6}


def extract_pdf_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = "".join(page.get_text() for page in doc)
    return text.replace("\x00", " ").strip()


def luxia_chunk(text, chunk_size, overlap):
    response = requests.post(
        "https://bridge.luxiacloud.com/luxia/v1/document-chunk",
        headers={
            "apikey": API_KEY,
            "Content-Type": "application/json",
            "accept": "application/json"
        },
        json={
            "text": text,
            "chunk_sizes": chunk_size,
            "overlap": overlap,
            "type": "length",
            "separator": "chapterWW+d",
            "enhanceChunkQuality": True
        },
        timeout=60
    )

    if response.status_code != 200:
        print("CHUNK ERROR:", response.text)

    response.raise_for_status()
    return response.json()["chunks"]


def cache_tag(config):
    return f"cs{config['chunk_size']}_ov{config['overlap']}"


def save_chunks(doc_name, chunks, config):
    path = CACHE_FOLDER / f"{doc_name}_{cache_tag(config)}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2, ensure_ascii=False)


def load_chunks(doc_name, config):
    path = CACHE_FOLDER / f"{doc_name}_{cache_tag(config)}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_embeddings(doc_name, vectors, config):
    path = CACHE_FOLDER / f"{doc_name}_{cache_tag(config)}_emb.npy"
    np.save(path, vectors)


def load_embeddings(doc_name, config):
    path = CACHE_FOLDER / f"{doc_name}_{cache_tag(config)}_emb.npy"
    if path.exists():
        return np.load(path)
    return None


MAX_EMBED_CHARS = 4000


def luxia_embedding(text, retries=8):
    text = text.replace("\x00", " ").strip()

    if len(text) > MAX_EMBED_CHARS:
        print(f"[WARN] Truncating text from {len(text)} to {MAX_EMBED_CHARS} chars before embedding")
        text = text[:MAX_EMBED_CHARS]

    for i in range(retries):
        response = requests.post(
            "https://bridge.luxiacloud.com/luxia/v1/embedding",
            headers={
                "apikey": API_KEY,
                "Content-Type": "application/json"
            },
            json={"inputs": [text]},
            timeout=60
        )

        if response.status_code == 200:
            return response.json()["data"][0]["embedding"]

        print("EMBED ERROR:", response.text[:300])

        if response.status_code in (429, 500):
            wait = min(2 ** i, 60)
            time.sleep(wait)
            continue

        response.raise_for_status()

    raise Exception("Embedding failed after retries")


def prepare_document(pdf_path):
    """
    Given a PDF path, returns (chunks, faiss_index, config) using
    adaptive chunking based on document length. Uses cache if available.
    """
    doc_name = Path(pdf_path).stem
    text = extract_pdf_text(pdf_path)
    config = get_chunk_config(len(text))

    chunks = load_chunks(doc_name, config)
    if chunks is None:
        print(f"Chunking {doc_name} with config {config}...")
        chunks = luxia_chunk(text, config["chunk_size"], config["overlap"])
        save_chunks(doc_name, chunks, config)
    else:
        print(f"Loaded cached chunks for {doc_name}: {len(chunks)}")

    vectors = load_embeddings(doc_name, config)
    if vectors is None or len(vectors) != len(chunks):
        print(f"Embedding {len(chunks)} chunks...")
        texts = [c["child_chunk"] for c in chunks]
        vecs = []
        for i, t in enumerate(texts):
            print(f"  embedding {i+1}/{len(texts)}")
            vecs.append(luxia_embedding(t))
            time.sleep(EMBED_DELAY)
        vectors = np.array(vecs, dtype="float32")
        save_embeddings(doc_name, vectors, config)
    else:
        print(f"Loaded cached embeddings for {doc_name}: {len(vectors)}")

    vectors_normalized = vectors.copy().astype("float32")
    faiss.normalize_L2(vectors_normalized)

    index = faiss.IndexFlatIP(vectors_normalized.shape[1])
    index.add(vectors_normalized)

    return chunks, index, config


def retrieve(query, index, chunks, k):
    q_vec = luxia_embedding(query)
    q_vec = np.array([q_vec], dtype="float32")
    faiss.normalize_L2(q_vec)

    scores, indices = index.search(q_vec, k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        results.append({
            "child_id": chunks[idx]["child_id"],
            "score": float(score),
            "text": chunks[idx]["child_chunk"]
        })
    return results


def call_luxia(prompt, retries=5):
    wait_time = 1.0

    for attempt in range(retries):
        try:
            response = requests.post(
                "https://bridge.luxiacloud.com/luxia/v1/chat",
                headers={
                    "apikey": API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0,
                    "stream": False
                },
                timeout=30
            )

            if response.status_code == 429:
                print(f"[429 Rate limit] sleeping {wait_time:.1f}s...")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2
                continue

            response.raise_for_status()

            data = response.json()
            return data["choices"][0]["message"]["content"].strip().lower()

        except Exception as e:
            print(f"[Retry {attempt+1}] Error:", e)
            time.sleep(wait_time + random.uniform(0, 0.5))
            wait_time *= 2

    return "error"


FALLACY_PROMPT_TEMPLATE = """You are an expert in logical fallacies.

Classify the statement using the definitions below:

slippery_slope: claims one event will lead to extreme chain reaction without evidence
appeal_to_worse_problems: dismisses issue because other problems are worse
false_dilemma: presents only two options when more exist
hasty_generalization: draws conclusion from too little evidence
appeal_to_authority: claims something is true because an authority said so
none: no fallacy

Return ONLY one label:
slippery_slope, appeal_to_worse_problems, false_dilemma, hasty_generalization, appeal_to_authority, none

Statement:
{text}

Label:
"""


def classify_fallacy(user_statement):
    if not user_statement or not user_statement.strip():
        return "none"

    prompt = FALLACY_PROMPT_TEMPLATE.format(text=user_statement)
    label = call_luxia(prompt)

    # sanitize: make sure we got a valid label back
    label = label.strip().lower()
    if label not in FALLACY_LABELS:
        # fall back to "none" if the model returned something unexpected
        print(f"[WARN] Unexpected fallacy label '{label}', defaulting to 'none'")
        label = "none"

    return label


MAIN_PROMPT_TEMPLATE = """{persona}

Your responses must be based ONLY on the document excerpts provided below. Do not use outside knowledge. Do not refer to "chunks," "excerpts," "the document says," or similar meta-references — speak naturally, as if the information were simply part of your own argument. If the excerpts do not contain enough information to address the statement, say so explicitly rather than guessing.

{fallacy_note}

Reference material:
{context}

User statement:
{user_statement}

Respond in a constructive, debate-appropriate tone, in 2-4 sentences. Do not mention "chunks" or "excerpts" in your response.
"""


def build_fallacy_note(label):
    if label == "none":
        return ""

    descriptions = {
        "slippery_slope": "claims one event will lead to an extreme chain reaction without evidence",
        "appeal_to_worse_problems": "dismisses the issue because other problems are worse",
        "false_dilemma": "presents only two options when more exist",
        "hasty_generalization": "draws a conclusion from too little evidence",
        "appeal_to_authority": "claims something is true because an authority said so",
    }

    return (
        f"Note: the user's statement may contain a '{label}' fallacy "
        f"({descriptions.get(label, '')}). If relevant, briefly and "
        f"constructively point this out before addressing the substance "
        f"using the document excerpts."
    )


def build_context(retrieved_chunks):
    # NOTE: chunk IDs are deliberately NOT included here, so the LLM
    # doesn't reference "chunk N" in its response. They're still
    # available in retrieved_chunks for your own logging/UI.
    parts = [r["text"] for r in retrieved_chunks]
    return "\n\n---\n\n".join(parts)


DIFFICULTY_CONFIG = {
    "easy": {
        "persona": (
            "You are a friendly, encouraging debate partner suited for beginners. "
            "Keep your counterarguments gentle and straightforward. Avoid overly "
            "complex reasoning chains. Occasionally acknowledge good points the "
            "user makes before offering a counterpoint."
        ),
        "feedback_focus": (
            "Focus on building confidence. Emphasize what the user did well, "
            "use simple and encouraging language, and suggest only 1 small, "
            "achievable improvement. Avoid overwhelming the user with multiple "
            "criticisms."
        ),
    },
    "medium": {
        "persona": (
            "You are a balanced, moderately challenging debate partner. Offer "
            "well-reasoned counterarguments grounded in the reference material, "
            "and point out weaknesses in the user's reasoning when relevant, "
            "but remain collegial."
        ),
        "feedback_focus": (
            "Provide a balanced mix of strengths and areas for improvement. "
            "Point out any logical fallacies detected and explain briefly why "
            "they weaken the argument. Suggest 1-2 concrete improvements."
        ),
    },
    "hard": {
        "persona": (
            "You are a rigorous, challenging debate opponent. Press the user "
            "on weaknesses, gaps in evidence, and logical inconsistencies. "
            "Use the reference material to construct strong counterarguments "
            "and do not concede points easily. Remain respectful but firm."
        ),
        "feedback_focus": (
            "Be direct and critical. Thoroughly analyze weaknesses, including "
            "every logical fallacy detected, unsupported claims, and missed "
            "opportunities to engage with the reference material. Hold the "
            "user to a high standard and give detailed, actionable suggestions "
            "for improvement."
        ),
    },
}


def get_difficulty_config(level):
    level = (level or "medium").strip().lower()
    if level not in DIFFICULTY_CONFIG:
        print(f"[WARN] Unknown difficulty '{level}', defaulting to 'medium'")
        level = "medium"
    return level, DIFFICULTY_CONFIG[level]


OPENING_PROMPT_TEMPLATE = """{persona}

Read the document excerpts below and take a clear stance on the central topic or argument of the document.

Document excerpts:
{context}

In exactly two sentences, state your stance (the position you will be arguing for in this debate) and a brief reason for it. Do not exceed two sentences. Base your stance only on the content of the excerpts above.
"""


def generate_opening_stance(index, chunks, k, difficulty_cfg):
    overview_query = "main argument thesis summary of this document"
    retrieved = retrieve(overview_query, index, chunks, k)
    context = build_context(retrieved)

    prompt = OPENING_PROMPT_TEMPLATE.format(
        persona=difficulty_cfg["persona"],
        context=context
    )
    response = call_luxia_preserve_case(prompt)

    return response, retrieved


def call_luxia_preserve_case(prompt, retries=5):
    wait_time = 1.0

    for attempt in range(retries):
        try:
            response = requests.post(
                "https://bridge.luxiacloud.com/luxia/v1/chat",
                headers={
                    "apikey": API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0,
                    "stream": False
                },
                timeout=30
            )

            if response.status_code == 429:
                print(f"[429 Rate limit] sleeping {wait_time:.1f}s...")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2
                continue

            response.raise_for_status()

            data = response.json()
            return data["choices"][0]["message"]["content"].strip()

        except Exception as e:
            print(f"[Retry {attempt+1}] Error:", e)
            time.sleep(wait_time + random.uniform(0, 0.5))
            wait_time *= 2

    return "error"


def answer_user_statement(user_statement, index, chunks, k, difficulty_cfg):
    # Step 1: fallacy check (independent of retrieval)
    fallacy_label = classify_fallacy(user_statement)

    # Step 2: retrieve relevant chunks from the uploaded document
    retrieved = retrieve(user_statement, index, chunks, k)

    # Step 3: build main prompt and call the LLM
    fallacy_note = build_fallacy_note(fallacy_label)
    context = build_context(retrieved)

    prompt = MAIN_PROMPT_TEMPLATE.format(
        persona=difficulty_cfg["persona"],
        fallacy_note=fallacy_note,
        context=context,
        user_statement=user_statement
    )

    response = call_luxia_preserve_case(prompt)

    return {
        "fallacy_label": fallacy_label,
        "retrieved": retrieved,
        "response": response
    }


FEEDBACK_PROMPT_TEMPLATE = """You are a debate coach. Below is the transcript of a debate (difficulty level: {difficulty}) between a user and an AI debate assistant, based on a document the user uploaded.

Transcript:
{transcript}

Write feedback for the USER (not the AI) covering:
1. A brief summary (2-3 sentences) of how the debate went and the main points the user raised.
2. What the user did well (e.g. use of evidence, clarity, addressing counterarguments).
3. Specific areas for improvement (e.g. logical fallacies detected during the debate, missed opportunities to engage with the document, weak or unsupported claims).
4. One or two concrete suggestions for how the user could strengthen their arguments next time.

{feedback_focus}

Reference concrete moments from the transcript where relevant. Keep the total feedback under 200 words.
"""


def build_transcript(history):
    """Build a readable transcript string from the history list,
    including fallacy labels detected for user messages."""
    lines = []
    for turn in history:
        if turn["role"] == "assistant" and turn["type"] == "opening_stance":
            lines.append(f"AI (opening stance): {turn['message']}")
        elif turn["role"] == "user":
            if turn["message"].strip().lower() == "end":
                continue
            fallacy = turn.get("fallacy_label")
            if fallacy and fallacy != "none":
                lines.append(f"User: {turn['message']}  [Detected fallacy: {fallacy}]")
            else:
                lines.append(f"User: {turn['message']}")
        elif turn["role"] == "assistant" and turn["type"] == "message":
            lines.append(f"AI: {turn['message']}")
    return "\n".join(lines)


def generate_feedback(history, difficulty, difficulty_cfg):
    transcript = build_transcript(history)

    if not transcript.strip():
        return "No debate took place, so no feedback can be given."

    prompt = FEEDBACK_PROMPT_TEMPLATE.format(
        difficulty=difficulty,
        transcript=transcript,
        feedback_focus=difficulty_cfg["feedback_focus"]
    )
    return call_luxia_preserve_case(prompt)


def save_history(history, pdf_path, output_folder="chat_history"):
    out_dir = Path(output_folder)
    out_dir.mkdir(exist_ok=True)

    doc_name = Path(pdf_path).stem
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"{doc_name}_{timestamp}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

    return out_path


def run_debate(pdf_path, difficulty="medium"):
    difficulty, difficulty_cfg = get_difficulty_config(difficulty)

    chunks, index, config = prepare_document(pdf_path)
    k = config["k"]
    print(f"Document ready. Using k={k} (chunk_size={config['chunk_size']}, overlap={config['overlap']})")
    print(f"Difficulty: {difficulty}")

    history = []

    # --- Chatbot opens the debate ---
    opening_stance, opening_retrieved = generate_opening_stance(index, chunks, k, difficulty_cfg)
    print(f"\nChatbot: {opening_stance}\n")

    history.append({
        "role": "assistant",
        "type": "opening_stance",
        "message": opening_stance,
        "retrieved": opening_retrieved
    })

    # --- Conversation loop ---
    while True:
        user_input = input("You: ").strip()

        if not user_input:
            print("(Please type something, or type 'end' to finish the debate.)")
            continue

        if user_input.lower() == "end":
            print("\nChatbot: Thanks for the debate. Ending session now.")
            history.append({
                "role": "user",
                "type": "message",
                "message": user_input
            })
            break

        result = answer_user_statement(user_input, index, chunks, k, difficulty_cfg)

        history.append({
            "role": "user",
            "type": "message",
            "message": user_input,
            "fallacy_label": result["fallacy_label"]
        })

        print(f"\nChatbot: {result['response']}\n")

        history.append({
            "role": "assistant",
            "type": "message",
            "message": result["response"],
            "fallacy_label": result["fallacy_label"],
            "retrieved": result["retrieved"]
        })

    # --- Generate feedback for the user ---
    print("\nGenerating feedback on your debate performance...\n")
    feedback = generate_feedback(history, difficulty, difficulty_cfg)
    print("=== Debate Feedback ===")
    print(feedback)
    print("=======================\n")

    history.append({
        "role": "assistant",
        "type": "feedback",
        "message": feedback
    })

    # --- Save history (including feedback) ---
    out_path = save_history(history, pdf_path)
    print(f"\nConversation and feedback saved to {out_path}")


if __name__ == "__main__":
    pdf_path =  r"C:\Users\silvi\PycharmProjects\pythonProject2\FastFashionSustainability.pdf"

    difficulty_input = input("Choose difficulty (easy / medium / hard) [medium]: ").strip()
    if not difficulty_input:
        difficulty_input = "medium"

    run_debate(pdf_path, difficulty=difficulty_input)
