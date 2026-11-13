"""Asistente de TF-FLOW: un modelo de OpenAI responde preguntas consultando la previsión.

El bucle de herramientas es manual para controlar el gasto: cada conversación tiene un máximo de
rondas, cada respuesta un máximo de tokens y el servicio un presupuesto diario compartido.
"""

import datetime as dt
import json
import logging
import unicodedata
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from contextlib import aclosing
from typing import Any, Literal, cast
from urllib.parse import urlencode

import openai
from openai.resources.responses import AsyncResponses
from openai.types.responses import FunctionToolParam, Response, ResponseInputItemParam
from pydantic import BaseModel, Field, ValidationError, field_validator

from tf_flow_api.domain.chat import (
    ChatEvent,
    ChatMessage,
    ChatReply,
    DeltaEvent,
    DoneEvent,
    ReplaceEvent,
    ToolEvent,
)
from tf_flow_api.domain.incidents import Incident
from tf_flow_api.domain.routes import Place
from tf_flow_api.services.forecast import (
    DateOutOfRangeError,
    ForecastService,
    StationNotFoundError,
    today_in_tenerife,
)
from tf_flow_api.services.incidents import IncidentService
from tf_flow_api.services.places import PLACES, distance_km, find_place, nearest_place
from tf_flow_api.services.routes import RouteService, RoutingUnavailableError

logger = logging.getLogger(__name__)

Effort = Literal["low", "medium", "high"]
MAX_TOOL_ROUNDS = 6
MAX_OUTPUT_TOKENS = 4_096
#: Radio alrededor de un lugar dentro del que una incidencia cuenta como «en» ese lugar.
NEAR_PLACE_KM = 5.0
WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")

