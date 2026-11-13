"""Respuesta del asistente en streaming: el texto llega a trozos según lo genera el modelo."""

import json
from typing import Any

import httpx2
import openai
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.domain.chat import ChatEvent, DeltaEvent, DoneEvent, ReplaceEvent, ToolEvent
from tf_flow_api.main import create_app
from tf_flow_api.services.assistant import (
    UNAVAILABLE_REPLY,
    AssistantService,
    AssistantUnavailableError,
)
from tf_flow_api.services.forecast import ForecastService

from .test_assistant import (
    ASK,
    REQUEST,
    FakeResponses,
    FakeStream,
    response,
    say,
    service,
    text,
    tool_call,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def collect(assistant: AssistantService) -> list[ChatEvent]:
    return [event async for event in assistant.stream(ASK)]


def with_preamble(preamble: str, name: str, arguments: dict[str, Any]) -> Any:
    """Una ronda en la que el modelo dice algo antes de consultar una herramienta."""
    call = tool_call(name, arguments)
    message = say({"type": "output_text", "text": preamble, "annotations": []}).output[0]
    return response([message.model_dump(), *(item.model_dump() for item in call.output)])


async def test_streams_tools_and_text_as_they_come(forecast: ForecastService) -> None:
    fake = FakeResponses(
        tool_call("find_stations", {"query": "SUR"}),
        text("A las 8 habrá atasco."),
    )
    assistant = service(forecast, fake)

    events = await collect(assistant)

    assert events == [
        ToolEvent(name="find_stations"),
        DeltaEvent(text="A "),
        DeltaEvent(text="las "),
        DeltaEvent(text="8 "),
        DeltaEvent(text="habrá "),
        DeltaEvent(text="atasco."),
        DoneEvent(tools_used=["find_stations"], tokens_used=240),
    ]
    assert all(stream.closed for stream in fake.streams)
    assert assistant.budget._spent == 240


async def test_text_before_a_tool_is_kept_in_its_own_paragraph(forecast: ForecastService) -> None:
    fake = FakeResponses(
        with_preamble("Miro la TF-1.", "get_model_info", {}),
        text("Fluido."),
    )

    reply = await service(forecast, fake).reply(ASK)

    assert reply.reply == "Miro la TF-1.\n\nFluido."
    assert reply.tools_used == ["get_model_info"]


async def test_a_refusal_replaces_what_was_streamed(forecast: ForecastService) -> None:
    refusal = say({"type": "output_text", "text": "Empiezo a", "annotations": []})
    refusal.incomplete_details = response([], incomplete="content_filter").incomplete_details
    events = await collect(service(forecast, FakeResponses(refusal)))

    assert events[-2] == ReplaceEvent(text=UNAVAILABLE_REPLY)
    assert isinstance(events[-1], DoneEvent)


async def test_a_cut_in_the_middle_raises_and_spends_the_budget(forecast: ForecastService) -> None:
    cut = FakeStream(text("Habrá un"), fail=openai.APIConnectionError(request=REQUEST))
    fake = FakeResponses(tool_call("get_model_info", {}), cut)
    assistant = service(forecast, fake)
    received: list[ChatEvent] = []

    with pytest.raises(AssistantUnavailableError, match="no está disponible"):
        async for event in assistant.stream(ASK):
            received.append(event)

    assert received[-1] == DeltaEvent(text="un")
    assert cut.closed
    assert assistant.budget._spent == 120


async def test_leaving_early_still_spends_the_budget(forecast: ForecastService) -> None:
    assistant = service(forecast, FakeResponses(tool_call("get_model_info", {}), text("Uno dos.")))

    events = assistant.stream(ASK)
    assert await anext(events) == ToolEvent(name="get_model_info")
    await events.aclose()

    assert assistant.budget._spent == 120


BODY = {"messages": [{"role": "user", "content": "¿Y hoy?"}]}


def stream_client(forecast: ForecastService, fake: FakeResponses, **overrides: Any) -> TestClient:
    settings = Settings(environment=Environment.TEST, **overrides)
    return TestClient(create_app(settings, forecast, service(forecast, fake)))


def sse(body: str) -> list[dict[str, Any]]:
    assert body.endswith("\n\n")
    blocks = body.strip().split("\n\n")
    assert all(block.startswith("data: ") for block in blocks)
    return [json.loads(block.removeprefix("data: ")) for block in blocks]


def test_stream_endpoint_sends_server_sent_events(forecast: ForecastService) -> None:
    fake = FakeResponses(tool_call("get_model_info", {}), text("Todo fluido."))
    with stream_client(forecast, fake) as client:
        reply = client.post("/api/v1/assistant/chat/stream", json=BODY)

    assert reply.status_code == 200
    assert reply.headers["content-type"].startswith("text/event-stream")
    assert reply.headers["cache-control"] == "no-cache"
    assert reply.headers["x-accel-buffering"] == "no"
    assert sse(reply.text) == [
        {"type": "tool", "name": "get_model_info"},
        {"type": "delta", "text": "Todo "},
        {"type": "delta", "text": "fluido."},
        {"type": "done", "tools_used": ["get_model_info"], "tokens_used": 240},
    ]


def test_stream_endpoint_reports_a_cut_as_an_error_event(forecast: ForecastService) -> None:
    cut = FakeStream(text("Habrá"), fail=openai.APIConnectionError(request=REQUEST))
    with stream_client(forecast, FakeResponses(cut)) as client:
        reply = client.post("/api/v1/assistant/chat/stream", json=BODY)

    assert reply.status_code == 200
    assert sse(reply.text)[-1] == {"type": "error", "detail": "El asistente no está disponible"}


@pytest.mark.parametrize(
    "error",
    [
        openai.RateLimitError("lento", response=httpx2.Response(429, request=REQUEST), body=None),
        openai.APIConnectionError(request=REQUEST),
    ],
)
def test_stream_endpoint_fails_with_503_before_starting(
    forecast: ForecastService, error: Exception
) -> None:
    with stream_client(forecast, FakeResponses(error)) as client:
        assert client.post("/api/v1/assistant/chat/stream", json=BODY).status_code == 503


def test_stream_endpoint_reports_an_exhausted_budget(forecast: ForecastService) -> None:
    exhausted = service(forecast, FakeResponses(), budget=1)
    exhausted.budget.spend(1)
    with TestClient(create_app(Settings(environment=Environment.TEST), forecast, exhausted)) as c:
        assert c.post("/api/v1/assistant/chat/stream", json=BODY).status_code == 503


def test_stream_endpoint_keeps_token_and_validation(forecast: ForecastService) -> None:
    fake = FakeResponses(text("Hola."))
    with stream_client(forecast, fake, assistant_access_token=SecretStr("secreto")) as client:
        denied = client.post("/api/v1/assistant/chat/stream", json=BODY)
        invalid = client.post(
            "/api/v1/assistant/chat/stream",
            json={"messages": []},
            headers={"X-Assistant-Token": "secreto"},
        )
        allowed = client.post(
            "/api/v1/assistant/chat/stream", json=BODY, headers={"X-Assistant-Token": "secreto"}
        )

    assert (denied.status_code, invalid.status_code, allowed.status_code) == (401, 422, 200)
