import copy
import datetime as dt
import json
from typing import Any, cast

import anthropic
import httpx2
import pytest
from anthropic.resources.beta.messages import AsyncMessages
from anthropic.types.beta import BetaMessage
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.domain.chat import ChatMessage
from tf_flow_api.main import build_assistant, create_app
from tf_flow_api.services.assistant import (
    FALLBACK_BETA,
    MAX_TOOL_ROUNDS,
    UNAVAILABLE_REPLY,
    AssistantService,
    AssistantUnavailableError,
    TokenBudget,
)
from tf_flow_api.services.forecast import ForecastService

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def message(content: list[dict[str, Any]], stop_reason: str = "end_turn") -> BetaMessage:
    return BetaMessage.model_validate(
        {
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": content,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {"input_tokens": 100, "output_tokens": 20, "cache_read_input_tokens": 50},
        }
    )


def tool_call(name: str, arguments: dict[str, Any], call_id: str = "toolu_1") -> BetaMessage:
    block = {"type": "tool_use", "id": call_id, "name": name, "input": arguments}
    return message([block], stop_reason="tool_use")


def text(reply: str) -> BetaMessage:
    return message([{"type": "text", "text": reply}])


class FakeMessages:
    def __init__(self, *responses: BetaMessage | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> BetaMessage:
        self.calls.append(copy.deepcopy(kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def service(
    forecast: ForecastService, fake: FakeMessages, budget: int = 10_000
) -> AssistantService:
    return AssistantService(
        cast(AsyncMessages, fake),
        forecast,
        model="claude-opus-5-5",
        effort="low",
        budget=TokenBudget(budget, today=lambda: dt.date(2025, 6, 2)),
    )


ASK = [ChatMessage(role="user", content="¿Cómo estará la autopista sur a las 8?")]


def tool_results(call: dict[str, Any]) -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], call["messages"][-1]["content"])


async def test_answers_using_the_forecast_tools(forecast: ForecastService) -> None:
    fake = FakeMessages(
        tool_call("find_stations", {"query": "SUR"}),
        tool_call("get_day_forecast", {"station_id": 2, "direction": 1, "date": "2025-06-02"}),
        text("A las 8 habrá atasco fuerte en la autopista sur."),
    )

    reply = await service(forecast, fake).reply(ASK)

    assert reply.reply == "A las 8 habrá atasco fuerte en la autopista sur."
    assert reply.tools_used == ["find_stations", "get_day_forecast"]
    assert reply.tokens_used == 3 * 170
    first = fake.calls[0]
    assert first["model"] == "claude-opus-5-5"
    assert first["fallbacks"] == "default"
    assert first["betas"] == [FALLBACK_BETA]
    assert first["cache_control"] == {"type": "ephemeral"}
    assert first["output_config"] == {"effort": "low"}
    assert all(tool["strict"] for tool in first["tools"])
    assert first["messages"][-1] == {"role": "system", "content": "Hoy es lunes 2025-06-02."}
    found = json.loads(tool_results(fake.calls[1])[0]["content"])
    assert [s["station_id"] for s in found] == [2]
    forecast_result = json.loads(tool_results(fake.calls[2])[0]["content"])
    assert forecast_result["estacion"] == "Autopista Sur"
    assert len(forecast_result["horas"]) == 24
    assert forecast_result["hora_mas_riesgo"]["motivos"]


async def test_accents_do_not_matter_when_searching(forecast: ForecastService) -> None:
    fake = FakeMessages(tool_call("find_stations", {"query": "autopísta"}), text("Hay dos."))

    await service(forecast, fake).reply(ASK)

    assert len(json.loads(tool_results(fake.calls[1])[0]["content"])) == 2


@pytest.mark.parametrize(
    ("name", "arguments", "error"),
    [
        ("get_day_forecast", {"station_id": 9, "direction": 1, "date": "2025-06-02"}, "No existe"),
        ("get_day_forecast", {"station_id": 2, "direction": 1, "date": "2030-01-01"}, "Solo hay"),
        ("get_day_forecast", {"station_id": 2, "direction": 1, "date": "mañana"}, "no válidos"),
        ("delete_everything", {}, "desconocida"),
    ],
)
async def test_tool_errors_go_back_to_claude(
    forecast: ForecastService, name: str, arguments: dict[str, Any], error: str
) -> None:
    fake = FakeMessages(tool_call(name, arguments), text("Lo siento."))

    await service(forecast, fake).reply(ASK)

    result = tool_results(fake.calls[1])[0]
    assert result["is_error"] is True
    assert error in result["content"]


async def test_model_info_tool(forecast: ForecastService) -> None:
    fake = FakeMessages(tool_call("get_model_info", {}), text("Datos hasta marzo."))

    await service(forecast, fake).reply(ASK)

    assert json.loads(tool_results(fake.calls[1])[0]["content"])["metrics"] == {"volume_wape": 0.12}


async def test_refusals_get_a_polite_answer(forecast: ForecastService) -> None:
    fake = FakeMessages(message([], stop_reason="refusal"))

    assert (await service(forecast, fake).reply(ASK)).reply == UNAVAILABLE_REPLY


async def test_stops_after_too_many_tool_rounds(forecast: ForecastService) -> None:
    fake = FakeMessages(*[tool_call("get_model_info", {}) for _ in range(MAX_TOOL_ROUNDS)])

    reply = await service(forecast, fake).reply(ASK)

    assert "concretar" in reply.reply
    assert len(fake.calls) == MAX_TOOL_ROUNDS


async def test_daily_budget_is_enforced(forecast: ForecastService) -> None:
    assistant = service(forecast, FakeMessages(text("Hola."), text("Hola.")), budget=150)

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


REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


@pytest.mark.parametrize(
    ("error", "detail"),
    [
        (
            anthropic.RateLimitError(
                "lento", response=httpx2.Response(429, request=REQUEST), body=None
            ),
            "saturado",
        ),
        (anthropic.APIConnectionError(request=REQUEST), "no está disponible"),
    ],
)
async def test_api_errors_become_unavailable(
    forecast: ForecastService, error: Exception, detail: str
) -> None:
    with pytest.raises(AssistantUnavailableError, match=detail):
        await service(forecast, FakeMessages(error)).reply(ASK)


def chat_client(forecast: ForecastService, fake: FakeMessages, **overrides: Any) -> TestClient:
    settings = Settings(environment=Environment.TEST, **overrides)
    return TestClient(create_app(settings, forecast, service(forecast, fake)))


def test_chat_endpoint(forecast: ForecastService) -> None:
    with chat_client(forecast, FakeMessages(text("Fluido."))) as client:
        response = client.post(
            "/api/v1/assistant/chat", json={"messages": [{"role": "user", "content": "¿Y hoy?"}]}
        )

    assert response.status_code == 200
    assert response.json() == {"reply": "Fluido.", "tools_used": [], "tokens_used": 170}


def test_chat_requires_the_token_when_configured(forecast: ForecastService) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}
    fake = FakeMessages(text("Hola."))
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
    fake = FakeMessages(text("Uno."), text("Dos."))
    with chat_client(forecast, fake, assistant_rate_limit_per_minute=2) as client:
        codes = [client.post("/api/v1/assistant/chat", json=body).status_code for _ in range(3)]
        blocked = client.post("/api/v1/assistant/chat", json=body)

    assert codes == [200, 200, 429]
    assert int(blocked.headers["Retry-After"]) > 0


def test_chat_reports_an_exhausted_budget(forecast: ForecastService) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}
    settings = Settings(environment=Environment.TEST)
    exhausted = service(forecast, FakeMessages(), budget=1)
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
    with chat_client(forecast, FakeMessages()) as client:
        response = client.post("/api/v1/assistant/chat", json={"messages": messages})

    assert response.status_code == 422


def test_chat_is_off_without_api_key(client: TestClient) -> None:
    body = {"messages": [{"role": "user", "content": "Hola"}]}

    assert client.post("/api/v1/assistant/chat", json=body).status_code == 503


def test_build_assistant_needs_key_and_model(forecast: ForecastService) -> None:
    keyless = Settings(environment=Environment.TEST)
    with_key = Settings(environment=Environment.TEST, anthropic_api_key=SecretStr("sk-test"))

    assert build_assistant(keyless, forecast) is None
    assert build_assistant(with_key, None) is None
    assert isinstance(build_assistant(with_key, forecast), AssistantService)
