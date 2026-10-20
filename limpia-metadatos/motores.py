"""Motores que leen, limpian y editan metadatos según el tipo de archivo.

- PDF ............................ pikepdf
- Word/Excel/PowerPoint/LibreOffice  zip + XML (sin dependencias)
- Audio (mp3, flac, ogg, m4a...) . mutagen
- Todo lo demás (fotos, vídeo...)  ExifTool (o Pillow como reserva para fotos)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import warnings
import zipfile
import xml.etree.ElementTree as ET

# Dentro de la aplicación instalada (PyInstaller) los recursos están en sys._MEIPASS.
CARPETA_APP = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))

# Campos "fáciles" que se ofrecen al añadir un metadato.
CAMPOS = [
    ("titulo", "Título"),
    ("autor", "Autor"),
    ("descripcion", "Descripción"),
    ("palabras_clave", "Palabras clave"),
    ("copyright", "Copyright / derechos"),
    ("comentario", "Comentario"),
    ("fecha", "Fecha de creación"),
]

PATRON_SENSIBLE = re.compile(
    r"gps|latitud|longitud|location|ubicaci|author|autor|artist|creator|owner|serial|"
    r"\bmake\b|model|lens|software|producer|company|manager|lastmodifiedby|user|email|"
    r"host|computer|device|camera|by-?line|credit|contact|address|city|country|"
    r"initial-creator|dc:creator|lastprinted|template",
    re.I,
)

CLAVE_VALIDA = re.compile(r"^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$")


class ErrorMetadatos(Exception):
    pass


def es_sensible(clave):
    return bool(PATRON_SENSIBLE.search(clave))


def _limpiar_valor(valor):
    return str(valor).replace("\r", " ").replace("\n", " ").strip()


def _fecha_exif(valor):
    """'2024-05-01T12:30' -> '2024:05:01 12:30:00'"""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", valor)
    if not m:
        return valor
    a, mes, d, h, mi, s = m.groups()
    return f"{a}:{mes}:{d} {h or '00'}:{mi or '00'}:{s or '00'}"


def _fecha_iso(valor):
    """'2024-05-01T12:30' -> '2024-05-01T12:30:00Z'"""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", valor)
    if not m:
        return valor
    a, mes, d, h, mi, s = m.groups()
    return f"{a}-{mes}-{d}T{h or '00'}:{mi or '00'}:{s or '00'}Z"


def dato(clave, valor, grupo="", nombre=None, editable=True, borrable=True):
    return {
        "clave": clave,
        "grupo": grupo,
        "nombre": nombre or clave,
        "valor": valor,
        "editable": editable,
        "borrable": borrable,
    }


class Motor:
    nombre = ""
    # Si admite escribir nombres de metadatos libres además de los CAMPOS.
    personalizado = False
    # Subconjunto de CAMPOS que entiende este motor.
    campos = ()

    def leer(self, ruta):
        raise NotImplementedError

    def limpiar(self, ruta):
        raise NotImplementedError

    def editar(self, ruta, cambios, nuevos):
        """cambios: {clave: valor nuevo | None para borrar}
        nuevos: [(campo, valor)] donde campo es una clave de CAMPOS o 'otro:Nombre'."""
        raise ErrorMetadatos("Este tipo de archivo no permite editar metadatos.")


# --------------------------------------------------------------------------- ExifTool


def buscar_exiftool():
    """Devuelve la orden para ejecutar ExifTool (lista) o None si no está."""
    # 1. El que viene dentro de la aplicación instalada.
    incluido = os.path.join(CARPETA_APP, "exiftool", "exiftool.exe")
    if sys.platform == "win32" and os.path.isfile(incluido):
        return [incluido]
    script = os.path.join(CARPETA_APP, "exiftool", "exiftool")
    perl = shutil.which("perl") or ("/usr/bin/perl" if os.path.exists("/usr/bin/perl") else None)
    if sys.platform != "win32" and os.path.isfile(script) and perl:
        return [perl, script]
    # 2. Uno instalado en el equipo.
    for candidato in (
        os.path.join(CARPETA_APP, "exiftool.exe"),
        os.path.join(CARPETA_APP, "herramientas", "exiftool.exe"),
        # Donde lo deja el instalador de Windows (winget / exiftool.org).
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "ExifTool", "exiftool.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "ExifTool", "ExifTool.exe"),
    ):
        if os.path.isfile(candidato):
            return [candidato]
    # Las apps de Mac abiertas desde el Finder no ven el PATH de Homebrew.
    for carpeta in ("/opt/homebrew/bin", "/usr/local/bin"):
        if os.path.isfile(os.path.join(carpeta, "exiftool")):
            return [os.path.join(carpeta, "exiftool")]
    encontrado = shutil.which("exiftool")
    return [encontrado] if encontrado else None


EXIFTOOL = buscar_exiftool()
EXTENSIONES_QUICKTIME = {".mp4", ".mov", ".m4v", ".3gp", ".3g2"}
FECHAS_QUICKTIME = (
    "QuickTime:CreateDate", "QuickTime:ModifyDate", "TrackCreateDate",
    "TrackModifyDate", "MediaCreateDate", "MediaModifyDate",
)
GRUPOS_SOLO_LECTURA = {"System", "File", "Composite", "ExifTool"}
# Datos estructurales que el propio formato necesita y no dicen nada de nadie.
TECNICOS = {
    "JFIFVersion", "ResolutionUnit", "XResolution", "YResolution", "YCbCrPositioning",
    "ExifVersion", "ComponentsConfiguration", "FlashpixVersion", "ColorSpace", "Orientation",
    "InteropIndex", "InteropVersion", "PixelsPerUnitX", "PixelsPerUnitY", "PixelUnits",
    "XMPToolkit", "MediaDataOffset", "MediaDataSize", "HandlerType", "HandlerVendorID",
    "HandlerDescription", "ExifImageWidth", "ExifImageHeight", "GPSVersionID",
}


def version_exiftool():
    if not EXIFTOOL:
        return None
    try:
        return _ejecutar_exiftool(["-ver"])[0].strip()
    except ErrorMetadatos:
        return None


def _ejecutar_exiftool(argumentos):
    """Devuelve (salida, errores)."""
    # Los argumentos van en un fichero UTF-8 para que tildes y ñ funcionen también en Windows.
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".args", delete=False) as f:
        f.write("\n".join(argumentos))
        fichero_args = f.name
    try:
        opciones = {}
        if sys.platform == "win32":
            opciones["creationflags"] = 0x08000000  # sin ventana de consola
        r = subprocess.run(
            [*EXIFTOOL, "-charset", "filename=utf8", "-@", fichero_args],
            capture_output=True, stdin=subprocess.DEVNULL, **opciones,
        )
    finally:
        os.unlink(fichero_args)
    salida = r.stdout.decode("utf-8", "replace")
    errores = r.stderr.decode("utf-8", "replace")
    return salida, errores


class MotorExifTool(Motor):
    nombre = "ExifTool"
    personalizado = True
    campos = tuple(c for c, _ in CAMPOS)
    etiquetas = {
        "titulo": ["Title"],
        "autor": ["Artist", "Creator"],
        "descripcion": ["ImageDescription", "Description"],
        "palabras_clave": ["Keywords", "Subject"],
        "copyright": ["Copyright", "Rights"],
        "comentario": ["UserComment", "Comment"],
        "fecha": ["DateTimeOriginal", "CreateDate"],
    }

    def leer(self, ruta):
        salida, errores = _ejecutar_exiftool(["-j", "-G1", "-s", "-a", "-api", "largefilesupport=1", ruta])
        try:
            datos = json.loads(salida)[0]
        except (ValueError, IndexError):
            raise ErrorMetadatos(errores.strip() or "No se pudieron leer los metadatos.")
        resultado = []
        for clave, valor in datos.items():
            if clave == "SourceFile" or ":" not in clave:
                continue
            grupo, nombre = clave.split(":", 1)
            if isinstance(valor, list):
                valor = ", ".join(str(v) for v in valor)
            elif isinstance(valor, dict):
                valor = json.dumps(valor, ensure_ascii=False)
            valor = str(valor)
            binario = valor.startswith("(Binary data")
            solo_lectura = grupo in GRUPOS_SOLO_LECTURA
            if nombre in ("FileName", "Directory", "FilePermissions"):
                continue  # nombre interno temporal, no aporta nada
            d = dato(clave, "(datos binarios)" if binario else valor, grupo, nombre,
                     editable=not (solo_lectura or binario), borrable=not solo_lectura)
            d["tecnico"] = nombre in TECNICOS or grupo.startswith("ICC")
            resultado.append(d)
        return resultado

    def _escribir(self, ruta, argumentos):
        salida, errores = _ejecutar_exiftool(["-overwrite_original", "-sep", ", "] + argumentos + [ruta])
        salida += "\n" + errores
        if "1 image files updated" not in salida and "unchanged" not in salida:
            avisos = [l.strip() for l in salida.splitlines() if l.startswith(("Warning", "Error"))]
            no_existe = re.search(r"Tag '([^']+)' is not (?:defined|supported)", salida)
            if no_existe:
                raise ErrorMetadatos(f"El dato «{no_existe.group(1)}» no existe. Revisa el nombre "
                                     "(por ejemplo: Artist, Copyright, XMP-dc:Rights).")
            if "doesn't exist or isn't writable" in salida or "has no writable location" in salida:
                raise ErrorMetadatos("Ese dato no se puede escribir en este tipo de archivo.")
            raise ErrorMetadatos("; ".join(avisos) or "ExifTool no pudo escribir en este archivo.")

    def limpiar(self, ruta):
        # Se conservan la orientación y el perfil de color para que la foto se siga viendo igual.
        argumentos = ["-all=", "-tagsfromfile", "@", "-ColorSpaceTags", "-Orientation"]
        if os.path.splitext(ruta)[1].lower() in EXTENSIONES_QUICKTIME:
            # Las fechas de cabecera de un vídeo no se pueden borrar, solo poner a cero
            # (1904-01-01 es el «cero» del formato QuickTime).
            argumentos += [f"-{t}=1904:01:01 00:00:00" for t in FECHAS_QUICKTIME]
        self._escribir(ruta, argumentos)

    def editar(self, ruta, cambios, nuevos):
        argumentos = []
        for clave, valor in cambios.items():
            if not CLAVE_VALIDA.match(clave):
                raise ErrorMetadatos(f"Nombre de metadato no válido: {clave}")
            argumentos.append(f"-{clave}=" + ("" if valor is None else _limpiar_valor(valor)))
        for campo, valor in nuevos:
            valor = _limpiar_valor(valor)
            if campo.startswith("otro:"):
                etiqueta = campo[5:].strip()
                if not CLAVE_VALIDA.match(etiqueta):
                    raise ErrorMetadatos(f"Nombre de metadato no válido: {etiqueta}")
                argumentos.append(f"-{etiqueta}={valor}")
            elif campo in self.etiquetas:
                if campo == "fecha":
                    valor = _fecha_exif(valor)
                argumentos += [f"-{e}={valor}" for e in self.etiquetas[campo]]
        if argumentos:
            self._escribir(ruta, argumentos)


# --------------------------------------------------------------------------- Pillow (reserva)


class MotorImagenBasico(Motor):
    """Solo se usa si ExifTool no está instalado: lee y limpia fotos, sin edición."""

    nombre = "Pillow (básico)"

    def leer(self, ruta):
        from PIL import Image, ExifTags

        resultado = []
        with Image.open(ruta) as img:
            exif = img.getexif()
            bloques = [(exif, "EXIF")]
            for ifd, grupo in ((ExifTags.IFD.Exif, "EXIF"), (ExifTags.IFD.GPSInfo, "GPS")):
                try:
                    bloques.append((exif.get_ifd(ifd), grupo))
                except Exception:
                    pass
            for tabla, grupo in bloques:
                nombres = ExifTags.GPSTAGS if grupo == "GPS" else ExifTags.TAGS
                for numero, valor in tabla.items():
                    if numero in (ExifTags.IFD.Exif, ExifTags.IFD.GPSInfo):
                        continue
                    nombre = nombres.get(numero, str(numero))
                    if isinstance(valor, bytes):
                        valor = "(datos binarios)"
                    resultado.append(dato(f"{grupo}:{nombre}", str(valor), grupo, nombre, editable=False))
            for clave, valor in img.info.items():
                if clave in ("exif", "dpi", "jfif", "jfif_version", "jfif_unit", "jfif_density"):
                    continue
                if isinstance(valor, bytes):
                    valor = "(datos binarios)"
                resultado.append(dato(f"Info:{clave}", str(valor), "Info", clave, editable=False))
        return resultado

    def limpiar(self, ruta):
        from PIL import Image, ImageOps

        with Image.open(ruta) as original:
            formato = original.format
            # Gira la foto según su orientación, porque esa información también se borra.
            img = ImageOps.exif_transpose(original)
            perfil = original.info.get("icc_profile")
            limpia = Image.frombytes(img.mode, img.size, img.tobytes())
            if img.mode == "P":
                limpia.putpalette(img.getpalette())
        opciones = {"icc_profile": perfil} if perfil else {}
        if formato == "JPEG":
            opciones["quality"] = 95
        limpia.save(ruta, formato, **opciones)


# --------------------------------------------------------------------------- PDF


PREFIJOS_XMP = {
    "http://purl.org/dc/elements/1.1/": "dc",
    "http://ns.adobe.com/xap/1.0/": "xmp",
    "http://ns.adobe.com/pdf/1.3/": "pdf",
    "http://ns.adobe.com/xap/1.0/mm/": "xmpMM",
    "http://ns.adobe.com/xap/1.0/rights/": "xmpRights",
    "http://ns.adobe.com/photoshop/1.0/": "photoshop",
    "http://ns.adobe.com/pdfx/1.3/": "pdfx",
    "http://www.aiim.org/pdfa/ns/id/": "pdfaid",
}


def _nombre_xmp(clave):
    """'{http://purl.org/dc/elements/1.1/}creator' -> 'dc:creator'"""
    if clave.startswith("{") and "}" in clave:
        uri, local = clave[1:].split("}", 1)
        return f"{PREFIJOS_XMP.get(uri, 'xmp')}:{local}"
    return clave


class MotorPDF(Motor):
    nombre = "PDF"
    personalizado = True
    campos = ("titulo", "autor", "descripcion", "palabras_clave", "fecha")
    equivalentes_xmp = {
        "/Title": "dc:title", "/Author": "dc:creator", "/Subject": "dc:description",
        "/Keywords": "pdf:Keywords", "/Creator": "xmp:CreatorTool", "/Producer": "pdf:Producer",
        "/CreationDate": "xmp:CreateDate", "/ModDate": "xmp:ModifyDate",
    }
    claves = {
        "titulo": "/Title", "autor": "/Author", "descripcion": "/Subject",
        "palabras_clave": "/Keywords", "fecha": "/CreationDate",
    }

    def leer(self, ruta):
        import pikepdf

        resultado = []
        with pikepdf.open(ruta) as pdf:
            for clave, valor in pdf.docinfo.items():
                resultado.append(dato(f"Info:{clave[1:]}", str(valor), "Info", clave[1:]))
            if "/Metadata" in pdf.Root:
                try:
                    with pdf.open_metadata() as xmp:
                        for clave, valor in xmp.items():
                            if isinstance(valor, (list, set, tuple)):
                                valor = ", ".join(str(v) for v in valor)
                            resultado.append(dato(f"XMP:{clave}", str(valor), "XMP",
                                                  _nombre_xmp(clave), editable=False))
                except Exception:
                    resultado.append(dato("XMP:Metadata", "(bloque XMP)", "XMP", "Metadata", editable=False))
            paginas = sum(1 for p in pdf.pages if "/Metadata" in p.obj or "/PieceInfo" in p.obj)
            if paginas:
                resultado.append(dato("Páginas:Metadata", f"{paginas} página(s) con datos internos",
                                      "Páginas", "Metadatos de página", editable=False))
            resultado.append(dato("Documento:Páginas", str(len(pdf.pages)), "Documento",
                                  "Número de páginas", editable=False, borrable=False))
            resultado.append(dato("Documento:Versión", pdf.pdf_version, "Documento",
                                  "Versión PDF", editable=False, borrable=False))
        return resultado

    def _guardar(self, pdf, ruta):
        temporal = ruta + ".tmp"
        pdf.save(temporal, deterministic_id=True)
        pdf.close()
        os.replace(temporal, ruta)

    def limpiar(self, ruta):
        import pikepdf

        pdf = pikepdf.open(ruta)
        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]
        if "/Metadata" in pdf.Root:
            del pdf.Root["/Metadata"]
        if "/PieceInfo" in pdf.Root:
            del pdf.Root["/PieceInfo"]
        for pagina in pdf.pages:
            for clave in ("/Metadata", "/PieceInfo"):
                if clave in pagina.obj:
                    del pagina.obj[clave]
        self._guardar(pdf, ruta)

    def editar(self, ruta, cambios, nuevos):
        import pikepdf

        pdf = pikepdf.open(ruta)
        info = pdf.docinfo
        cambiados = pikepdf.Dictionary()  # para copiarlos también al bloque XMP
        borrados = []
        for clave, valor in cambios.items():
            grupo, _, nombre = clave.partition(":")
            if grupo == "XMP" and valor is None:
                if "/Metadata" in pdf.Root:
                    with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as xmp:
                        if nombre in xmp:
                            del xmp[nombre]
            elif grupo == "Páginas" and valor is None:
                for pagina in pdf.pages:
                    for c in ("/Metadata", "/PieceInfo"):
                        if c in pagina.obj:
                            del pagina.obj[c]
            elif grupo == "Info":
                if valor is None:
                    if "/" + nombre in info:
                        del info["/" + nombre]
                    borrados.append("/" + nombre)
                else:
                    info["/" + nombre] = cambiados["/" + nombre] = pikepdf.String(_limpiar_valor(valor))
        for campo, valor in nuevos:
            valor = _limpiar_valor(valor)
            if campo.startswith("otro:"):
                nombre = campo[5:].strip()
                if not re.match(r"^[A-Za-z0-9_]+$", nombre):
                    raise ErrorMetadatos(f"Nombre de metadato no válido: {nombre}")
                info["/" + nombre] = pikepdf.String(valor)
            elif campo in self.claves:
                if campo == "fecha":
                    iso = _fecha_iso(valor)
                    valor = "D:" + re.sub(r"[-:TZ]", "", iso) + "Z"
                info[self.claves[campo]] = cambiados[self.claves[campo]] = pikepdf.String(valor)
        if "/Metadata" in pdf.Root and (cambiados or borrados):
            # Mantiene el bloque XMP coherente con lo que se ha cambiado en la ficha del PDF.
            with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as xmp:
                for nombre in borrados:
                    equivalente = self.equivalentes_xmp.get(nombre)
                    if equivalente and equivalente in xmp:
                        del xmp[equivalente]
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    xmp.load_from_docinfo(cambiados, raise_failure=False)
        self._guardar(pdf, ruta)


# --------------------------------------------------------------------------- Office


NS = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "dcmitype": "http://purl.org/dc/dcmitype/",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
    "vt": "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "xlink": "http://www.w3.org/1999/xlink",
    "ooo": "http://openoffice.org/2004/office",
    "grddl": "http://www.w3.org/2003/g/data-view#",
}
for _prefijo, _uri in NS.items():
    if _prefijo != "ep":
        ET.register_namespace(_prefijo, _uri)
ET.register_namespace("", NS["ep"])


def _nombre_corto(etiqueta):
    uri, _, local = etiqueta[1:].partition("}")
    for prefijo, u in NS.items():
        if u == uri:
            return f"{prefijo}:{local}"
    return local


def _etiqueta_larga(corto):
    prefijo, _, local = corto.partition(":")
    return f"{{{NS[prefijo]}}}{local}"


def _xml_bytes(raiz):
    return b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + ET.tostring(raiz, encoding="utf-8")


def _reescribir_zip(ruta, reemplazos):
    """Copia el zip cambiando solo las partes indicadas (mantiene orden y compresión)."""
    temporal = ruta + ".tmp"
    with zipfile.ZipFile(ruta) as origen, zipfile.ZipFile(temporal, "w") as destino:
        for info in origen.infolist():
            contenido = reemplazos.get(info.filename)
            if contenido is None:
                contenido = origen.read(info.filename)
            destino.writestr(info, contenido)
    os.replace(temporal, ruta)


class MotorOffice(Motor):
    """Word, Excel y PowerPoint (.docx, .xlsx, .pptx...)."""

    nombre = "Office"
    campos = ("titulo", "autor", "descripcion", "palabras_clave", "comentario", "fecha")
    partes_campo = {
        "titulo": "dc:title", "autor": "dc:creator", "descripcion": "dc:subject",
        "palabras_clave": "cp:keywords", "comentario": "dc:description", "fecha": "dcterms:created",
    }
    # Datos de la aplicación que identifican a la persona o al equipo.
    app_sensibles = ("Company", "Manager", "Template", "Application", "AppVersion",
                     "TotalTime", "HyperlinkBase", "DocSecurity")
    orden_core = ("dc:title", "dc:subject", "dc:creator", "cp:keywords", "dc:description",
                  "cp:lastModifiedBy", "cp:revision", "cp:lastPrinted", "dcterms:created",
                  "dcterms:modified", "cp:category", "cp:contentStatus", "dc:language")

    def _leer_partes(self, ruta):
        with zipfile.ZipFile(ruta) as z:
            nombres = set(z.namelist())
            leer = lambda n: ET.fromstring(z.read(n)) if n in nombres else None
            return leer("docProps/core.xml"), leer("docProps/app.xml"), leer("docProps/custom.xml")

    def leer(self, ruta):
        core, app, custom = self._leer_partes(ruta)
        resultado = []
        if core is not None:
            for el in core:
                nombre = _nombre_corto(el.tag)
                resultado.append(dato(f"core:{nombre}", el.text or "", "Documento", nombre))
        if app is not None:
            for el in app:
                local = el.tag.split("}")[-1]
                if len(el):
                    texto = "(lista)"
                    editable = False
                else:
                    texto = el.text or ""
                    editable = True
                resultado.append(dato(f"app:{local}", texto, "Aplicación", local, editable=editable))
        if custom is not None:
            for el in custom:
                nombre = el.get("name", "?")
                valor = "".join(el.itertext())
                resultado.append(dato(f"custom:{nombre}", valor, "Personalizado", nombre, editable=False))
        return resultado

    def limpiar(self, ruta):
        core, app, custom = self._leer_partes(ruta)
        reemplazos = {}
        if core is not None:
            for el in list(core):
                core.remove(el)
            reemplazos["docProps/core.xml"] = _xml_bytes(core)
        if app is not None:
            for el in list(app):
                if el.tag.split("}")[-1] in self.app_sensibles:
                    app.remove(el)
            reemplazos["docProps/app.xml"] = _xml_bytes(app)
        if custom is not None:
            for el in list(custom):
                custom.remove(el)
            reemplazos["docProps/custom.xml"] = _xml_bytes(custom)
        if reemplazos:
            _reescribir_zip(ruta, reemplazos)

    def editar(self, ruta, cambios, nuevos):
        core, app, custom = self._leer_partes(ruta)
        tocado = set()
        for clave, valor in cambios.items():
            parte, _, nombre = clave.partition(":")
            if parte == "core" and core is not None:
                el = core.find(_etiqueta_larga(nombre)) if ":" in nombre else None
                if el is not None:
                    if valor is None:
                        core.remove(el)
                    else:
                        el.text = _limpiar_valor(valor)
                    tocado.add("core")
            elif parte == "app" and app is not None:
                el = app.find(f"{{{NS['ep']}}}{nombre}")
                if el is not None:
                    if valor is None:
                        app.remove(el)
                    else:
                        el.text = _limpiar_valor(valor)
                    tocado.add("app")
            elif parte == "custom" and custom is not None and valor is None:
                for el in list(custom):
                    if el.get("name") == nombre:
                        custom.remove(el)
                        tocado.add("custom")
        for campo, valor in nuevos:
            if campo not in self.partes_campo:
                raise ErrorMetadatos("En documentos de Office solo se pueden añadir los campos de la lista.")
            if core is None:
                raise ErrorMetadatos("Este documento no tiene bloque de propiedades.")
            etiqueta = self.partes_campo[campo]
            el = core.find(_etiqueta_larga(etiqueta))
            if el is None:
                el = ET.SubElement(core, _etiqueta_larga(etiqueta))
                if etiqueta.startswith("dcterms:"):
                    el.set(_etiqueta_larga("xsi:type"), "dcterms:W3CDTF")
            el.text = _fecha_iso(_limpiar_valor(valor)) if campo == "fecha" else _limpiar_valor(valor)
            tocado.add("core")
        reemplazos = {}
        if "core" in tocado:
            reemplazos["docProps/core.xml"] = _xml_bytes(core)
        if "app" in tocado:
            reemplazos["docProps/app.xml"] = _xml_bytes(app)
        if "custom" in tocado:
            reemplazos["docProps/custom.xml"] = _xml_bytes(custom)
        if reemplazos:
            _reescribir_zip(ruta, reemplazos)


class MotorOpenDocument(Motor):
    """LibreOffice / OpenOffice (.odt, .ods, .odp...)."""

    nombre = "OpenDocument"
    campos = ("titulo", "autor", "descripcion", "palabras_clave", "fecha")
    partes_campo = {
        "titulo": "dc:title", "autor": "meta:initial-creator", "descripcion": "dc:subject",
        "palabras_clave": "meta:keyword", "fecha": "meta:creation-date",
    }

    def _meta(self, ruta):
        with zipfile.ZipFile(ruta) as z:
            if "meta.xml" not in z.namelist():
                return None, None
            raiz = ET.fromstring(z.read("meta.xml"))
        return raiz, raiz.find(_etiqueta_larga("office:meta"))

    def leer(self, ruta):
        _, meta = self._meta(ruta)
        resultado = []
        if meta is None:
            return resultado
        for el in meta:
            nombre = _nombre_corto(el.tag)
            if nombre == "meta:document-statistic":
                for k, v in el.attrib.items():
                    resultado.append(dato(f"stat:{_nombre_corto(k)}", v, "Estadísticas",
                                          _nombre_corto(k), editable=False, borrable=False))
            elif nombre == "meta:user-defined":
                n = el.get(_etiqueta_larga("meta:name"), "?")
                resultado.append(dato(f"user:{n}", el.text or "", "Personalizado", n, editable=False))
            elif nombre == "meta:template":
                resultado.append(dato("meta:meta:template", el.get(_etiqueta_larga("xlink:href"), ""),
                                      "Documento", "meta:template", editable=False))
            else:
                resultado.append(dato(f"meta:{nombre}", el.text or "", "Documento", nombre))
        return resultado

    def _guardar(self, ruta, raiz):
        _reescribir_zip(ruta, {"meta.xml": _xml_bytes(raiz)})

    def limpiar(self, ruta):
        raiz, meta = self._meta(ruta)
        if meta is None:
            return
        for el in list(meta):
            if _nombre_corto(el.tag) != "meta:document-statistic":
                meta.remove(el)
        self._guardar(ruta, raiz)

    def editar(self, ruta, cambios, nuevos):
        raiz, meta = self._meta(ruta)
        if meta is None:
            raise ErrorMetadatos("Este documento no tiene bloque de propiedades.")
        for clave, valor in cambios.items():
            parte, _, nombre = clave.partition(":")
            for el in list(meta):
                corto = _nombre_corto(el.tag)
                coincide = (
                    (parte == "meta" and corto == nombre)
                    or (parte == "user" and corto == "meta:user-defined"
                        and el.get(_etiqueta_larga("meta:name")) == nombre)
                )
                if coincide:
                    if valor is None:
                        meta.remove(el)
                    else:
                        el.text = _limpiar_valor(valor)
        for campo, valor in nuevos:
            if campo not in self.partes_campo:
                raise ErrorMetadatos("En documentos de LibreOffice solo se pueden añadir los campos de la lista.")
            etiqueta = self.partes_campo[campo]
            el = meta.find(_etiqueta_larga(etiqueta))
            if el is None or campo == "palabras_clave":
                el = ET.SubElement(meta, _etiqueta_larga(etiqueta))
            valor = _limpiar_valor(valor)
            el.text = _fecha_iso(valor).rstrip("Z") if campo == "fecha" else valor
        self._guardar(ruta, raiz)


# --------------------------------------------------------------------------- Audio


class MotorAudio(Motor):
    nombre = "Audio"
    campos = ("titulo", "autor", "copyright", "fecha", "comentario")
    claves = {"titulo": "title", "autor": "artist", "copyright": "copyright",
              "fecha": "date", "comentario": "comment"}
    personalizado = True

    def _abrir(self, ruta, easy=True):
        import mutagen

        archivo = mutagen.File(ruta, easy=easy)
        if archivo is None:
            raise ErrorMetadatos("Formato de audio no reconocido.")
        return archivo

    def leer(self, ruta):
        archivo = self._abrir(ruta)
        resultado = []
        if archivo.tags is not None:
            for clave in sorted(archivo.tags.keys()):
                valores = archivo.tags[clave]
                if isinstance(valores, list):
                    texto = ", ".join(str(v) for v in valores)
                else:
                    texto = str(valores)
                resultado.append(dato(f"tag:{clave}", texto, "Etiquetas", clave))
        # Lo que la vista "fácil" no muestra (portadas, datos privados, etc.).
        crudo = self._abrir(ruta, easy=False)
        ocultos = 0
        if crudo.tags is not None:
            ocultos = max(0, len(crudo.tags.keys()) - len(resultado))
        portadas = len(getattr(crudo, "pictures", []) or [])
        if ocultos or portadas:
            resultado.append(dato("otros:todo", f"{ocultos + portadas} elemento(s): portada, datos internos…",
                                  "Otros", "Otros datos", editable=False))
        info = getattr(crudo, "info", None)
        if info is not None and getattr(info, "length", None):
            resultado.append(dato("audio:duración", f"{info.length:.1f} s", "Audio", "Duración",
                                  editable=False, borrable=False))
        return resultado

    def limpiar(self, ruta):
        archivo = self._abrir(ruta, easy=False)
        archivo.delete()
        if hasattr(archivo, "clear_pictures"):
            archivo.clear_pictures()
            archivo.save()
        if ruta.lower().endswith(".mp3"):
            from mutagen.id3 import delete as borrar_id3
            borrar_id3(ruta, delete_v1=True, delete_v2=True)

    def editar(self, ruta, cambios, nuevos):
        if cambios.get("otros:todo", 1) is None:
            self._quitar_otros(ruta)
            cambios = {k: v for k, v in cambios.items() if k != "otros:todo"}
        archivo = self._abrir(ruta)
        if archivo.tags is None:
            try:
                archivo.add_tags()
            except Exception:
                raise ErrorMetadatos("Este archivo de audio no admite etiquetas.")
        for clave, valor in cambios.items():
            nombre = clave.partition(":")[2]
            if valor is None:
                if nombre in archivo.tags:
                    del archivo.tags[nombre]
            else:
                archivo.tags[nombre] = [_limpiar_valor(valor)]
        for campo, valor in nuevos:
            if campo.startswith("otro:"):
                nombre = campo[5:].strip().lower()
            elif campo in self.claves:
                nombre = self.claves[campo]
            else:
                continue
            valor = _limpiar_valor(valor)
            if campo == "fecha":
                valor = valor[:10]
            try:
                archivo.tags[nombre] = [valor]
            except (KeyError, ValueError):
                raise ErrorMetadatos(f"Este formato de audio no admite el campo «{nombre}».")
        archivo.save()

    def _quitar_otros(self, ruta):
        """Borra lo que no se ve en la vista fácil (portadas, etc.) conservando el resto."""
        visibles = {}
        archivo = self._abrir(ruta)
        if archivo.tags is not None:
            visibles = {k: list(archivo.tags[k]) for k in archivo.tags.keys()}
        self.limpiar(ruta)
        archivo = self._abrir(ruta)
        if visibles:
            if archivo.tags is None:
                archivo.add_tags()
            for k, v in visibles.items():
                archivo.tags[k] = v
            archivo.save()


# --------------------------------------------------------------------------- Elección


EXT_OFFICE = {".docx", ".docm", ".dotx", ".xlsx", ".xlsm", ".xltx", ".pptx", ".pptm", ".potx"}
EXT_ODF = {".odt", ".ods", ".odp", ".odg", ".ott", ".ots", ".otp"}
EXT_AUDIO = {".mp3", ".flac", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".wma", ".ape", ".wv", ".aiff", ".aif"}
EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


def elegir_motor(nombre_archivo):
    ext = os.path.splitext(nombre_archivo)[1].lower()
    if ext == ".pdf":
        return MotorPDF()
    if ext in EXT_OFFICE:
        return MotorOffice()
    if ext in EXT_ODF:
        return MotorOpenDocument()
    if ext in EXT_AUDIO:
        return MotorAudio()
    if EXIFTOOL:
        return MotorExifTool()
    if ext in EXT_IMAGEN:
        return MotorImagenBasico()
    return None
