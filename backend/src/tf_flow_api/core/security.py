"""Cabeceras de seguridad HTTP que se añaden a todas las respuestas."""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response

SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}


async def add_security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response
