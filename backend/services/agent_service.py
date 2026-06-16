import json
import time
import random
import requests
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

CHAT_URL = "https://bridge.luxiacloud.com/luxia/v1/chat"
SEARCH_URL = "https://bridge.luxiacloud.com/search/perplexity/sonar/search_api"

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

# ─── Difficulty / persona configuration ───────────────────────────────────────

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


def get_difficulty_config(level: str) -> tuple[str, dict]:
    """Map frontend level name to DIFFICULTY_CONFIG key and return (key, cfg)."""
    level = (level or "easy").strip().lower()
    # frontend sends "intermediate", config key is "medium"
    if level == "intermediate":
        level = "medium"
    if level not in DIFFICULTY_CONFIG:
        print(f"[WARN] Unknown difficulty '{level}', defaulting to 'easy'")
        level = "easy"
    return level, DIFFICULTY_CONFIG[level]


# ─── Prompt templates ─────────────────────────────────────────────────────────

OPENING_PROMPT_TEMPLATE = """{persona}

You must answer in English.

Read the document excerpts below and take a clear stance on the central topic or argument of the document.

Document excerpts:
{context}

In exactly two sentences, state your stance (the position you will be arguing for in this debate) and a brief reason for it. Do not exceed two sentences. Base your stance only on the content of the excerpts above. Then, in a third sentence, invite the user to present their argument.
"""

MAIN_PROMPT_TEMPLATE = """{persona}

You must answer in English. You defend the position chosen at the beginning of the debate.

Your responses must be based ONLY on the document excerpts provided below. Do not use outside knowledge. Do not refer to "chunks," "excerpts," "the document says," or similar meta-references - speak naturally, as if the information were simply part of your own argument. If the excerpts do not contain enough information to address the statement, say so explicitly rather than guessing.

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

ROUTER_PROMPT_TEMPLATE = """You are a routing agent for a debate application.

The AI's current debate position is:
{ai_position}

Recent debate history:
{history_text}

The user just said:
"{user_message}"

Decide which action best fits this message:
- "continue_debate": a genuine debate argument fully addressable using the document.
- "request_clarification": off-topic, too vague, or unrelated to the debate.
- "end_debate": the user is indicating they want to end, stop, or finish the debate (e.g. "let's stop here", "I'm done", "end the debate", "that's enough for me").
- "send_feedback_email": the user is asking for the debate feedback/summary/results to be sent to them by email.
- "search_web": the user made a factual claim about current events, recent developments, or external facts that the document likely does NOT cover, and which would benefit from a web search to verify or respond accurately.

Respond ONLY with valid JSON in this exact format and nothing else:
{{"action": "continue_debate" | "request_clarification" | "end_debate" | "send_feedback_email" | "search_web", "reason": "<short reason>"}}
"""

CLARIFICATION_RESPONSE_TEMPLATE = """The user's message does not appear to relate to the debate topic. Reason: {reason}

Generate a brief response (2-3 sentences) that directly and matter-of-factly redirects the user back to the debate topic, then restates the AI's current position.

BAD example (do not write like this): "I appreciate your input, but I need to keep our discussion focused on the debate topic."
GOOD example (write like this): "That's not related to our debate. Let's get back to the topic. [restate the AI's position briefly]."

Tone: brisk, businesslike, slightly impatient - like a debate opponent who wants to get back on track.

Initial AI position:
{ai_position}
"""

ENDING_RESPONSE_TEMPLATE = """The user has indicated they want to end the debate. Reason: {reason}

Generate a brief, warm closing response (1-2 sentences) that:
1. Thanks the user for the debate.
2. Lets them know their performance summary and feedback are being generated.

Initial AI position (for context only):
{ai_position}
"""

EMAIL_EXTRACTION_TEMPLATE = """The user wants their debate feedback sent by email. Extract the email address from their message.

User message: "{user_message}"

Respond ONLY with valid JSON in this exact format and nothing else:
{{"email": "<extracted email or null if none found>"}}
"""

EMAIL_CONFIRMATION_TEMPLATE = """The user asked for their debate feedback to be sent to {email}.

Generate a brief response (1-2 sentences) confirming the email has been sent to that address.
"""

EMAIL_FAILURE_TEMPLATE = """The user asked for their debate feedback to be sent by email, but no valid email address could be found in their message.

Generate a brief response (1-2 sentences) asking them to provide a valid email address.
"""

SEARCH_QUERY_TEMPLATE = """The user made a claim that may require external verification beyond the debate document.

User message: "{user_message}"

Generate a short, specific web search query (3-8 words) to verify or find information about this claim.

Respond ONLY with the search query text, nothing else.
"""

SEARCH_RESPONSE_TEMPLATE = """{persona}

You must answer in English. You defend the position chosen at the beginning of the debate.

The user made a claim that goes beyond the debate document, so you searched the web for additional context.

{fallacy_note}

Initial AI position:
{ai_position}

