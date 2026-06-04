import tiktoken
import logging
from openai import OpenAI
from app.config import settings
from typing import List

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("embeddings_service")

class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = "text-embedding-ada-002"
        try:
            self.encoding = tiktoken.get_encoding("cl100k_base")
        except Exception as e:
            logger.error(f"Failed to load tiktoken encoding: {str(e)}")
            self.encoding = None

    def count_tokens(self, text: str) -> int:
        """
        Returns number of tokens in text using the cl100k_base tokenizer.
        """
        if not self.encoding:
            # Fallback approximation (1 token ~= 4 characters)
            return len(text) // 4
        return len(self.encoding.encode(text))

    def get_embedding(self, text: str) -> List[float]:
        """
        Calls OpenAI API to generate a 1536-dimensional float vector embedding.
        """
        try:
            response = self.client.embeddings.create(
                input=[text.replace("\n", " ")],
                model=self.model
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"OpenAI API error during embedding generation: {str(e)}")
            # Return zero vector in case of sandbox failures or invalid tokens
            return [0.0] * 1536

# Singleton instance
embedding_service = EmbeddingService()
