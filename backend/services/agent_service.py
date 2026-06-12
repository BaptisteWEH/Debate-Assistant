import json
import time
import random
import requests

LUXIA_API_KEY = "key"
CHAT_URL = "https://bridge.luxiacloud.com/luxia/v1/chat"
MODEL = "luxia3-llm-8b-0731"


class DebateAgent:
    def __init__(self, luxia_api_key: str = LUXIA_API_KEY, model_name: str = MODEL):
        self.api_key = luxia_api_key
        self.model_name = model_name

    def _call_luxia(self, prompt: str, retries: int = 5) -> str:
        wait_time = 1.0
        for attempt in range(retries):
            try:
                response = requests.post(
                    CHAT_URL,
                    headers={"apikey": self.api_key, "Content-Type": "application/json"},
                    json={
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.4,
                        "stream": False,
                    },
                    timeout=30,
                )

                if response.status_code == 429:
                    time.sleep(wait_time + random.uniform(0, 0.5))
                    wait_time *= 2
                    continue

                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"].strip()

            except Exception as e:
                print(f"[LUXIA RETRY {attempt+1}] {e}")
                time.sleep(wait_time + random.uniform(0, 0.5))
                wait_time *= 2

        return "error"

    def _detect_fallacy(self, argument: str) -> dict:
        prompt = (
            "Analyze the following argument and determine whether it contains "
            "a logical fallacy.\n\n"
            f"Argument:\n{argument}\n\n"
            "Return ONLY valid JSON with this structure:\n"
            "{\n"
            '  "has_fallacy": true/false,\n'
            '  "fallacy_type": "name of fallacy or none",\n'
            '  "explanation": "short explanation"\n'
            "}"
        )
        raw = self._call_luxia(prompt)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except Exception:
            return {
                "has_fallacy": False,
                "fallacy_type": "unknown",
                "explanation": "Fallacy output could not be parsed.",
            }

    def process_turn(self, user_message: str, history: list[dict], rag_index, ai_position: str) -> dict:
        # 1. Retrieve evidence from the document
        evidence = rag_index.search(user_message, top_k=3) if rag_index else []

        # 2. Detect fallacy in the user's argument
        fallacy = self._detect_fallacy(user_message)

        # 3. Build debate history text
        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
            for msg in history
        )

        # 4. Build context from retrieved evidence
        context = "\n\n---\n\n".join(e["text"] for e in evidence)

        fallacy_note = ""
        if fallacy.get("has_fallacy"):
            fallacy_note = (
                f"Note: the user's statement may contain a '{fallacy.get('fallacy_type')}' fallacy "
                f"({fallacy.get('explanation', '')}). If relevant, briefly and constructively "
                f"point this out before addressing the substance."
            )

        prompt = (
            "You are DebateCoach, a demanding but fair debate opponent. "
            "You must answer in English. "
            "You defend the position chosen at the beginning of the debate. "
            "Produce a concise, document-grounded debate response in 2-4 sentences. "
            "Do not refer to 'chunks,' 'excerpts,' or 'the document says' — speak naturally.\n\n"
            f"Initial AI position:\n{ai_position}\n\n"
            f"{fallacy_note}\n\n"
            f"Reference material:\n{context}\n\n"
            f"Debate history:\n{history_text}\n\n"
            f"User's new argument:\n{user_message}\n\n"
            "Generate the next debate response."
        )

        response_text = self._call_luxia(prompt)

        agent_actions = ["retrieve_evidence"]
        if fallacy.get("has_fallacy") is not None:
            agent_actions.append("detect_fallacy")

        return {
            "response": response_text,
            "evidence": evidence,
            "fallacy": fallacy,
            "strategy": "luxia_manual_pipeline",
            "agent_actions": agent_actions,
        }