from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(environment=Environment.TEST, cors_origins=["https://tf-flow.example"])


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
