"""
Gemini AI service as fallback for OpenAI.
Provides embeddings and chat completions using Google's Gemini API.
"""

import json
import logging
import requests
from typing import Optional, List, Dict, Generator
from decouple import config
from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)

GEMINI_API_KEY = config('GEMINI_API_KEY')
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# New official SDK client
_genai_client = genai.Client(api_key=GEMINI_API_KEY)


class GeminiService:

    @staticmethod
    def embed_text(text: str) -> Optional[List[float]]:
        """
        Generate embedding using google-genai SDK (text-embedding-004).
        Returns list of floats or None on failure.
        """
        try:
            text = text.strip().replace('\n', ' ')
            if not text:
                return None
            result = _genai_client.models.embed_content(
                model="gemini-embedding-001",
                contents=text,
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.error(f"Gemini embedding failed: {e}")
            return None
    
    @staticmethod
    def chat_completion(messages: List[Dict], tools: Optional[List] = None) -> Optional[str]:
        """
        Generate chat completion using Gemini.
        Returns response text or None on failure.
        """
        try:
            url = f"{GEMINI_BASE_URL}/models/gemini-2.0-flash:generateContent"
            
            # Convert OpenAI format to Gemini format
            gemini_contents = []
            for msg in messages:
                if msg['role'] == 'system':
                    # Gemini doesn't have system role, prepend to first user message
                    continue
                elif msg['role'] == 'user':
                    gemini_contents.append({
                        "role": "user",
                        "parts": [{"text": msg['content']}]
                    })
                elif msg['role'] == 'assistant':
                    gemini_contents.append({
                        "role": "model",
                        "parts": [{"text": msg['content']}]
                    })
            
            # Add system message to first user message if exists
            system_msg = next((m['content'] for m in messages if m['role'] == 'system'), None)
            if system_msg and gemini_contents:
                first_user = gemini_contents[0]
                if first_user['role'] == 'user':
                    first_user['parts'][0]['text'] = f"{system_msg}\n\n{first_user['parts'][0]['text']}"
            
            payload = {
                "contents": gemini_contents,
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 1000
                }
            }
            
            response = requests.post(
                f"{url}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                candidates = data.get('candidates', [])
                if candidates:
                    content = candidates[0].get('content', {})
                    parts = content.get('parts', [])
                    if parts:
                        return parts[0].get('text', '')
            else:
                logger.error(f"Gemini chat error: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"Gemini chat completion failed: {e}")
            
        return None
    
    @staticmethod
    def chat_stream(messages: List[Dict]) -> Generator[str, None, None]:
        """
        Stream chat completion using Gemini.
        Yields text chunks.
        """
        try:
            # For now, get full response and chunk it
            response = GeminiService.chat_completion(messages)
            if response:
                # Chunk the response for streaming effect
                chunk_size = 30
                for i in range(0, len(response), chunk_size):
                    chunk = response[i:i + chunk_size]
                    yield chunk
            else:
                yield "Sorry, I'm having trouble connecting to the AI service."
                
        except Exception as e:
            logger.error(f"Gemini streaming failed: {e}")
            yield "Sorry, I encountered an error."