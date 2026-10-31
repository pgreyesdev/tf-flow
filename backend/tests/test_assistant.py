import copy
import datetime as dt
import json
from typing import Any, cast

import httpx
import httpx2
import openai
import pytest
from fastapi.testclient import TestClient
from openai.resources.responses import AsyncResponses
from openai.types.responses import Response
from pydantic import SecretStr

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.domain.chat import ChatMessage
from tf_flow_api.main import build_assistant, create_app
from tf_flow_api.services.assistant import (
    MAX_TOOL_ROUNDS,
    UNAVAILABLE_REPLY,
    AssistantService,
    AssistantUnavailableError,
    TokenBudget,
)
from tf_flow_api.services.forecast import ForecastService
from tf_flow_api.services.incidents import IncidentService

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


USAGE = {
    "input_tokens": 100,
    "output_tokens": 20,
    "total_tokens": 120,
    "input_tokens_details": {"cached_tokens": 50, "cache_write_tokens": 0},
    "output_tokens_details": {"reasoning_tokens": 5},
}


def response(output: list[dict[str, Any]], incomplete: str | None = None) -> Response:
    return Response.model_validate(
        {
            "id": "resp_test",
            "created_at": 0,
            "model": "gpt-5.4-mini",
            "object": "response",
            "output": output,
            "parallel_tool_calls": True,
            "tool_choice": "auto",
            "tools": [],
            "usage": USAGE,
            "incomplete_details": {"reason": incomplete} if incomplete else None,
        }
    )


def tool_call(name: str, arguments: dict[str, Any] | str, call_id: str = "call_1") -> Response:
    raw = arguments if isinstance(arguments, str) else json.dumps(arguments)
    reasoning = {"type": "reasoning", "id": "rs_1", "summary": [], "encrypted_content": "cifrado"}
    call = {
        "type": "function_call",
        "id": "fc_1",
        "call_id": call_id,
        "name": name,
        "arguments": raw,
        "status": "completed",
    }
    return response([reasoning, call])


def say(part: dict[str, Any]) -> Response:
    message = {"type": "message", "id": "msg_1", "role": "assistant", "status": "completed"}
    return response([{**message, "content": [part]}])


def text(reply: str) -> Response:
    return say({"type": "output_text", "text": reply, "annotations": []})


