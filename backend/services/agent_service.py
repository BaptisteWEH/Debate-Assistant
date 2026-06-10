import json
from typing import Any

from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI


class DebateAgent:
    def __init__(self, google_api_key: str, model_name: str = "gemini-2.5-flash-lite"):
        self.google_api_key = google_api_key
        self.model_name = model_name

        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=google_api_key,
            temperature=0.4,
        )

    def _make_tools(self, rag_index):
        @tool
        def retrieve_evidence(query: str) -> str:
            """Retrieve relevant passages from the uploaded document."""
            if not rag_index:
                return "No RAG index is available."

            results = rag_index.search(query, top_k=3)
            return json.dumps(results, ensure_ascii=False, indent=2)

        @tool
        def detect_fallacy(argument: str) -> str:
            """Detect whether the user's argument contains a logical fallacy."""
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

            response = self.llm.invoke(prompt)
            return response.content

        return [retrieve_evidence, detect_fallacy]

    def process_turn(
        self,
        user_message: str,
        history: list[dict],
        rag_index,
        ai_position: str,
    ) -> dict[str, Any]:
        tools = self._make_tools(rag_index)

        agent = create_agent(
            model=self.llm,
            tools=tools,
            system_prompt=(
                "You are DebateCoach, a demanding but fair debate opponent. "
                "You must answer in English. "
                "You defend the position chosen at the beginning of the debate. "
                "Use the available tools to retrieve document evidence and detect "
                "logical fallacies when useful. "
                "After using tools, produce a concise, document-grounded debate "
                "response in 2-4 sentences.\n\n"
                f"Initial AI position:\n{ai_position}"
            ),
        )

        history_text = "\n".join(
            f"{'AI' if msg['role'] == 'ai' else 'User'}: {msg['text']}"
            for msg in history
        )

        result = agent.invoke({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Debate history:\n{history_text}\n\n"
                        f"User's new argument:\n{user_message}\n\n"
                        "Use the tools if relevant, then generate the next debate response."
                    ),
                }
            ]
        })

        messages = result.get("messages", [])
        final_message = messages[-1].content if messages else ""

        evidence = []
        fallacy = {
            "has_fallacy": False,
            "fallacy_type": "unknown",
            "explanation": "Fallacy output was not parsed."
        }
        agent_actions = []

        for msg in messages:
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                for call in tool_calls:
                    agent_actions.append(call.get("name", "unknown_tool"))

            if getattr(msg, "name", None) == "retrieve_evidence":
                try:
                    evidence = json.loads(msg.content)
                except Exception:
                    evidence = []

            if getattr(msg, "name", None) == "detect_fallacy":
                cleaned = msg.content.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("```")[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip()

                try:
                    fallacy = json.loads(cleaned)
                except Exception:
                    fallacy = {
                        "has_fallacy": False,
                        "fallacy_type": "unknown",
                        "explanation": "Fallacy tool output could not be parsed."
                    }

        return {
            "response": final_message,
            "evidence": evidence,
            "fallacy": fallacy,
            "strategy": "langchain_create_agent",
            "agent_actions": agent_actions,
        }