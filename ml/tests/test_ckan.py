import httpx
import pytest
import respx

from tf_flow_ml.ingestion.ckan import CkanClient, CkanError

BASE = "https://ckan.test"
PACKAGE_URL = f"{BASE}/api/3/action/package_show"


def _package(*resources: dict[str, str]) -> dict[str, object]:
    return {"success": True, "result": {"resources": list(resources)}}


@pytest.fixture
def client() -> CkanClient:
    return CkanClient(BASE)


@respx.mock
def test_returns_every_resource_of_the_format(client: CkanClient) -> None:
    respx.get(PACKAGE_URL).respond(
        json=_package(
            {"id": "a", "name": "2024", "format": "txt", "url": f"{BASE}/2024.txt"},
            {"id": "b", "name": "2025", "format": "TXT", "url": f"{BASE}/2025.txt"},
            {"id": "c", "name": "json", "format": "JSON", "url": f"{BASE}/all.json"},
        )
    )

    resources = client.list_resources("traffic", "TXT")

    assert [r.name for r in resources] == ["2024", "2025"]


@respx.mock
def test_read_package_concatenates_resources(client: CkanClient) -> None:
    respx.get(PACKAGE_URL).respond(
        json=_package(
            {"id": "a", "name": "2024", "format": "TXT", "url": f"{BASE}/2024.txt"},
            {"id": "b", "name": "2025", "format": "TXT", "url": f"{BASE}/2025.txt"},
        )
    )
    respx.get(f"{BASE}/2024.txt").respond(text="estacion_id,ligeros\n1,10\n")
    respx.get(f"{BASE}/2025.txt").respond(text="estacion_id,ligeros\n1,20\n2,5\n")

    df = client.read_package("traffic", "TXT")

    assert df["ligeros"].tolist() == [10, 20, 5]


@respx.mock
def test_missing_format_raises(client: CkanClient) -> None:
    respx.get(PACKAGE_URL).respond(
        json=_package(
            {"id": "c", "name": "json", "format": "JSON", "url": f"{BASE}/all.json"},
        )
    )

    with pytest.raises(CkanError, match="TXT"):
        client.list_resources("traffic", "TXT")


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(200, text="<html>no es json</html>"),
        httpx.Response(200, json={"success": False, "error": {"message": "Not found"}}),
    ],
)
def test_portal_errors_become_ckan_errors(client: CkanClient, response: httpx.Response) -> None:
    respx.get(PACKAGE_URL).mock(return_value=response)

    with pytest.raises(CkanError):
        client.list_resources("traffic", "TXT")
