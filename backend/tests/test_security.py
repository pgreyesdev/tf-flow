from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.core.security import SECURITY_HEADERS
from tf_flow_api.main import create_app


def test_every_response_has_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    for header, value in SECURITY_HEADERS.items():
        assert response.headers[header] == value


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    allowed = client.options(
        "/api/v1/health",
        headers={"Origin": "https://tf-flow.example", "Access-Control-Request-Method": "GET"},
    )
    blocked = client.options(
        "/api/v1/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )

    assert allowed.headers["access-control-allow-origin"] == "https://tf-flow.example"
    assert "access-control-allow-origin" not in blocked.headers


def test_docs_are_hidden_in_production() -> None:
    with TestClient(create_app(Settings(environment=Environment.PRODUCTION))) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404


def test_docs_are_available_outside_production(client: TestClient) -> None:
    assert client.get("/openapi.json").status_code == 200