class FakeResponses:
    def __init__(self, *responses: Response | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Response:
        self.calls.append(copy.deepcopy(kwargs))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def service(
    forecast: ForecastService,
    fake: FakeResponses,
    budget: int = 10_000,
    incidents: IncidentService | None = None,
) -> AssistantService:
    return AssistantService(
        cast(AsyncResponses, fake),
        forecast,
        incidents or IncidentService(fetch=_no_feed),
        model="gpt-5.4-mini",
        effort="low",
        budget=TokenBudget(budget, today=lambda: dt.date(2025, 6, 2)),
    )


async def _no_feed(url: str) -> bytes:
    raise httpx.ConnectError("sin red en los tests")


ASK = [ChatMessage(role="user", content="¿Cómo estará la autopista sur a las 8?")]


def tool_output(call: dict[str, Any]) -> str:
    """Salida de la última herramienta que se envió al modelo."""
    last = call["input"][-1]
    assert last["type"] == "function_call_output"
    return cast(str, last["output"])


async def test_answers_using_the_forecast_tools(forecast: ForecastService) -> None:
    fake = FakeResponses(
        tool_call("find_stations", {"query": "SUR"}),
        tool_call("get_day_forecast", {"station_id": 2, "direction": 1, "date": "2025-06-02"}),
        text("A las 8 habrá atasco fuerte en la autopista sur."),
    )

    reply = await service(forecast, fake).reply(ASK)

    assert reply.reply == "A las 8 habrá atasco fuerte en la autopista sur."
    assert reply.tools_used == ["find_stations", "get_day_forecast"]
    assert reply.tokens_used == 3 * 120
    first = fake.calls[0]
    assert first["model"] == "gpt-5.4-mini"
    assert first["store"] is False
    assert first["include"] == ["reasoning.encrypted_content"]
    assert first["reasoning"] == {"effort": "low"}
    assert all(tool["strict"] for tool in first["tools"])
    assert first["input"][-1] == {
        "type": "message",
        "role": "developer",
        "content": "Hoy es lunes 2025-06-02.",
    }
    second = fake.calls[1]["input"]
    assert second[-3]["encrypted_content"] == "cifrado"
    assert second[-2]["type"] == "function_call"
    assert "async_" not in second[-2]
    found = json.loads(tool_output(fake.calls[1]))
    assert [s["station_id"] for s in found] == [2]
    forecast_result = json.loads(tool_output(fake.calls[2]))
    assert forecast_result["estacion"] == "Autopista Sur"
    assert len(forecast_result["horas"]) == 24
    assert forecast_result["hora_mas_riesgo"]["motivos"]


async def test_accents_do_not_matter_when_searching(forecast: ForecastService) -> None:
    fake = FakeResponses(tool_call("find_stations", {"query": "autopísta"}), text("Hay dos."))

    await service(forecast, fake).reply(ASK)

    assert len(json.loads(tool_output(fake.calls[1]))) == 2


@pytest.mark.parametrize(
    ("name", "arguments", "error"),
    [
        ("get_day_forecast", {"station_id": 9, "direction": 1, "date": "2025-06-02"}, "No existe"),
        ("get_day_forecast", {"station_id": 2, "direction": 1, "date": "2030-01-01"}, "Solo hay"),
        ("get_day_forecast", {"station_id": 2, "direction": 1, "date": "mañana"}, "no válidos"),
        ("find_stations", "{roto", "no válidos"),
        ("delete_everything", {}, "desconocida"),
    ],
)
async def test_tool_errors_go_back_to_the_model(
    forecast: ForecastService, name: str, arguments: dict[str, Any] | str, error: str
) -> None:
    fake = FakeResponses(tool_call(name, arguments), text("Lo siento."))

    await service(forecast, fake).reply(ASK)

    output = tool_output(fake.calls[1])
    assert output.startswith("ERROR:")
    assert error in output


async def test_model_info_tool(forecast: ForecastService) -> None:
    fake = FakeResponses(tool_call("get_model_info", {}), text("Datos hasta marzo."))

    await service(forecast, fake).reply(ASK)

    assert json.loads(tool_output(fake.calls[1]))["metrics"] == {"volume_wape": 0.12}


@pytest.mark.parametrize(
    "refusal",
    [
        say({"type": "refusal", "refusal": "No puedo ayudar con eso."}),
        response([], incomplete="content_filter"),
    ],
)
async def test_refusals_get_a_polite_answer(forecast: ForecastService, refusal: Response) -> None:
    fake = FakeResponses(refusal)

    assert (await service(forecast, fake).reply(ASK)).reply == UNAVAILABLE_REPLY


async def test_empty_answers_are_replaced(forecast: ForecastService) -> None:
    fake = FakeResponses(response([]))

    assert (await service(forecast, fake).reply(ASK)).reply == UNAVAILABLE_REPLY


async def test_stops_after_too_many_tool_rounds(forecast: ForecastService) -> None:
    fake = FakeResponses(*[tool_call("get_model_info", {}) for _ in range(MAX_TOOL_ROUNDS)])

    reply = await service(forecast, fake).reply(ASK)

    assert "concretar" in reply.reply
    assert len(fake.calls) == MAX_TOOL_ROUNDS


async def test_daily_budget_is_enforced(forecast: ForecastService) -> None:
    assistant = service(forecast, FakeResponses(text("Hola."), text("Hola.")), budget=100)

    await assistant.reply(ASK)

    with pytest.raises(AssistantUnavailableError, match="presupuesto"):
        await assistant.reply(ASK)


def test_budget_resets_every_day() -> None:
    today = [dt.date(2025, 6, 2)]
    budget = TokenBudget(10, today=lambda: today[0])
    budget.spend(10)
    assert budget.exhausted()

    today[0] = dt.date(2025, 6, 3)

    assert not budget.exhausted()


REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/responses")


@pytest.mark.parametrize(
    ("error", "detail"),
    [
        (
            openai.RateLimitError(
                "lento", response=httpx2.Response(429, request=REQUEST), body=None
            ),
            "saturado",
        ),
        (openai.APIConnectionError(request=REQUEST), "no está disponible"),
    ],
)
async def test_api_errors_become_unavailable(
    forecast: ForecastService, error: Exception, detail: str
) -> None:
    with pytest.raises(AssistantUnavailableError, match=detail):
        await service(forecast, FakeResponses(error)).reply(ASK)


def chat_client(forecast: ForecastService, fake: FakeResponses, **overrides: Any) -> TestClient:
    settings = Settings(environment=Environment.TEST, **overrides)
    return TestClient(create_app(settings, forecast, service(forecast, fake)))


def test_chat_endpoint(forecast: ForecastService) -> None:
    with chat_client(forecast, FakeResponses(text("Fluido."))) as client:
        response = client.post(
            "/api/v1/assistant/chat", json={"messages": [{"role": "user", "content": "¿Y hoy?"}]}
        )

    assert response.status_code == 200
    assert response.json() == {"reply": "Fluido.", "tools_used": [], "tokens_used": 120}


def test_chat_requires_the_token_when_configured(forecast: ForecastService) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}
    fake = FakeResponses(text("Hola."))
    with chat_client(forecast, fake, assistant_access_token=SecretStr("secreto")) as client:
        denied = client.post("/api/v1/assistant/chat", json=body)
        wrong = client.post(
            "/api/v1/assistant/chat", json=body, headers={"X-Assistant-Token": "otro"}
        )
        allowed = client.post(
            "/api/v1/assistant/chat", json=body, headers={"X-Assistant-Token": "secreto"}
        )

    assert (denied.status_code, wrong.status_code, allowed.status_code) == (401, 401, 200)


