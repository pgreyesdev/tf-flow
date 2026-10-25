"""Esquemas del asistente conversacional."""

from itertools import pairwise
from typing import Literal

from pydantic import BaseModel, Field, model_validator

MAX_MESSAGE_CHARS = 1_000
MAX_HISTORY = 20


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_HISTORY)

    @model_validator(mode="after")
    def alternates_and_ends_with_user(self) -> "ChatRequest":
        roles = [m.role for m in self.messages]
        if roles[0] != "user" or roles[-1] != "user":
            raise ValueError("La conversación debe empezar y terminar con un mensaje del usuario")
        if any(a == b for a, b in pairwise(roles)):
            raise ValueError("Los mensajes deben alternar entre usuario y asistente")
        return self


class ChatReply(BaseModel):
    reply: str
    tools_used: list[str] = Field(description="Herramientas que consultó el asistente")
    tokens_used: int
