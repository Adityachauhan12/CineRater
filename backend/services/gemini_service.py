"""
Gemini service — deprecated. Groq is now the AI provider.
This stub exists so any accidental import doesn't crash the server.
"""


class GeminiService:
    @staticmethod
    def embed_text(text):
        raise NotImplementedError("GeminiService is deprecated. Use EmbeddingService.")

    @staticmethod
    def chat_completion(messages, tools=None):
        raise NotImplementedError("GeminiService is deprecated. Use Groq via ai_agent_service.")

    @staticmethod
    def chat_stream(messages):
        raise NotImplementedError("GeminiService is deprecated. Use Groq via ai_agent_service.")
