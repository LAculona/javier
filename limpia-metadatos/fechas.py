"""Leer, mostrar y reescribir fechas de metadatos respetando el formato de cada una.

Cada tipo de archivo guarda las fechas a su manera:
  EXIF/ExifTool  2024:05:01 12:30:00+02:00
  ISO (Office)   2024-05-01T12:30:00Z
  PDF            D:20240501123000+02'00'
  Audio          2024  o  2024-05-01
"""

import re
from dataclasses import dataclass
from datetime import datetime

_PATRONES = [
    ("exif", re.compile(r"^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")),
    ("iso", re.compile(r"^(\d{4})-(\d{2})-(\d{2})([T ])(\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")),
    ("pdf", re.compile(r"^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(.*)$")),
    ("fecha_exif", re.compile(r"^(\d{4}):(\d{2}):(\d{2})$")),
    ("fecha_iso", re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")),
    ("anio", re.compile(r"^(\d{4})$")),
]


@dataclass
class Fecha:
    momento: datetime  # sin zona horaria: la zona se guarda aparte, tal cual venía
    estilo: str
    zona: str = ""
    fraccion: str = ""
    separador: str = "T"

    def texto(self, momento=None):
        """El valor listo para escribir en el archivo, en su formato original."""
        m = momento or self.momento
        if self.estilo == "exif":
            return f"{m:%Y:%m:%d %H:%M:%S}{self.fraccion}{self.zona}"
        if self.estilo == "iso":
            return f"{m:%Y-%m-%d}{self.separador}{m:%H:%M:%S}{self.fraccion}{self.zona}"
        if self.estilo == "pdf":
            return f"D:{m:%Y%m%d%H%M%S}{self.zona}"
        if self.estilo == "fecha_exif":
            return f"{m:%Y:%m:%d}"
        if self.estilo == "fecha_iso":
            return f"{m:%Y-%m-%d}"
        return f"{m:%Y}"

    def legible(self):
        """Para enseñar a la persona: 01/05/2024 12:30:00 (UTC+02:00)."""
        m = self.momento
        if self.estilo == "anio":
            return f"{m:%Y}"
        if self.estilo in ("fecha_exif", "fecha_iso"):
            return f"{m:%d/%m/%Y}"
        zona = zona_legible(self.zona)
        return f"{m:%d/%m/%Y %H:%M:%S}" + (f" ({zona})" if zona else "")


def zona_legible(zona):
    zona = (zona or "").replace("'", "")
    if zona.upper().startswith("Z"):
        return "UTC"
    m = re.match(r"^([+-])(\d{2}):?(\d{2})", zona)
    return f"UTC{m.group(1)}{m.group(2)}:{m.group(3)}" if m else ""


def parsear(valor):
    """Devuelve una Fecha o None si el texto no es una fecha válida."""
    valor = str(valor or "").strip()
    for estilo, patron in _PATRONES:
        m = patron.match(valor)
        if not m:
            continue
        g = m.groups()
        try:
            if estilo == "exif":
                momento = datetime(*map(int, g[:6]))
                return Fecha(momento, estilo, g[7] or "", g[6] or "")
            if estilo == "iso":
                momento = datetime(int(g[0]), int(g[1]), int(g[2]), int(g[4]), int(g[5]), int(g[6] or 0))
                return Fecha(momento, estilo, g[8] or "", g[7] or "", g[3])
            if estilo == "pdf":
                momento = datetime(int(g[0]), int(g[1]), int(g[2]), int(g[3] or 0), int(g[4] or 0), int(g[5] or 0))
                return Fecha(momento, estilo, g[6] or "")
            if estilo in ("fecha_exif", "fecha_iso"):
                return Fecha(datetime(int(g[0]), int(g[1]), int(g[2])), estilo)
            if 1900 <= int(g[0]) <= 2200:
                return Fecha(datetime(int(g[0]), 1, 1), estilo)
        except ValueError:  # fechas a cero (0000:00:00) o imposibles
            return None
    return None
