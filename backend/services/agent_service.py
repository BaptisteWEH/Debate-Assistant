import json
import time
import random
import requests

CHAT_URL = "https://bridge.luxiacloud.com/luxia/v1/chat"

FALLACY_LABELS = [
    "slippery_slope",
    "appeal_to_worse_problems",
    "false_dilemma",
    "hasty_generalization",
    "appeal_to_authority",
    "none",
]

FALLACY_DESCRIPTIONS = {
    "slippery_slope": "claims one event will lead to an extreme chain reaction without evidence",
    "appeal_to_worse_problems": "dismisses the issue because other problems are worse",
    "false_dilemma": "presents only two options when more exist",
    "hasty_generalization": "draws a conclusion from too little evidence",
    "appeal_to_authority": "claims something is true because an authority said so",
    "none": "No fallacy detected.",
}

FALLACY_PROMPT_TEMPLATE = """You are an expert in logical fallacies.

Classify the statement using the definitions below:

slippery_slope: claims one event will lead to extreme chain reaction without evidence
appeal_to_worse_problems: dismisses issue because other problems are worse
false_dilemma: presents only two options when more exist
hasty_generalization: draws conclusion from too little evidence
appeal_to_authority: claims something is true because an authority said so
none: no fallacy

Return ONLY one label and ONLY if there is strong evidence.
slippery_slope, appeal_to_worse_problems, false_dilemma, hasty_generalization, appeal_to_authority

If the statement could reasonably be interpreted as non-fallacious, return "none".

IMPORTANT:
Return exactly one label and nothing else.
Do not explain your reasoning.
Do not include any extra text.

Statement:
{text}

Label:
"""

MAIN_PROMPT_TEMPLATE = """You are DebateCoach, a demanding but fair debate opponent. You must answer in English. You defend the position chosen at the beginning of the debate.

Your responses must be based ONLY on the document excerpts provided below. Do not use outside knowledge. Do not refer to "chunks," "excerpts," "the document says," or similar meta-references — speak naturally, as if the information were simply part of your own argument. If the excerpts do not contain enough information to address the statement, say so explicitly rather than guessing.

{fallacy_note}

Initial AI position:
{ai_position}

Reference material:
{context}

Debate history:
{history_text}

User's new argument:
{user_statement}

Respond in a constructive, debate-appropriate tone, in 2-4 sentences. Do not mention "chunks" or "excerpts" in your response.
"""


class DebateAgent:
    def __init__(self, luxia_api_key: str, model_name: str):
        self.api_key = luxia_api_key
        self.model_name = model_name

    def _call_luxia(self, prompt: str, retries: int = 5, lowercase: bool = False) -> str:
        wait_time = 1.0
        for attempt in range(retries):
            try:
                response = requests.post(
                    CHAT_URL,
                    headers={"apikey": self.api_key, "Content-Type": "application/json"},
                    json={
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0,
                        "stream": False,
                    },
                    timeout=30,
                )
                if response.status_code == 429:
                    print(f"[LUXIA 429] sleeping {wait_time:.1f}s...")
                    time.sleep(wait_time + random.uniform(0, 0.5))
                    wait_time *= 2
                    continue

                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"].strip()
                return content.lower() if lowercase else content

            except Exception as e:
                print(f"[LUXIA RETRY {attempt+1}] {e}")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2

        return "error"

    def _classify_fallacy(self, user_statement: str) -> str:
        """Returns a label from FALLACY_LABELS (closed set, defaults to 'none')."""
        if not user_statement or not user_statement.strip():
            return "none"

        prompt = FALLACY_PROMPT_TEMPLATE.format(text=user_statement)
        label = self._call_luxia(prompt, lowercase=True)
        label = label.strip().splitlines()[0].strip().lower()

        if label not in FALLACY_LABELS:
            print(f"[WARN] Unexpected fallacy label '{label}', defaulting to 'none'")
            label = "none"

        return label

    def _build_fallacy_note(self, label: str) -> str:
        if label == "none":
            return ""
        return (
            f"Note: the user's statement may contain a '{label}' fallacy "
            f"({FALLACY_DESCRIPTIONS.get(label, '')}). If relevant, briefly and "
            f"constructively point this out before addressing the substance "
            f"using the document excerpts."
        )

    def process_turn(self, user_message: str, history: list[dict], rag_index, ai_position: str) -> dict:
        # 1. Retrieve relevant evidence (top_k from rag_index.config["k"])
        evidence = rag_index.search(user_message) if rag_index else []

        # 2. Fallacy detection (closed-set label)
        fallacy_label = self._classify_fallacy(user_message)
        fallacy_note = self._build_fallacy_note(fallacy_label)

        fallacy = {
            "has_fallacy": fallacy_label != "none",
            "fallacy_type": fallacy_label,
            "explanation": FALLACY_DESCRIPTIONS.get(fallacy_label, "No fallacy detected."),
        }

        # 3. Build the main debate prompt
        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
            for msg in history
        )
        context = "\n\n---\n\n".join(e["text"] for e in evidence)

        prompt = MAIN_PROMPT_TEMPLATE.format(
            fallacy_note=fallacy_note,
            ai_position=ai_position,
            context=context,
            history_text=history_text,
            user_statement=user_message,
        )

        response_text = self._call_luxia(prompt)

        return {
            "response": response_text,
            "evidence": evidence,
            "fallacy": fallacy,
            "strategy": "luxia_manual_pipeline",
            "agent_actions": ["retrieve_evidence", "detect_fallacy"],
        }