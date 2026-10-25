from fastapi.testclient import TestClient

from tf_flow_api import __version__


def test_health_reports_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "environment": "test"}


def test_unknown_route_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/does-not-exist").status_code == 404
