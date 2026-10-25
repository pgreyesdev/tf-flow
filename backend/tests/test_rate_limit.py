from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.core.rate_limit import MAX_CLIENTS, RateLimiter
from tf_flow_api.main import create_app
from tf_flow_api.services.forecast import ForecastService


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_bucket_refills_over_time() -> None:
    clock = Clock()
    limiter = RateLimiter(per_minute=2, clock=clock)

    assert limiter.acquire("a") == 0
    assert limiter.acquire("a") == 0
    assert limiter.acquire("a") == 30  # una ficha cada 30 s
    assert limiter.acquire("b") == 0
    clock.now = 30
    assert limiter.acquire("a") == 0


def test_forgets_idle_clients_when_full() -> None:
    clock = Clock()
    limiter = RateLimiter(per_minute=60, clock=clock)
    for i in range(MAX_CLIENTS):
        limiter.acquire(str(i))
    clock.now = 120

    assert limiter.acquire("nuevo") == 0
    assert len(limiter._buckets) == 1


def test_api_answers_429_with_retry_after(forecast: ForecastService) -> None:
    settings = Settings(environment=Environment.TEST, rate_limit_per_minute=2)
    with TestClient(create_app(settings, forecast)) as client:
        codes = [client.get("/api/v1/stations").status_code for _ in range(3)]
        health = client.get("/api/v1/health")
        blocked = client.get("/api/v1/model")

    assert codes == [200, 200, 429]
    assert health.status_code == 200
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
