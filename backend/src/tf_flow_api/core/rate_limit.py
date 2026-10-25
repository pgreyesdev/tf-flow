"""Límite de peticiones por cliente con un cubo de fichas en memoria.

Sirve para una sola instancia de la API, que es el despliegue previsto. Detrás de un proxy, uvicorn
debe arrancar con ``--proxy-headers`` y ``--forwarded-allow-ips`` para que la IP sea la del cliente.
"""

import math
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

EXEMPT_PATHS = frozenset({"/api/v1/health"})
MAX_CLIENTS = 10_000


class RateLimiter:
    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic) -> None:
        self.capacity = float(per_minute)
        self.rate = per_minute / 60
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}

    def acquire(self, client: str) -> float:
        """0 si la petición pasa; si no, los segundos que faltan para la siguiente ficha."""
        now = self.clock()
        tokens, last = self._buckets.get(client, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - last) * self.rate)
        if tokens < 1:
            self._buckets[client] = (tokens, now)
            return (1 - tokens) / self.rate
        if len(self._buckets) >= MAX_CLIENTS and client not in self._buckets:
            self._forget_idle(now)
        self._buckets[client] = (tokens - 1, now)
        return 0.0

    def _forget_idle(self, now: float) -> None:
        """Olvida los clientes con el cubo ya lleno: no cambia a quién se limita."""
        refill = self.capacity / self.rate
        self._buckets = {k: v for k, v in self._buckets.items() if now - v[1] < refill}


def rate_limit_middleware(
    limiter: RateLimiter,
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in EXEMPT_PATHS or request.method == "OPTIONS":
            return await call_next(request)
        client = request.client.host if request.client else "desconocido"
        wait = limiter.acquire(client)
        if wait:
            return JSONResponse(
                {"detail": "Demasiadas peticiones, prueba de nuevo en unos segundos"},
                status_code=429,
                headers={"Retry-After": str(math.ceil(wait))},
            )
        return await call_next(request)

    return middleware