def test_chat_has_its_own_rate_limit(forecast: ForecastService) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}
    fake = FakeResponses(text("Uno."), text("Dos."))
    with chat_client(forecast, fake, assistant_rate_limit_per_minute=2) as client:
        codes = [client.post("/api/v1/assistant/chat", json=body).status_code for _ in range(3)]
        blocked = client.post("/api/v1/assistant/chat", json=body)

    assert codes == [200, 200, 429]
    assert int(blocked.headers["Retry-After"]) > 0


def test_chat_reports_an_exhausted_budget(forecast: ForecastService) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}
    settings = Settings(environment=Environment.TEST)
    exhausted = service(forecast, FakeResponses(), budget=1)
    exhausted.budget.spend(1)
    with TestClient(create_app(settings, forecast, exhausted)) as client:
        response = client.post("/api/v1/assistant/chat", json=body)

    assert response.status_code == 503


@pytest.mark.parametrize(
    "messages",
    [
        [{"role": "assistant", "content": "Hola"}],
        [{"role": "user", "content": "a"}, {"role": "user", "content": "b"}],
        [{"role": "user", "content": "x" * 1001}],
        [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}],
        [],
    ],
)
def test_chat_validates_the_conversation(
    forecast: ForecastService, messages: list[dict[str, str]]
) -> None:
    with chat_client(forecast, FakeResponses()) as client:
        response = client.post("/api/v1/assistant/chat", json={"messages": messages})

    assert response.status_code == 422


def test_chat_is_off_without_api_key(client: TestClient) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}

    assert client.post("/api/v1/assistant/chat", json=body).status_code == 503


def test_build_assistant_needs_key_and_model(forecast: ForecastService) -> None:
    keyless = Settings(environment=Environment.TEST)
    with_key = Settings(environment=Environment.TEST, openai_api_key=SecretStr("sk-test"))

    incidents = IncidentService(fetch=_no_feed)

    assert build_assistant(keyless, forecast, incidents) is None
    assert build_assistant(with_key, None, incidents) is None
    assert isinstance(build_assistant(with_key, forecast, incidents), AssistantService)


async def test_reports_live_incidents(
    forecast: ForecastService, incidents: IncidentService
) -> None:
    fake = FakeResponses(
        tool_call("get_incidents", {"road": "tf 5"}),
        tool_call("get_incidents", {}, call_id="call_2"),
        text("Hay un accidente en la TF-5."),
    )

    reply = await service(forecast, fake, incidents=incidents).reply(ASK)

    assert reply.tools_used == ["get_incidents", "get_incidents"]
    on_road = json.loads(tool_output(fake.calls[1]))
    assert on_road["total"] == 1
    assert on_road["incidencias"][0]["via"] == "TF-5"
    assert on_road["incidencias"][0]["tipo"] == "Accidente"
    assert json.loads(tool_output(fake.calls[2]))["total"] == 3


async def test_says_when_incidents_are_unavailable(forecast: ForecastService) -> None:
    fake = FakeResponses(tool_call("get_incidents", {}), text("No puedo saberlo ahora."))

    await service(forecast, fake).reply(ASK)

    assert tool_output(fake.calls[1]).startswith("ERROR")
