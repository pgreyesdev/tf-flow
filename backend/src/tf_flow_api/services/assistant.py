"""Asistente de TF-FLOW: Claude responde preguntas sobre el tráfico consultando el modelo.

El bucle de herramientas es manual para controlar el gasto: cada conversación tiene un máximo de
rondas, cada respuesta un máximo de tokens y el servicio un presupuesto diario compartido.
"""

import datetime as dt
import json
import logging
import unicodedata
from collections.abc import Callable
from typing import Any, Literal, cast

import anthropic
from anthropic.resources.beta.messages import AsyncMessages
from anthropic.types.beta import (
    BetaAssistantMessageParam,
    BetaMessage,
    BetaMessageParam,
    BetaSystemMessageParam,
    BetaToolParam,
    BetaToolResultBlockParam,
    BetaUserMessageParam,
)
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
FALLBACK_BETA = "server-side-fallback-2026-07-01"
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


def _tool(name: str, description: str, properties: dict[str, Any]) -> BetaToolParam:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOLS: list[BetaToolParam] = [
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
    """Claude no está disponible o se agotó el presupuesto; la API responde 503."""


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


class AssistantService:
    def __init__(
        self,
        messages: AsyncMessages,
        forecast: ForecastService,
        model: str,
        effort: Effort,
        budget: TokenBudget,
    ) -> None:
        self.messages = messages
        self.forecast = forecast
        self.model = model
        self.effort = effort
        self.budget = budget

    async def reply(self, history: list[ChatMessage]) -> ChatReply:
        if self.budget.exhausted():
            raise AssistantUnavailableError("El asistente ha agotado su presupuesto de hoy")
        today = self.forecast.today()
        conversation: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=m.content)
            if m.role == "user"
            else BetaAssistantMessageParam(role="assistant", content=m.content)
            for m in history
        ]
        # La fecha va en un mensaje de sistema al final para no romper la caché del prefijo.
        conversation.append(
            BetaSystemMessageParam(
                role="system", content=f"Hoy es {WEEKDAYS[today.weekday()]} {today.isoformat()}."
            )
        )
        tools_used: list[str] = []
        tokens = 0
        for _ in range(MAX_TOOL_ROUNDS):
            response = await self._create(conversation)
            usage = response.usage
            tokens += (
                usage.input_tokens
                + usage.output_tokens
                + (usage.cache_creation_input_tokens or 0)
                + (usage.cache_read_input_tokens or 0)
            )
            if response.stop_reason == "refusal":
                self.budget.spend(tokens)
                return ChatReply(reply=UNAVAILABLE_REPLY, tools_used=tools_used, tokens_used=tokens)
            calls = [block for block in response.content if block.type == "tool_use"]
            if response.stop_reason != "tool_use" or not calls:
                self.budget.spend(tokens)
                text = "".join(block.text for block in response.content if block.type == "text")
                return ChatReply(
                    reply=text.strip() or UNAVAILABLE_REPLY,
                    tools_used=tools_used,
                    tokens_used=tokens,
                )
            # Se devuelve el contenido completo (incluidos los bloques de razonamiento) sin tocarlo.
            conversation.append(
                BetaAssistantMessageParam(role="assistant", content=cast(Any, response.content))
            )
            results: list[BetaToolResultBlockParam] = []
            for call in calls:
                tools_used.append(call.name)
                content, is_error = self._run_tool(call.name, call.input)
                results.append(
                    BetaToolResultBlockParam(
                        type="tool_result", tool_use_id=call.id, content=content, is_error=is_error
                    )
                )
            conversation.append(BetaUserMessageParam(role="user", content=results))
        self.budget.spend(tokens)
        logger.warning("El asistente agotó las %s rondas de herramientas", MAX_TOOL_ROUNDS)
        return ChatReply(
            reply="La consulta es demasiado compleja. ¿Puedes concretar la vía y el día?",
            tools_used=tools_used,
            tokens_used=tokens,
        )

    async def _create(self, conversation: list[BetaMessageParam]) -> BetaMessage:
        try:
            return await self.messages.create(
                model=self.model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=conversation,
                cache_control={"type": "ephemeral"},
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.RateLimitError as error:
            raise AssistantUnavailableError("El asistente está saturado") from error
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as error:
            logger.exception("Error llamando a Claude")
            raise AssistantUnavailableError("El asistente no está disponible") from error

    def _run_tool(self, name: str, arguments: object) -> tuple[str, bool]:
        try:
            if name == "find_stations":
                query = _fold(_FindStations.model_validate(arguments).query)
                found = [s.model_dump() for s in self.forecast.stations() if query in _fold(s.name)]
                return json.dumps(found[:40], ensure_ascii=False), False
            if name == "get_day_forecast":
                request = _DayForecast.model_validate(arguments)
                return self._forecast_summary(request), False
            if name == "get_model_info":
                return self.forecast.model_info().model_dump_json(), False
            return f"Herramienta desconocida: {name}", True
        except ValidationError as error:
            return f"Argumentos no válidos: {error.errors(include_url=False)}", True
        except (StationNotFoundError, DateOutOfRangeError) as error:
            return str(error), True

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
