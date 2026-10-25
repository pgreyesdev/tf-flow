from fastapi import APIRouter, HTTPException, status

from tf_flow_api.api.deps import AssistantDep
from tf_flow_api.domain.chat import ChatReply, ChatRequest
from tf_flow_api.services.assistant import AssistantUnavailableError

router = APIRouter(prefix="/assistant", tags=["asistente"])


@router.post(
    "/chat",
    summary="Pregunta al asistente por el tráfico",
    responses={
        401: {"description": "Token del asistente incorrecto"},
        429: {"description": "Demasiadas preguntas seguidas"},
        503: {"description": "Asistente desactivado, saturado o sin presupuesto"},
    },
)
async def chat(request: ChatRequest, service: AssistantDep) -> ChatReply:
    try:
        return await service.reply(request.messages)
    except AssistantUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