Document evidence (if any):
{context}

Web search results:
{search_results}

Debate history:
{history_text}

User's new argument:
{user_statement}

Respond in a constructive, debate-appropriate tone, in 2-4 sentences. You may reference the web search results naturally (e.g. "recent reports indicate...") without mentioning "search results" or "chunks" explicitly.
"""


# ─── Agent class ──────────────────────────────────────────────────────────────

class DebateAgent:
    def __init__(self, luxia_api_key: str, model_name: str):
        self.api_key = luxia_api_key
        self.model_name = model_name

    def _call_luxia(self, prompt: str, retries: int = 5, lowercase: bool = False, temperature: float = 0) -> str:
        wait_time = 1.0
        for attempt in range(retries):
            try:
                response = requests.post(
                    CHAT_URL,
                    headers={"apikey": self.api_key, "Content-Type": "application/json"},
                    json={
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
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

    def generate_opening_stance(self, rag_index, difficulty_cfg: dict) -> dict:
        overview_query = "main argument thesis summary of this document"
        evidence = rag_index.search(overview_query) if rag_index else []
        context = "\n\n---\n\n".join(e["text"] for e in evidence)
        prompt = OPENING_PROMPT_TEMPLATE.format(
            persona=difficulty_cfg["persona"],
            context=context,
        )
        return {"response": self._call_luxia(prompt), "evidence": evidence}

    def _route_message(self, user_message: str, history: list[dict], ai_position: str) -> dict:
        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
            for msg in history[-6:]
        )
        prompt = ROUTER_PROMPT_TEMPLATE.format(
            ai_position=ai_position,
            history_text=history_text,
            user_message=user_message,
        )
        raw = self._call_luxia(prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        try:
            decision = json.loads(cleaned)
            if decision.get("action") not in (
                "continue_debate", "request_clarification", "end_debate",
                "send_feedback_email", "search_web"
            ):
                decision = {"action": "continue_debate", "reason": "default (invalid action)"}
        except (json.JSONDecodeError, ValueError):
            print(f"[ROUTER] Invalid JSON, defaulting to continue_debate: {raw}")
            decision = {"action": "continue_debate", "reason": "default (parse error)"}
        return decision

    def _generate_clarification(self, reason: str, ai_position: str, history: list[dict]) -> str:
        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
            for msg in history[-6:]
        )
        prompt = CLARIFICATION_RESPONSE_TEMPLATE.format(
            reason=reason,
            ai_position=ai_position,
            history_text=history_text,
        )
        return self._call_luxia(prompt)

    def _extract_email(self, user_message: str) -> str | None:
        prompt = EMAIL_EXTRACTION_TEMPLATE.format(user_message=user_message)
        raw = self._call_luxia(prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        try:
            data = json.loads(cleaned)
            email = data.get("email")
            if email and email.lower() != "null" and "@" in email:
                return email.strip()
        except (json.JSONDecodeError, ValueError):
            print(f"[EMAIL EXTRACT] Invalid JSON: {raw}")
        return None

    def _send_feedback_email(self, to_email: str, feedback: dict, session_id: str) -> bool:
        sender = os.getenv("SMTP_EMAIL")
        app_password = os.getenv("SMTP_APP_PASSWORD")
        if not sender or not app_password:
            print("[EMAIL] SMTP credentials not configured")
            return False
        subject = "Your DebateCoach Feedback"
        body = (
            f"Hi,\n\nHere is your debate feedback (session: {session_id}).\n\n"
            f"Score - You: {feedback['score']['user']}/100, AI: {feedback['score']['ai']}/100\n\n"
            f"{feedback['summary']}\n\n- DebateCoach\n"
        )
        msg = MIMEMultipart()
        msg["From"] = sender
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        try:
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(sender, app_password)
                server.send_message(msg)
            return True
        except Exception as e:
            print(f"[EMAIL ERROR] {e}")
            return False

    def _classify_fallacy(self, user_statement: str) -> str:
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

    def _search_web(self, user_message: str) -> str:
        query_prompt = SEARCH_QUERY_TEMPLATE.format(user_message=user_message)
        query = self._call_luxia(query_prompt).strip()
        try:
            response = requests.post(
                SEARCH_URL,
                headers={"apikey": self.api_key, "Content-Type": "application/json"},
                json={"query": query},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            results = data.get("result", {}).get("results", [])
            if not results:
                return "No relevant web search results found."
            snippets = []
            for r in results[:3]:
                title = r.get("title", "")
                snippet = r.get("snippet", "")[:500]
                snippets.append(f"{title}: {snippet}")
            return "\n\n".join(snippets)
        except Exception as e:
            print(f"[SEARCH ERROR] {e}")
            return "Web search unavailable."

    def process_turn(
        self,
        user_message: str,
        history: list[dict],
        rag_index,
        ai_position: str,
        session_data: dict,
        feedback_fn,
        difficulty_cfg: dict | None = None,
        regenerate: bool = False,
    ) -> dict:
        if difficulty_cfg is None:
            difficulty_cfg = DIFFICULTY_CONFIG["easy"]
        persona = difficulty_cfg["persona"]

        decision = self._route_message(user_message, history, ai_position)

        if decision["action"] == "end_debate":
            prompt = ENDING_RESPONSE_TEMPLATE.format(
                reason=decision["reason"],
                ai_position=ai_position,
            )
            return {
                "response": self._call_luxia(prompt),
                "evidence": [],
                "fallacy": {"has_fallacy": False, "fallacy_type": "none", "explanation": "No fallacy detected."},
                "strategy": "agent_end_debate",
                "agent_decision": decision["action"],
                "agent_reason": decision["reason"],
                "pipeline_steps": [],
            }

        if decision["action"] == "send_feedback_email":
            email = self._extract_email(user_message)
            if email is None:
                return {
                    "response": self._call_luxia(EMAIL_FAILURE_TEMPLATE),
                    "evidence": [],
                    "fallacy": {"has_fallacy": False, "fallacy_type": "none", "explanation": "No fallacy detected."},
                    "strategy": "agent_email_failed",
                    "agent_decision": decision["action"],
                    "agent_reason": decision["reason"],
                    "pipeline_steps": [],
                }
            feedback = feedback_fn(session_data)
            sent = self._send_feedback_email(email, feedback, session_data.get("session_id", "unknown"))
            response_text = (
                self._call_luxia(EMAIL_CONFIRMATION_TEMPLATE.format(email=email))
                if sent
                else f"I tried to send the feedback to {email}, but something went wrong. Please try again later."
            )
            return {
                "response": response_text,
                "evidence": [],
                "fallacy": {"has_fallacy": False, "fallacy_type": "none", "explanation": "No fallacy detected."},
                "strategy": "agent_send_email",
                "agent_decision": decision["action"],
                "agent_reason": decision["reason"],
                "pipeline_steps": [],
            }

        if decision["action"] == "search_web":
            search_results = self._search_web(user_message)
            evidence = rag_index.search(user_message) if rag_index else []
            fallacy_label = self._classify_fallacy(user_message)
            fallacy_note = self._build_fallacy_note(fallacy_label)
            history_text = "\n".join(
                f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}" for msg in history
            )
            prompt = SEARCH_RESPONSE_TEMPLATE.format(
                persona=persona, fallacy_note=fallacy_note, ai_position=ai_position,
                context="\n\n---\n\n".join(e["text"] for e in evidence),
                search_results=search_results, history_text=history_text, user_statement=user_message,
            )
            return {
                "response": self._call_luxia(prompt),
                "evidence": evidence,
                "fallacy": {"has_fallacy": fallacy_label != "none", "fallacy_type": fallacy_label,
                            "explanation": FALLACY_DESCRIPTIONS.get(fallacy_label, "No fallacy detected.")},
                "strategy": "agent_search_web",
                "agent_decision": decision["action"],
                "agent_reason": decision["reason"],
                "pipeline_steps": ["search_web", "retrieve_evidence", "detect_fallacy", "generate_response"],
            }

        if decision["action"] == "request_clarification":
            return {
                "response": self._generate_clarification(decision["reason"], ai_position, history),
                "evidence": [],
                "fallacy": {"has_fallacy": False, "fallacy_type": "none", "explanation": "No fallacy detected."},
                "strategy": "agent_clarification",
                "agent_decision": decision["action"],
                "agent_reason": decision["reason"],
                "pipeline_steps": [],
            }

        # continue_debate
        evidence = rag_index.search(user_message) if rag_index else []
        fallacy_label = self._classify_fallacy(user_message)
        fallacy_note = self._build_fallacy_note(fallacy_label)
        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}" for msg in history
        )
        regen_note = (
            "\nIMPORTANT: The user has requested a different response. "
            "Use a completely different angle, argument structure, or piece of evidence than your previous reply. "
            "Do not repeat or paraphrase what you said before."
            if regenerate else ""
        )
        prompt = MAIN_PROMPT_TEMPLATE.format(
            persona=persona + regen_note, fallacy_note=fallacy_note, ai_position=ai_position,
            context="\n\n---\n\n".join(e["text"] for e in evidence),
            history_text=history_text, user_statement=user_message,
        )
        temperature = 0.75 if regenerate else 0
        return {
            "response": self._call_luxia(prompt, temperature=temperature),
            "evidence": evidence,
            "fallacy": {"has_fallacy": fallacy_label != "none", "fallacy_type": fallacy_label,
                        "explanation": FALLACY_DESCRIPTIONS.get(fallacy_label, "No fallacy detected.")},
            "strategy": "luxia_manual_pipeline",
            "agent_decision": decision["action"],
            "agent_reason": decision["reason"],
            "pipeline_steps": ["retrieve_evidence", "detect_fallacy", "generate_response"],
        }
