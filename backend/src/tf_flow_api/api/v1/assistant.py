from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from tf_flow_api.api.deps import AssistantDep
from tf_flow_api.domain.chat import ChatEvent, ChatReply, ChatRequest, ErrorEvent
from tf_flow_api.services.assistant import AssistantUnavailableError

router = APIRouter(prefix="/assistant", tags=["asistente"])

ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"description": "Token del asistente incorrecto"},
    429: {"description": "Demasiadas preguntas seguidas"},
    503: {"description": "Asistente desactivado, saturado o sin presupuesto"},
}


@router.post("/chat", summary="Pregunta al asistente por el tráfico", responses=ERRORS)
async def chat(request: ChatRequest, service: AssistantDep) -> ChatReply:
    try:
        return await service.reply(request.messages)
    except AssistantUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


def _sse(event: ChatEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


async def _event_stream(first: ChatEvent, events: AsyncGenerator[ChatEvent]) -> AsyncIterator[str]:
    async with aclosing(events):
        try:
            yield _sse(first)
            async for event in events:
                yield _sse(event)
        except AssistantUnavailableError as error:
            yield _sse(ErrorEvent(detail=str(error)))


@router.post(
    "/chat/stream",
    summary="Pregunta al asistente y recibe la respuesta según se genera",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Server-Sent Events: líneas `data: {json}` con `type` tool, delta, "
            "replace, done o error",
            "content": {"text/event-stream": {}},
        },
        **ERRORS,
    },
)
async def chat_stream(request: ChatRequest, service: AssistantDep) -> StreamingResponse:
    events = service.stream(request.messages)
    try:
        # Se espera al primer evento para que los fallos de arranque (sin presupuesto, OpenAI
        # caído) sigan llegando como un 503 normal y no como un evento de error.
        first = await anext(events)
    except AssistantUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    return StreamingResponse(
        _event_stream(first, events),
        media_type="text/event-stream",
        # Sin caché ni búferes en proxies intermedios: cada trozo debe llegar en cuanto sale.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
