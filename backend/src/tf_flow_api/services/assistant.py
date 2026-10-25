"""Asistente de TF-FLOW: un modelo de OpenAI responde preguntas consultando la previsión.

El bucle de herramientas es manual para controlar el gasto: cada conversación tiene un máximo de
rondas, cada respuesta un máximo de tokens y el servicio un presupuesto diario compartido.
"""

import datetime as dt
import json
import logging
import unicodedata
from collections.abc import Callable
from typing import Any, Literal, cast

import openai
from openai.resources.responses import AsyncResponses
from openai.types.responses import FunctionToolParam, Response, ResponseInputItemParam
from pydantic import BaseModel, Field, ValidationError

from tf_flow_api.domain.chat import ChatMessage, ChatReply
from tf_flow_api.services.forecast import (
    DateOutOfRangeError,
    ForecastService,
    StationNotFoundError,
    today_in_tenerife,
)

logger = logging.getLogger(__name__)

Effort = Literal["low", "medium", "high"]
MAX_TOOL_ROUNDS = 6
MAX_OUTPUT_TOKENS = 4_096
WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")

SYSTEM_PROMPT = """\
Eres el asistente de TF-FLOW, una aplicación que prevé la congestión en las carreteras de Tenerife \
a partir de las estaciones de aforo del Cabildo.

Responde en español, breve y claro, como alguien de la isla que conoce sus carreteras. Para \
cualquier dato de tráfico usa las herramientas: no inventes cifras ni estaciones. Si no sabes qué \
estación busca la persona, búscala por nombre; si no indica el sentido y la vía tiene dos, \
consulta ambos o pregunta.

Las previsiones salen de un modelo entrenado con datos históricos que el Cabildo publica con un \
mes de retraso, así que son orientativas: no conocen accidentes, obras ni eventos de hoy. Los \
niveles son low (fluido), medium (denso) y high (atasco fuerte). Las horas son locales de Canarias.

Si te preguntan algo que no tiene que ver con el tráfico de Tenerife, dilo con amabilidad y \
reconduce la conversación."""

UNAVAILABLE_REPLY = (
    "No puedo responder a eso. Pregúntame por el tráfico en las carreteras de Tenerife."
)


def _tool(name: str, description: str, properties: dict[str, Any]) -> FunctionToolParam:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOLS: list[FunctionToolParam] = [
    _tool(
        "find_stations",
        "Busca estaciones de aforo por nombre o lugar (por ejemplo 'Cristianos' o 'Guamasa'). "
        "Devuelve id, sentido y nombre. Con una cadena vacía devuelve todas.",
        {"query": {"type": "string", "description": "Texto a buscar en el nombre"}},
    ),
    _tool(
        "get_day_forecast",
        "Previsión hora a hora de un día para una estación y sentido: vehículos, nivel y "
        "probabilidad de atasco fuerte, con la hora de más riesgo y sus motivos.",
        {
            "station_id": {"type": "integer"},
            "direction": {"type": "integer", "enum": [-1, 0, 1]},
            "date": {"type": "string", "description": "Fecha AAAA-MM-DD"},
        },
    ),
    _tool(
        "get_model_info",
        "Hasta qué fecha llegan los datos del modelo y qué precisión tuvo en el periodo de test.",
        {},
    ),
]


class _FindStations(BaseModel):
    query: str = Field(max_length=100)


class _DayForecast(BaseModel):
    station_id: int
    direction: int
    date: dt.date


class AssistantUnavailableError(RuntimeError):
    """El proveedor del modelo no está disponible o se agotó el presupuesto; la API responde 503."""


