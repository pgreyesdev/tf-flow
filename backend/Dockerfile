# Imagen de la API: compilación con uv y ejecución como usuario sin privilegios.
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
COPY backend ./backend
COPY ml ./ml
RUN uv sync --frozen --no-dev --package tf-flow-api

FROM python:3.12-slim
# LightGBM necesita la biblioteca de OpenMP en tiempo de ejecución.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=builder --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"
CMD ["uvicorn", "tf_flow_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
