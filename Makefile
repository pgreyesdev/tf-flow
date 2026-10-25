.PHONY: install check lint format typecheck test api web web-check docs up down

install:  ## Instala dependencias y los hooks de pre-commit
	uv sync --python 3.12
	uv run pre-commit install
	cd web && pnpm install

check: lint typecheck test  ## Lo mismo que ejecuta el CI

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff check --fix .
	uv run ruff format .

typecheck:
	uv run mypy

test:
	uv run pytest --cov

api:  ## API en local con recarga automática
	uv run uvicorn tf_flow_api.main:app --reload

web:  ## Web en local con recarga automática
	cd web && pnpm dev

web-check:  ## Lo mismo que el CI de la web
	cd web && pnpm check

docs:
	uv run --group docs mkdocs serve

up:
	docker compose up --build

down:
	docker compose down