def _fold(text: str) -> str:
    """Minúsculas y sin tildes, para buscar 'guimar' y encontrar 'GÜÍMAR'."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


class TokenBudget:
    """Tokens gastados hoy (hora de Canarias) por todo el servicio."""

    def __init__(self, daily_limit: int, today: Callable[[], dt.date] = today_in_tenerife) -> None:
        self.daily_limit = daily_limit
        self.today = today
        self._day = today()
        self._spent = 0

    def _roll(self) -> None:
        if self.today() != self._day:
            self._day, self._spent = self.today(), 0

    def exhausted(self) -> bool:
        self._roll()
        return self._spent >= self.daily_limit

    def spend(self, tokens: int) -> None:
        self._roll()
        self._spent += tokens


def _refused(response: Response) -> bool:
    """El modelo se negó a responder o la respuesta quedó incompleta por el filtro de contenido."""
    if response.incomplete_details and response.incomplete_details.reason == "content_filter":
        return True
    return any(
        part.type == "refusal"
        for item in response.output
        if item.type == "message"
        for part in item.content
    )


class AssistantService:
    def __init__(
        self,
        responses: AsyncResponses,
        forecast: ForecastService,
        model: str,
        effort: Effort,
        budget: TokenBudget,
    ) -> None:
        self.responses = responses
        self.forecast = forecast
        self.model = model
        self.effort = effort
        self.budget = budget

    async def reply(self, history: list[ChatMessage]) -> ChatReply:
        if self.budget.exhausted():
            raise AssistantUnavailableError("El asistente ha agotado su presupuesto de hoy")
        today = self.forecast.today()
        conversation: list[ResponseInputItemParam] = [
            {"type": "message", "role": m.role, "content": m.content} for m in history
        ]
        # La fecha va al final para que el prefijo (instrucciones y herramientas) se cachee.
        conversation.append(
            {
                "type": "message",
                "role": "developer",
                "content": f"Hoy es {WEEKDAYS[today.weekday()]} {today.isoformat()}.",
            }
        )
        tools_used: list[str] = []
        tokens = 0
        for _ in range(MAX_TOOL_ROUNDS):
            response = await self._create(conversation)
            tokens += response.usage.total_tokens if response.usage else 0
            if _refused(response):
                self.budget.spend(tokens)
                return ChatReply(reply=UNAVAILABLE_REPLY, tools_used=tools_used, tokens_used=tokens)
            calls = [item for item in response.output if item.type == "function_call"]
            if not calls:
                self.budget.spend(tokens)
                return ChatReply(
                    reply=response.output_text.strip() or UNAVAILABLE_REPLY,
                    tools_used=tools_used,
                    tokens_used=tokens,
                )
            # Se devuelve la salida completa (con el razonamiento cifrado) sin tocarla.
            conversation.extend(
                cast(
                    ResponseInputItemParam,
                    item.model_dump(mode="json", by_alias=True, exclude_none=True),
                )
                for item in response.output
            )
            for call in calls:
                tools_used.append(call.name)
                conversation.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": self._run_tool(call.name, call.arguments),
                    }
                )
        self.budget.spend(tokens)
        logger.warning("El asistente agotó las %s rondas de herramientas", MAX_TOOL_ROUNDS)
        return ChatReply(
            reply="La consulta es demasiado compleja. ¿Puedes concretar la vía y el día?",
            tools_used=tools_used,
            tokens_used=tokens,
        )

    async def _create(self, conversation: list[ResponseInputItemParam]) -> Response:
        try:
            return await self.responses.create(
                model=self.model,
                instructions=SYSTEM_PROMPT,
                input=conversation,
                tools=TOOLS,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                reasoning={"effort": self.effort},
                # Sin guardar nada en OpenAI; el razonamiento viaja cifrado entre rondas.
                store=False,
                include=["reasoning.encrypted_content"],
            )
        except openai.RateLimitError as error:
            raise AssistantUnavailableError("El asistente está saturado") from error
        except (openai.APIStatusError, openai.APIConnectionError) as error:
            logger.exception("Error llamando a OpenAI")
            raise AssistantUnavailableError("El asistente no está disponible") from error

    def _run_tool(self, name: str, raw_arguments: str) -> str:
        """Resultado de la herramienta; los errores empiezan por ``ERROR:`` para que el modelo
        los explique en lugar de inventar."""
        try:
            arguments = json.loads(raw_arguments or "{}")
            if name == "find_stations":
                query = _fold(_FindStations.model_validate(arguments).query)
                found = [s.model_dump() for s in self.forecast.stations() if query in _fold(s.name)]
                return json.dumps(found[:40], ensure_ascii=False)
            if name == "get_day_forecast":
                return self._forecast_summary(_DayForecast.model_validate(arguments))
            if name == "get_model_info":
                return self.forecast.model_info().model_dump_json()
            return f"ERROR: herramienta desconocida {name}"
        except (json.JSONDecodeError, ValidationError) as error:
            return f"ERROR: argumentos no válidos ({error})"
        except (StationNotFoundError, DateOutOfRangeError) as error:
            return f"ERROR: {error}"

    def _forecast_summary(self, request: _DayForecast) -> str:
        """Resumen compacto de la previsión: lo justo para responder, con pocos tokens."""
        day = self.forecast.day_forecast(request.station_id, request.direction, request.date)
        summary = {
            "estacion": day.station.name,
            "sentido": day.station.direction_label,
            "fecha": day.date.isoformat(),
            "datos_hasta": day.data_until.date().isoformat(),
            "horas": [
                [h.time.hour, round(h.vehicles), h.level.value, round(h.probability_high, 2)]
                for h in day.hours
            ],
            "formato_horas": ["hora", "vehiculos", "nivel", "prob_atasco_fuerte"],
            "hora_mas_riesgo": {
                "hora": day.worst_hour.time.hour,
                "nivel": day.worst_hour.level.value,
                "prob_atasco_fuerte": round(day.worst_hour.probability_high, 2),
                "motivos": [
                    {"motivo": f.label, "empuja": "a favor" if f.contribution > 0 else "en contra"}
                    for f in day.worst_hour.factors
                ],
            },
        }
        return json.dumps(summary, ensure_ascii=False)
