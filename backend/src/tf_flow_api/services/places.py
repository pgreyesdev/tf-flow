"""Lugares de Tenerife que se pueden usar como origen o destino de una ruta.

Las 31 cabeceras municipales y los destinos más habituales. Las coordenadas son aproximadas: el
servidor de rutas lleva cada punto a la carretera más cercana. Por eso los aeropuertos no van en
el centro de la terminal, sino en su vía de acceso: desde el centro, OSRM se engancha a los viales
internos y la ruta da un rodeo (en el Sur, por Los Abrigos y El Médano: unos 20 minutos de más).
"""

import unicodedata
from typing import Final

from tf_flow_api.domain.routes import Place


def fold(text: str) -> str:
    """Minúsculas, sin tildes y sin signos, para comparar nombres."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    plain = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join("".join(c if c.isalnum() else " " for c in plain).split())


def _place(name: str, latitude: float, longitude: float) -> Place:
    return Place(id=fold(name).replace(" ", "-"), name=name, latitude=latitude, longitude=longitude)


PLACES: Final[list[Place]] = sorted(
    (
        _place(*row)
        for row in [
            # Municipios.
            ("Adeje", 28.1227, -16.7260),
            ("Arafo", 28.3397, -16.4180),
            ("Arico", 28.1667, -16.4833),
            ("Arona", 28.0996, -16.6810),
            ("Buenavista del Norte", 28.3740, -16.8600),
            ("Candelaria", 28.3549, -16.3711),
            ("Fasnia", 28.2367, -16.4389),
            ("Garachico", 28.3730, -16.7640),
            ("Granadilla de Abona", 28.1186, -16.5761),
            ("Guía de Isora", 28.2110, -16.7790),
            ("Güímar", 28.3156, -16.4100),
            ("Icod de los Vinos", 28.3670, -16.7180),
            ("La Guancha", 28.3730, -16.6530),
            ("La Matanza de Acentejo", 28.4510, -16.4470),
            ("La Orotava", 28.3900, -16.5230),
            ("La Victoria de Acentejo", 28.4320, -16.4630),
            ("Los Realejos", 28.3840, -16.5830),
            ("Los Silos", 28.3660, -16.8160),
            ("El Rosario", 28.4400, -16.3650),
            ("El Sauzal", 28.4780, -16.4300),
            ("El Tanque", 28.3550, -16.7810),
            ("Puerto de la Cruz", 28.4140, -16.5490),
            ("San Cristóbal de La Laguna", 28.4874, -16.3159),
            ("San Juan de la Rambla", 28.3920, -16.6510),
            ("San Miguel de Abona", 28.0980, -16.6170),
            ("Santa Cruz de Tenerife", 28.4636, -16.2518),
            ("Santa Úrsula", 28.4250, -16.4880),
            ("Santiago del Teide", 28.2950, -16.8150),
            ("Tacoronte", 28.4770, -16.4100),
            ("Tegueste", 28.5180, -16.3380),
            ("Vilaflor", 28.1570, -16.6370),
            # Destinos habituales.
            ("Aeropuerto Tenerife Norte", 28.4840, -16.3390),  # Acceso por la TF-152.
            ("Aeropuerto Tenerife Sur", 28.0490, -16.5725),  # Glorietas de acceso desde la TF-1.
            ("Bajamar", 28.5530, -16.3460),
            ("Costa Adeje", 28.0850, -16.7380),
            ("El Médano", 28.0440, -16.5370),
            ("La Esperanza", 28.4500, -16.3700),
            ("Las Galletas", 28.0090, -16.6600),
            ("Los Cristianos", 28.0510, -16.7170),
            ("Los Gigantes", 28.2440, -16.8410),
            ("Playa de las Américas", 28.0610, -16.7310),
            ("Punta del Hidalgo", 28.5700, -16.3270),
            ("San Andrés", 28.5050, -16.1930),
            ("Tejina", 28.5330, -16.3600),
        ]
    ),
    key=lambda place: fold(place.name),
)

_BY_ID: Final = {place.id: place for place in PLACES}


def place_by_id(place_id: str) -> Place | None:
    return _BY_ID.get(place_id)


def find_place(query: str) -> Place | None:
    """El lugar que mejor encaja con lo que escribe una persona: «la laguna», «aeropuerto sur»..."""
    wanted = fold(query)
    if not wanted:
        return None
    for place in PLACES:
        if fold(place.name) == wanted:
            return place
    words = wanted.split()
    matches = [p for p in PLACES if all(w in fold(p.name).split() for w in words)]
    if not matches:
        matches = [p for p in PLACES if wanted in fold(p.name)]
    # Ante varias, la de nombre más corto: «La Laguna» es San Cristóbal de La Laguna.
    return min(matches, key=lambda p: len(p.name), default=None)