SYSTEM_PROMPT = """\
Eres el asistente de TF-FLOW, una aplicación que prevé la congestión en las carreteras de Tenerife \
a partir de las estaciones de aforo del Cabildo.

Responde en español, breve y claro, como alguien de la isla que conoce sus carreteras. Para \
cualquier dato de tráfico usa las herramientas: no inventes cifras ni estaciones. Si no sabes qué \
estación busca la persona, búscala por nombre; si no indica el sentido y la vía tiene dos, \
consulta ambos o pregunta.

Las previsiones salen de un modelo entrenado con datos históricos que el Cabildo publica con un \
mes de retraso, así que son orientativas: no conocen accidentes, obras ni eventos de hoy. Cada vez \
que des la previsión de hoy o de los próximos días para una vía, consulta también las incidencias \
de la DGT en esa vía. Si hay alguna, empieza la respuesta avisando de ella (qué es, dónde y desde \
cuándo) y recuerda que la previsión no la tiene en cuenta. Los niveles son low (fluido), medium \
(denso) y high (atasco fuerte). Las horas son locales de Canarias.

Si preguntan si hay accidentes, obras, cortes o retenciones en una vía o un lugar, consulta \
get_incidents con esa vía o ese lugar. Si hay alguna, di qué es, dónde (vía, kilómetro y \
municipio) y desde cuándo; si no hay ninguna, di que la DGT no tiene ninguna comunicada ahí ahora \
mismo, sin inventar nada. Cita a la DGT como fuente.

Si preguntan cómo ir de un sitio a otro o por una alternativa a una vía, usa plan_route. Explica \
cuál recomiendas y por qué (atascos previstos en sus aforos, incidencias, tiempo), recuerda que \
solo se conoce el tráfico donde hay estación de aforo y termina con el enlace al mapa así: \
[Ver las rutas en el mapa](enlace_mapa).

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
        "get_incidents",
        "Incidencias de tráfico activas ahora mismo en Tenerife según la DGT (accidentes, obras, "
        "retenciones, cortes): tipo, vía, punto kilométrico, municipio, lugar conocido más "
        "cercano y desde cuándo. Filtra por vía, como 'TF-5', por lugar, como 'La Laguna' o "
        "'Los Cristianos' (su municipio y alrededores), o por ambos; vacíos devuelven todas.",
        {
            "road": {"type": "string", "description": "Vía, como 'TF-1', o vacío"},
            "place": {
                "type": "string",
                "description": "Municipio o lugar de Tenerife, como 'Adeje', o vacío",
            },
        },
    ),
    _tool(
        "plan_route",
        "Rutas en coche entre dos lugares de Tenerife (municipios y destinos como 'Aeropuerto "
        "Tenerife Sur' o 'Los Cristianos'), de la más recomendable a la menos. De cada ruta da "
        "km, minutos sin tráfico, los aforos que cruza con su nivel previsto a la hora de paso, "
        "las incidencias de la DGT encima y un enlace al mapa con las rutas.",
        {
            "origin": {"type": "string", "description": "Lugar de salida"},
            "destination": {"type": "string", "description": "Lugar de llegada"},
            "date": {"type": "string", "description": "Fecha AAAA-MM-DD, o vacío para hoy"},
            "hour": {
                "type": ["integer", "null"],
                "description": "Hora de salida de 0 a 23, o null para ahora",
            },
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


class _Incidents(BaseModel):
    road: str = Field(default="", max_length=20)
    place: str = Field(default="", max_length=80)


class _PlanRoute(BaseModel):
    origin: str = Field(max_length=80)
    destination: str = Field(max_length=80)
    date: dt.date | None = None
    hour: int | None = Field(default=None, ge=0, le=23)

    @field_validator("date", mode="before")
    @classmethod
    def _empty_is_today(cls, value: object) -> object:
        return None if value == "" else value


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


def _near(incident: Incident, place: Place) -> bool:
    """La incidencia está en el municipio del lugar o a pocos kilómetros de él."""
    if incident.municipality and _fold(incident.municipality) == _fold(place.name):
        return True
    return distance_km(incident.latitude, incident.longitude, place) <= NEAR_PLACE_KM


def _road(text: str) -> str:
    """Nombre de vía comparable: 'tf 5', 'TF5' y 'TF-5' son la misma."""
    return "".join(c for c in _fold(text) if c.isalnum())


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
        incidents: IncidentService,
        routes: RouteService,
        *,
        model: str,
        effort: Effort,
        budget: TokenBudget,
    ) -> None:
        self.responses = responses
        self.forecast = forecast
        self.incidents = incidents
        self.routes = routes
        self.model = model
        self.effort = effort
        self.budget = budget

    async def reply(self, history: list[ChatMessage]) -> ChatReply:
        """La respuesta completa de una vez: junta los eventos de :meth:`stream`."""
        text = ""
        done: DoneEvent | None = None
        async with aclosing(self.stream(history)) as events:
            async for event in events:
                match event:
                    case DeltaEvent():
                        text += event.text
                    case ReplaceEvent():
                        text = event.text
                    case DoneEvent():
                        done = event
        if done is None:  # pragma: no cover - stream() siempre termina con DoneEvent
            raise AssistantUnavailableError("El asistente no terminó la respuesta")
        return ChatReply(
            reply=text.strip(), tools_used=done.tools_used, tokens_used=done.tokens_used
        )

    async def stream(self, history: list[ChatMessage]) -> AsyncGenerator[ChatEvent]:
        """Responde según el modelo va generando el texto.

        Emite un :class:`ToolEvent` por cada herramienta que consulta, un :class:`DeltaEvent` por
        cada trozo de texto y termina siempre con un :class:`DoneEvent`. Lanza
        :class:`AssistantUnavailableError` si el proveedor falla, también a mitad de respuesta.
        """
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
        said = ""
        try:
            for _ in range(MAX_TOOL_ROUNDS):
                response: Response | None = None
                round_text = ""
                async for chunk in self._create(conversation):
                    if isinstance(chunk, Response):
                        response = chunk
                        continue
                    if said and not round_text:
                        # Ya hubo texto antes de consultar herramientas: párrafo nuevo.
                        yield DeltaEvent(text="\n\n")
                    round_text += chunk
                    said += chunk
                    yield DeltaEvent(text=chunk)
                if response is None:
                    raise AssistantUnavailableError("El asistente no terminó la respuesta")
                tokens += response.usage.total_tokens if response.usage else 0
                if _refused(response):
                    yield ReplaceEvent(text=UNAVAILABLE_REPLY)
                    yield DoneEvent(tools_used=tools_used, tokens_used=tokens)
                    return
                calls = [item for item in response.output if item.type == "function_call"]
                if not calls:
                    if not said.strip():
                        yield ReplaceEvent(text=UNAVAILABLE_REPLY)
                    yield DoneEvent(tools_used=tools_used, tokens_used=tokens)
                    return
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
                    yield ToolEvent(name=call.name)
                    conversation.append(
                        {
                            "type": "function_call_output",
                            "call_id": call.call_id,
                            "output": await self._run_tool(call.name, call.arguments),
                        }
                    )
            logger.warning("El asistente agotó las %s rondas de herramientas", MAX_TOOL_ROUNDS)
            yield ReplaceEvent(
                text="La consulta es demasiado compleja. ¿Puedes concretar la vía y el día?"
            )
            yield DoneEvent(tools_used=tools_used, tokens_used=tokens)
        finally:
            # También si la persona cierra la página a mitad: lo ya gastado cuenta.
            self.budget.spend(tokens)

    async def _create(
        self, conversation: list[ResponseInputItemParam]
    ) -> AsyncIterator[str | Response]:
        """Una ronda con el modelo en streaming: los trozos de texto según llegan y, al final, la
        respuesta completa (con las llamadas a herramientas y el gasto de tokens)."""
        try:
            stream = await self.responses.create(
                model=self.model,
                instructions=SYSTEM_PROMPT,
                input=conversation,
                tools=TOOLS,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                reasoning={"effort": self.effort},
                # Sin guardar nada en OpenAI; el razonamiento viaja cifrado entre rondas.
                store=False,
                include=["reasoning.encrypted_content"],
                stream=True,
            )
            try:
                async for event in stream:
                    match event.type:
                        case "response.output_text.delta":
                            yield event.delta
                        case "response.completed" | "response.incomplete":
                            yield event.response
                        case "response.failed" | "error":
                            logger.error("OpenAI cortó la respuesta: %s", event)
                            raise AssistantUnavailableError("El asistente no está disponible")
            finally:
                await stream.close()
        except openai.RateLimitError as error:
            raise AssistantUnavailableError("El asistente está saturado") from error
        except openai.APIError as error:
            logger.exception("Error llamando a OpenAI")
            raise AssistantUnavailableError("El asistente no está disponible") from error

    async def _run_tool(self, name: str, raw_arguments: str) -> str:
        """Resultado de la herramienta; los errores empiezan por ``ERROR:`` para que el modelo
        los explique en lugar de inventar."""
        try:
            arguments = json.loads(raw_arguments or "{}")
            match name:
                case "find_stations":
                    output = self._find_stations(_FindStations.model_validate(arguments))
                case "get_day_forecast":
                    output = self._forecast_summary(_DayForecast.model_validate(arguments))
                case "get_incidents":
                    output = await self._incidents_summary(_Incidents.model_validate(arguments))
                case "plan_route":
                    output = await self._route_summary(_PlanRoute.model_validate(arguments))
                case "get_model_info":
                    output = self.forecast.model_info().model_dump_json()
                case _:
                    output = f"ERROR: herramienta desconocida {name}"
            return output
        except (json.JSONDecodeError, ValidationError) as error:
            return f"ERROR: argumentos no válidos ({error})"
        except (StationNotFoundError, DateOutOfRangeError, RoutingUnavailableError) as error:
            return f"ERROR: {error}"

    def _find_stations(self, request: _FindStations) -> str:
        query = _fold(request.query)
        found = [s.model_dump() for s in self.forecast.stations() if query in _fold(s.name)]
        return json.dumps(found[:40], ensure_ascii=False)

    async def _route_summary(self, request: _PlanRoute) -> str:
        origin, destination = find_place(request.origin), find_place(request.destination)
        if origin is None or destination is None:
            missing = request.origin if origin is None else request.destination
            names = ", ".join(p.name for p in PLACES)
            return f"ERROR: no conozco el lugar «{missing}». Lugares disponibles: {names}"
        if origin.id == destination.id:
            return "ERROR: el origen y el destino son el mismo lugar"
        departure = self.routes.departure(request.date, request.hour)
        plan = await self.routes.plan(origin, destination, departure)
        query = {"origen": origin.id, "destino": destination.id}
        query |= {"fecha": departure.date().isoformat(), "hora": str(departure.hour)}
        summary = {
            "origen": origin.name,
            "destino": destination.name,
            "salida": departure.isoformat(timespec="minutes"),
            "rutas": [
                {
                    "nombre": route.name,
                    "recomendada": route.recommended,
                    "km": route.distance_km,
                    "minutos_sin_trafico": round(route.duration_minutes),
                    "via_cortada": route.closed,
                    "aforos": [
                        [s.name, s.passing.strftime("%H:%M"), s.level.value, s.probability_high]
                        for s in route.stations
                    ],
                    "incidencias": [
                        {"tipo": i.label, "efectos": i.details, "via": i.road, "km": i.kilometer}
                        for i in route.incidents
                    ],
                }
                for route in plan.routes
            ],
            "formato_aforos": ["nombre", "hora_paso", "nivel", "prob_atasco_fuerte"],
            "enlace_mapa": f"/rutas?{urlencode(query)}",
        }
        return json.dumps(summary, ensure_ascii=False)

    async def _incidents_summary(self, request: _Incidents) -> str:
        place = None
        if request.place.strip():
            place = find_place(request.place)
            if place is None:
                names = ", ".join(p.name for p in PLACES)
                return f"ERROR: no conozco el lugar «{request.place}». Lugares disponibles: {names}"
        now = await self.incidents.current()
        if not now.available:
            return "ERROR: ahora mismo no se pueden consultar las incidencias de la DGT"
        road = _road(request.road)
        found = [
            {
                "tipo": i.label,
                "efectos": i.details,
                "via": i.road,
                "km": i.kilometer,
                "municipio": i.municipality,
                "cerca_de": nearest_place(i.latitude, i.longitude).name,
                "desde": i.start.isoformat(timespec="minutes") if i.start else None,
                "hasta": i.end.isoformat(timespec="minutes") if i.end else None,
            }
            for i in now.incidents
            if (not road or _road(i.road or "") == road) and (place is None or _near(i, place))
        ]
        summary: dict[str, Any] = {
            "incidencias": found[:30],
            "total": len(found),
            "actualizado": now.updated.isoformat(timespec="minutes") if now.updated else None,
            "fuente": now.source,
        }
        if place is not None:
            summary["lugar"] = place.name
        return json.dumps(summary, ensure_ascii=False)

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
