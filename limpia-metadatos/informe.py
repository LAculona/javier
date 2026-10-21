"""Informe completo de un archivo: todo lo que revela, explicado en español.

Junta los metadatos que ya leen los motores con un análisis más profundo:
ubicación exacta, fechas ordenadas, personas, dispositivo, comentarios y
revisiones de documentos, firmas digitales, protecciones, imágenes que hay
dentro de un documento, enlaces, de dónde se descargó y huellas del archivo.
"""

import base64
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
import xml.etree.ElementTree as ET

import fechas
import motores

# ------------------------------------------------------------------ nombres

PERSONAS = {
    "artist": "Autor", "author": "Autor", "creator": "Autor", "dc:creator": "Autor",
    "meta:initial-creator": "Autor original", "cp:lastmodifiedby": "Modificado por",
    "by-line": "Autor (IPTC)", "ownername": "Propietario", "cameraownername": "Propietario de la cámara",
    "copyright": "Copyright", "rights": "Derechos", "credit": "Crédito", "contact": "Contacto",
    "publisher": "Editor", "composer": "Compositor", "albumartist": "Artista del álbum",
    "manager": "Responsable", "company": "Empresa", "meta:printed-by": "Impreso por",
    "copyrightnotice": "Aviso de copyright", "usagerights": "Derechos de uso",
    "byline": "Autor", "writer-editor": "Redactor", "lastmodifiedby": "Modificado por",
}
DISPOSITIVO = {
    "make": "Marca", "model": "Modelo", "cameramodelname": "Modelo de cámara",
    "serialnumber": "Número de serie", "internalserialnumber": "Número de serie interno",
    "bodyserialnumber": "Número de serie del cuerpo", "lensserialnumber": "Número de serie del objetivo",
    "lensmake": "Marca del objetivo", "lensmodel": "Objetivo", "lensid": "Objetivo",
    "hostcomputer": "Ordenador", "androidmodel": "Modelo Android", "androidmanufacturer": "Fabricante Android",
    "androidversion": "Versión de Android", "com.android.version": "Versión de Android",
    "imageuniqueid": "Identificador único de la foto", "deviceid": "Identificador del dispositivo",
}
PROGRAMAS = {
    "software": "Programa", "creatortool": "Programa usado", "producer": "Generado con",
    "application": "Aplicación", "appversion": "Versión de la aplicación", "encoder": "Codificador",
    "meta:generator": "Programa", "encodedby": "Codificado por", "historysoftwareagent": "Historial de programas",
    "compressorname": "Compresor", "writer": "Programa", "xmptoolkit": "Herramienta XMP",
}
AJUSTES = {
    "exposuretime": "Tiempo de exposición", "fnumber": "Apertura (f)", "iso": "ISO",
    "focallength": "Distancia focal", "focallengthin35mmformat": "Focal equivalente 35 mm",
    "flash": "Flash", "whitebalance": "Balance de blancos", "exposureprogram": "Programa de exposición",
    "meteringmode": "Medición", "digitalzoomratio": "Zoom digital", "scenecapturetype": "Tipo de escena",
    "exposurecompensation": "Compensación de exposición", "lightvalue": "Valor de luz",
    "subjectdistance": "Distancia al sujeto", "orientation": "Orientación",
}
CONTENIDO = {
    "imagesize": "Dimensiones", "megapixels": "Megapíxeles", "duration": "Duración",
    "videoframerate": "Fotogramas por segundo", "avgbitrate": "Calidad (bitrate)",
    "audiochannels": "Canales de audio", "audiosamplerate": "Frecuencia de audio",
    "compressorid": "Códec de vídeo", "pages": "Páginas", "words": "Palabras", "characters": "Caracteres",
    "lines": "Líneas", "paragraphs": "Párrafos", "slides": "Diapositivas", "notes": "Notas",
    "hiddenslides": "Diapositivas ocultas", "totaltime": "Minutos de edición", "pagecount": "Páginas",
    "meta:page-count": "Páginas", "meta:word-count": "Palabras", "meta:character-count": "Caracteres",
    "meta:table-count": "Tablas", "meta:image-count": "Imágenes", "duración": "Duración",
    "meta:editing-cycles": "Veces editado", "meta:editing-duration": "Tiempo de edición",
    "cp:revision": "Número de revisión", "colorspace": "Espacio de color", "bitdepth": "Profundidad de color",
}
LUGAR = {
    "city": "Ciudad", "country": "País", "country-primarylocationname": "País", "state": "Región",
    "province-state": "Provincia", "sub-location": "Zona", "location": "Lugar",
    "countrycode": "Código de país", "gpsareainformation": "Zona (GPS)", "locationname": "Lugar",
    "gpsprocessingmethod": "Método de posicionamiento",
}
ETIQUETAS_FECHA = {
    "datetimeoriginal": "Fecha en que se tomó", "createdate": "Fecha de creación",
    "modifydate": "Fecha de modificación", "creationdate": "Fecha de creación", "moddate": "Fecha de modificación",
    "metadatadate": "Fecha de los metadatos", "dcterms:created": "Fecha de creación",
    "dcterms:modified": "Fecha de modificación", "cp:lastprinted": "Última impresión",
    "meta:creation-date": "Fecha de creación", "dc:date": "Fecha de modificación",
    "meta:print-date": "Última impresión", "gpsdatestamp": "Fecha (GPS)", "date": "Fecha",
    "trackcreatedate": "Fecha de creación de la pista", "trackmodifydate": "Fecha de modificación de la pista",
    "mediacreatedate": "Fecha de creación del medio", "mediamodifydate": "Fecha de modificación del medio",
    "datecreated": "Fecha de creación", "digitalcreationdate": "Fecha de digitalización",
    "datetimedigitized": "Fecha de digitalización", "releasedate": "Fecha de publicación",
    "profiledatetime": "Fecha del perfil de color",
}

RUTA_USUARIO = re.compile(r"([A-Za-z]:\\(?:Users|Usuarios|Documents and Settings)\\[^\\/\"<>|]+|/Users/[^/\s\"]+|/home/[^/\s\"]+)", re.I)
CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
EXT_IMAGEN = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".webp", ".gif", ".bmp")


def _clave(nombre):
    return str(nombre).lower().replace(" ", "")


def _corto(texto, n=160):
    texto = str(texto)
    return texto if len(texto) <= n else texto[:n] + "…"


# ------------------------------------------------------------------ utilidades


def huellas(ruta):
    md5, sha1, sha256 = hashlib.md5(), hashlib.sha1(), hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            md5.update(bloque)
            sha1.update(bloque)
            sha256.update(bloque)
    return {"MD5": md5.hexdigest(), "SHA-1": sha1.hexdigest(), "SHA-256": sha256.hexdigest()}


def exiftool_json(rutas, *opciones):
    """Lee con ExifTool (valores numéricos con -n) uno o varios archivos."""
    if not motores.EXIFTOOL or not rutas:
        return []
    salida, _ = motores._ejecutar_exiftool(["-j", "-G1", "-a", *opciones, *rutas])
    try:
        return json.loads(salida)
    except ValueError:
        return []


def gps_de(datos):
    """Saca latitud/longitud/altitud decimales de una lectura de ExifTool con -n."""
    lat = datos.get("Composite:GPSLatitude")
    lon = datos.get("Composite:GPSLongitude")
    if lat is None or lon is None:
        for clave, valor in datos.items():
            if clave.endswith(":GPSCoordinates") and isinstance(valor, str):
                partes = valor.replace(",", " ").split()
                if len(partes) >= 2:
                    lat, lon = partes[0], partes[1]
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if lat == 0 and lon == 0:
        return None
    resultado = {"lat": round(lat, 7), "lon": round(lon, 7)}
    alt = datos.get("Composite:GPSAltitude")
    try:
        resultado["alt"] = round(float(alt), 1)
    except (TypeError, ValueError):
        pass
    for clave, valor in datos.items():
        if clave.endswith(":GPSImgDirection"):
            resultado["direccion"] = valor
        elif clave.endswith(":GPSHPositioningError"):
            resultado["precision"] = valor
    return resultado


def tipo_real(ruta):
    """Lo que el archivo es de verdad, mirando su contenido (no su extensión)."""
    with open(ruta, "rb") as f:
        cabecera = f.read(16)
    firmas = [
        (b"\xff\xd8\xff", "jpg", "Imagen JPEG"), (b"\x89PNG", "png", "Imagen PNG"),
        (b"%PDF", "pdf", "Documento PDF"), (b"GIF8", "gif", "Imagen GIF"),
        (b"PK\x03\x04", "zip", "Archivo comprimido (ZIP, Office, LibreOffice…)"),
        (b"\xd0\xcf\x11\xe0", "ole", "Documento de Office antiguo o cifrado"),
        (b"ID3", "mp3", "Audio MP3"), (b"fLaC", "flac", "Audio FLAC"), (b"OggS", "ogg", "Audio OGG"),
        (b"RIFF", "riff", "WAV/AVI/WebP"), (b"II*\x00", "tif", "Imagen TIFF"), (b"MM\x00*", "tif", "Imagen TIFF"),
        (b"MZ", "exe", "Programa de Windows (.exe)"),
    ]
    for firma, tipo, nombre in firmas:
        if cabecera.startswith(firma):
            return tipo, nombre
    if cabecera[4:8] == b"ftyp":
        marca = cabecera[8:12].decode("latin-1", "replace")
        if marca.startswith(("heic", "heix", "mif1")):
            return "heic", "Imagen HEIC"
        return "mp4", "Vídeo/audio MP4/MOV"
    return "", ""


COMPATIBLES = {
    "jpg": {".jpg", ".jpeg", ".jpe"}, "png": {".png"}, "pdf": {".pdf"}, "gif": {".gif"},
    "zip": {".zip", ".docx", ".docm", ".dotx", ".xlsx", ".xlsm", ".xltx", ".pptx", ".pptm", ".potx",
            ".odt", ".ods", ".odp", ".odg", ".ott", ".ots", ".otp", ".epub", ".jar", ".apk", ".kmz"},
    "ole": {".doc", ".xls", ".ppt", ".msg", ".docx", ".xlsx", ".pptx", ".docm", ".xlsm", ".pptm"},
    "mp3": {".mp3"}, "flac": {".flac"}, "ogg": {".ogg", ".oga", ".opus"},
    "riff": {".wav", ".avi", ".webp"}, "tif": {".tif", ".tiff", ".dng", ".nef", ".cr2", ".arw"},
    "exe": {".exe", ".dll"}, "heic": {".heic", ".heif"},
    "mp4": {".mp4", ".mov", ".m4v", ".m4a", ".3gp", ".3g2", ".heic", ".avif"},
}


# ------------------------------------------------------------------ análisis de documentos


def _leer_xml(z, nombre):
    try:
        return ET.fromstring(z.read(nombre))
    except (KeyError, ET.ParseError):
        return None


def _atributo(el, local):
    for clave, valor in el.attrib.items():
        if clave.split("}")[-1] == local:
            return valor
    return None


def _locales(raiz, local):
    return [el for el in raiz.iter() if el.tag.split("}")[-1] == local]


def certificado(der):
    """Datos legibles de un certificado X.509 (quién firmó, quién lo emitió y su validez)."""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
    except ImportError:
        return {}
    try:
        cert = x509.load_der_x509_certificate(der)
    except ValueError:
        return {}

    def nombre(n):
        for oid in (NameOID.COMMON_NAME, NameOID.ORGANIZATION_NAME):
            valores = n.get_attributes_for_oid(oid)
            if valores:
                return valores[0].value
        return n.rfc4514_string()

    datos = {"firmante": nombre(cert.subject), "emisor": nombre(cert.issuer)}
    correo = cert.subject.get_attributes_for_oid(NameOID.EMAIL_ADDRESS)
    if correo:
        datos["correo"] = correo[0].value
    dni = cert.subject.get_attributes_for_oid(NameOID.SERIAL_NUMBER)
    if dni:
        datos["identificador"] = dni[0].value
    inicio = getattr(cert, "not_valid_before_utc", None) or cert.not_valid_before
    fin = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after
    datos["valido"] = f"{inicio:%d/%m/%Y} – {fin:%d/%m/%Y}"
    return datos


def certificados_pkcs7(der):
    """Certificados dentro de una firma PKCS#7 (la que llevan los PDF firmados)."""
    try:
        from cryptography.hazmat.primitives.serialization import pkcs7
    except ImportError:
        return []
    # El hueco de la firma en un PDF se rellena con ceros: se recorta a la longitud real.
    if len(der) > 4 and der[0] == 0x30:
        if der[1] & 0x80:
            n = der[1] & 0x7F
            der = der[: 2 + n + int.from_bytes(der[2:2 + n], "big")]
        else:
            der = der[: 2 + der[1]]
    try:
        from cryptography.hazmat.primitives import serialization

        return [certificado(c.public_bytes(serialization.Encoding.DER))
                for c in pkcs7.load_der_pkcs7_certificates(der)]
    except Exception:  # noqa: BLE001 - firmas con formatos raros: se informa sin detalles
        return []


def analizar_ooxml(ruta, informe):
    """Word, Excel y PowerPoint por dentro."""
    with zipfile.ZipFile(ruta) as z:
        nombres = z.namelist()
        doc = informe["documento"]

        # Comentarios y quién los escribió
        autores = []
        for nombre in nombres:
            if re.match(r"(word/comments\.xml|xl/comments\d*\.xml|ppt/comments/.*\.xml)$", nombre):
                raiz = _leer_xml(z, nombre)
                if raiz is None:
                    continue
                for el in _locales(raiz, "comment") + _locales(raiz, "cm"):
                    autor = _atributo(el, "author")
                    if autor:
                        autores.append(autor)
                autores += [a.text for a in _locales(raiz, "author") if a.text]
        for nombre in ("ppt/commentAuthors.xml", "xl/persons/person.xml"):
            raiz = _leer_xml(z, nombre)
            if raiz is not None:
                autores += [v for el in raiz.iter() for v in [_atributo(el, "name") or _atributo(el, "displayName")] if v]
        if autores:
            doc["comentarios"] = len(autores)
            informe["personas_extra"]["Autores de comentarios"] = sorted(set(autores))

        # Control de cambios (revisiones) de Word
        raiz = _leer_xml(z, "word/document.xml")
        if raiz is not None:
            revisores = [_atributo(el, "author") for nombre in ("ins", "del", "moveFrom", "moveTo")
                         for el in _locales(raiz, nombre)]
            revisores = [r for r in revisores if r]
            if revisores:
                doc["revisiones"] = len(revisores)
                informe["personas_extra"]["Autores de cambios (control de cambios)"] = sorted(set(revisores))
            ocultos = len(_locales(raiz, "vanish"))
            if ocultos:
                doc["texto_oculto"] = ocultos

        # Protección (restricciones de edición)
        protecciones = []
        raiz = _leer_xml(z, "word/settings.xml")
        if raiz is not None:
            for el in _locales(raiz, "documentProtection"):
                if _atributo(el, "enforcement") in ("1", "true", "on"):
                    protecciones.append(f"Edición restringida ({_atributo(el, 'edit') or 'protegido'})")
            if _locales(raiz, "writeProtection"):
                protecciones.append("Abrir como solo lectura")
            for el in _locales(raiz, "attachedTemplate"):
                rid = _atributo(el, "id")
                rels = _leer_xml(z, "word/_rels/settings.xml.rels")
                if rels is not None and rid:
                    for rel in rels:
                        if rel.get("Id") == rid:
                            doc["plantilla"] = rel.get("Target")
        raiz = _leer_xml(z, "xl/workbook.xml")
        if raiz is not None:
            for el in _locales(raiz, "workbookProtection"):
                # openpyxl y otros dejan la etiqueta vacía: solo cuenta si de verdad bloquea algo.
                if any(_atributo(el, a) in ("1", "true") for a in ("lockStructure", "lockWindows", "lockRevision")):
                    protecciones.append("Estructura del libro protegida")
                    break
            if _locales(raiz, "fileSharing"):
                protecciones.append("Contraseña de escritura")
            ocultas = [f"{_atributo(h, 'name')} ({'muy oculta' if _atributo(h, 'state') == 'veryHidden' else 'oculta'})"
                       for h in _locales(raiz, "sheet") if _atributo(h, "state") in ("hidden", "veryHidden")]
            if ocultas:
                doc["hojas_ocultas"] = ocultas
            doc["hojas"] = [_atributo(h, "name") for h in _locales(raiz, "sheet")]
        hojas_protegidas = 0
        for nombre in nombres:
            if nombre.startswith("xl/worksheets/sheet") and nombre.endswith(".xml"):
                if b"<sheetProtection" in z.read(nombre):
                    hojas_protegidas += 1
        if hojas_protegidas:
            protecciones.append(f"{hojas_protegidas} hoja(s) protegida(s)")
        raiz = _leer_xml(z, "ppt/presentation.xml")
        if raiz is not None and _locales(raiz, "modifyVerifier"):
            protecciones.append("Contraseña de modificación")
        if protecciones:
            informe["proteccion"]["restricciones"] = protecciones

        # Enlaces externos, objetos incrustados, macros, firmas
        enlaces = []
        for nombre in nombres:
            if nombre.endswith(".rels"):
                rels = _leer_xml(z, nombre)
                if rels is None:
                    continue
                for rel in rels:
                    if rel.get("TargetMode") == "External":
                        enlaces.append(rel.get("Target"))
        if enlaces:
            doc["enlaces"] = sorted(set(enlaces))
        incrustados = [n.split("/")[-1] for n in nombres if "/embeddings/" in n]
        if incrustados:
            doc["incrustados"] = incrustados
        if any(n.endswith("vbaProject.bin") for n in nombres):
            doc["macros"] = True
        if any("externalLinks/" in n for n in nombres):
            doc["vinculos_externos"] = True
        if any("printerSettings" in n for n in nombres):
            doc["impresora"] = True

        for nombre in nombres:
            if nombre.startswith("_xmlsignatures/") and nombre.endswith(".xml") and "origin" not in nombre:
                raiz = _leer_xml(z, nombre)
                firma = {"tipo": "Firma digital de Office"}
                if raiz is not None:
                    for el in _locales(raiz, "X509Certificate"):
                        try:
                            firma.update(certificado(base64.b64decode(el.text or "")))
                        except ValueError:
                            pass
                        break
                    for el in _locales(raiz, "SignatureTime") + _locales(raiz, "Value"):
                        if el.text and fechas.parsear(el.text.strip()):
                            firma["fecha"] = fechas.parsear(el.text.strip()).legible()
                            break
                informe["firmas"].append(firma)

        informe["_imagenes"] = [n for n in nombres if "/media/" in n and n.lower().endswith(EXT_IMAGEN)]


def analizar_odf(ruta, informe):
    """LibreOffice por dentro."""
    with zipfile.ZipFile(ruta) as z:
        nombres = z.namelist()
        doc = informe["documento"]
        raiz = _leer_xml(z, "content.xml")
        if raiz is not None:
            autores = [c.text for a in _locales(raiz, "annotation") for c in _locales(a, "creator") if c.text]
            if autores:
                doc["comentarios"] = len(autores)
                informe["personas_extra"]["Autores de comentarios"] = sorted(set(autores))
            revisores = [c.text for r in _locales(raiz, "changed-region") for c in _locales(r, "creator") if c.text]
            if revisores:
                doc["revisiones"] = len(revisores)
                informe["personas_extra"]["Autores de cambios (control de cambios)"] = sorted(set(revisores))
            if any(_atributo(el, "protected") == "true" for el in raiz.iter()):
                informe["proteccion"]["restricciones"] = ["Partes del documento protegidas"]
        ajustes = _leer_xml(z, "settings.xml")
        if ajustes is not None:
            for el in _locales(ajustes, "config-item"):
                if _atributo(el, "name") == "PrinterName" and el.text:
                    doc["impresora"] = el.text
                if _atributo(el, "name") == "LoadReadonly" and el.text == "true":
                    informe["proteccion"].setdefault("restricciones", []).append("Abrir como solo lectura")
        manifiesto = _leer_xml(z, "META-INF/manifest.xml")
        if manifiesto is not None and _locales(manifiesto, "encryption-data"):
            informe["proteccion"]["cifrado"] = "Cifrado con contraseña"
        for nombre in ("META-INF/documentsignatures.xml", "META-INF/macrosignatures.xml"):
            raiz = _leer_xml(z, nombre)
            if raiz is None:
                continue
            for firma_xml in _locales(raiz, "Signature"):
                firma = {"tipo": "Firma digital de LibreOffice"}
                for el in _locales(firma_xml, "X509Certificate"):
                    try:
                        firma.update(certificado(base64.b64decode(el.text or "")))
                    except ValueError:
                        pass
                    break
                informe["firmas"].append(firma)
        if any(n.startswith("Basic/") for n in nombres):
            doc["macros"] = True
        informe["_imagenes"] = [n for n in nombres if n.startswith("Pictures/") and n.lower().endswith(EXT_IMAGEN)]


def analizar_pdf(ruta, informe, carpeta):
    import pikepdf

    doc = informe["documento"]
    try:
        pdf = pikepdf.open(ruta)
    except pikepdf.PasswordError:
        informe["proteccion"]["cifrado"] = "Necesita contraseña para abrirse"
        return
    with pdf:
        doc["paginas"] = len(pdf.pages)
        doc["version_pdf"] = pdf.pdf_version
        if pdf.pages:
            caja = [float(x) for x in pdf.pages[0].mediabox]
            ancho, alto = (caja[2] - caja[0]) * 25.4 / 72, (caja[3] - caja[1]) * 25.4 / 72
            doc["tamano_pagina"] = f"{ancho:.0f} × {alto:.0f} mm" + (" (A4)" if abs(ancho - 210) < 3 and abs(alto - 297) < 3 else "")
        if pdf.is_encrypted:
            permisos = pdf.allow
            prohibido = [nombre for clave, nombre in (
                ("print_highres", "imprimir"), ("extract", "copiar texto"), ("modify_other", "modificar"),
                ("modify_annotation", "comentar"), ("modify_form", "rellenar formularios"),
                ("modify_assembly", "reorganizar páginas")) if not getattr(permisos, clave, True)]
            informe["proteccion"]["cifrado"] = "Cifrado"
            if prohibido:
                informe["proteccion"]["restricciones"] = ["No deja " + ", ".join(prohibido)]

        raiz = pdf.Root
        nombres = raiz.get("/Names")
        if nombres is not None and "/EmbeddedFiles" in nombres:
            adjuntos = []
            arbol = nombres.EmbeddedFiles
            pila = [arbol]
            while pila:
                nodo = pila.pop()
                if "/Names" in nodo:
                    lista = list(nodo.Names)
                    adjuntos += [str(lista[i]) for i in range(0, len(lista), 2)]
                if "/Kids" in nodo:
                    pila.extend(nodo.Kids)
            if adjuntos:
                doc["adjuntos"] = adjuntos
        if (nombres is not None and "/JavaScript" in nombres) or ("/OpenAction" in raiz and "/JS" in str(raiz.OpenAction)[:2000]):
            doc["javascript"] = True

        formulario = raiz.get("/AcroForm")
        campos = []
        if formulario is not None and "/Fields" in formulario:
            pila = list(formulario.Fields)
            while pila:
                campo = pila.pop()
                campos.append(campo)
                if "/Kids" in campo:
                    pila.extend(campo.Kids)
        firmas = [c for c in campos if c.get("/FT") == "/Sig" and "/V" in c]
        if campos:
            doc["campos_formulario"] = len(campos) - len(firmas)
        for campo in firmas:
            v = campo.V
            firma = {"tipo": "Firma digital de PDF"}
            for clave, nombre in (("/Name", "nombre"), ("/Reason", "motivo"), ("/Location", "lugar"),
                                  ("/ContactInfo", "contacto")):
                if clave in v:
                    firma[nombre] = str(v[clave])
            if "/M" in v and fechas.parsear(str(v.M)):
                firma["fecha"] = fechas.parsear(str(v.M)).legible()
            if "/Contents" in v:
                certificados = certificados_pkcs7(bytes(v.Contents))
                if certificados:
                    firma.update(certificados[0])
            informe["firmas"].append(firma)
        if "/Perms" in raiz:
            doc["certificado_documento"] = True

        autores, enlaces, fuentes, n_imagenes = [], [], set(), 0
        for i, pagina in enumerate(pdf.pages):
            for anotacion in pagina.get("/Annots", []) or []:
                try:
                    if anotacion.get("/Subtype") in ("/Text", "/FreeText", "/Highlight", "/Ink", "/Square",
                                                     "/Circle", "/Underline", "/StrikeOut", "/Stamp") and "/T" in anotacion:
                        autores.append(str(anotacion.T))
                    accion = anotacion.get("/A")
                    if accion is not None and "/URI" in accion:
                        enlaces.append(str(accion.URI))
                except Exception:  # noqa: BLE001 - anotaciones mal formadas
                    pass
            if i < 50:
                recursos = pagina.get("/Resources", {})
                for fuente in (recursos.get("/Font", {}) or {}).values():
                    try:
                        fuentes.add(str(fuente.get("/BaseFont", "")).lstrip("/").split("+")[-1])
                    except Exception:  # noqa: BLE001
                        pass
                for nombre, imagen in (recursos.get("/XObject", {}) or {}).items():
                    try:
                        if imagen.get("/Subtype") == "/Image":
                            n_imagenes += 1
                            if imagen.get("/Filter") == "/DCTDecode" and n_imagenes <= 40:
                                destino = os.path.join(carpeta, f"p{n_imagenes:03d}_página {i + 1} ({str(nombre).lstrip('/')}).jpg")
                                with open(destino, "wb") as f:
                                    f.write(imagen.read_raw_bytes())
                                informe["_imagenes_sueltas"].append(destino)
                    except Exception:  # noqa: BLE001
                        pass
        if autores:
            doc["comentarios"] = len(autores)
            informe["personas_extra"]["Autores de comentarios"] = sorted(set(autores))
        if enlaces:
            doc["enlaces"] = sorted(set(enlaces))
        if fuentes - {""}:
            doc["fuentes"] = sorted(fuentes - {""})
        if n_imagenes:
            doc["imagenes"] = n_imagenes


def analizar_imagenes(ruta, informe, carpeta):
    """Lee las fotos que hay dentro de un documento: pueden llevar su propio GPS y cámara."""
    rutas = list(informe.pop("_imagenes_sueltas", []))
    internas = informe.pop("_imagenes", [])
    if internas:
        with zipfile.ZipFile(ruta) as z:
            for i, nombre in enumerate(internas[:60]):
                destino = os.path.join(carpeta, f"{i:03d}_{os.path.basename(nombre)}")
                with open(destino, "wb") as f:
                    f.write(z.read(nombre))
                rutas.append(destino)
    if not rutas:
        return
    if not motores.EXIFTOOL:
        informe["imagenes_internas"] = [{"nombre": os.path.basename(r).split("_", 1)[-1]} for r in rutas]
        return
    resultado = []
    for datos in exiftool_json(rutas, "-n"):
        nombre = os.path.basename(datos.get("SourceFile", "")).split("_", 1)[-1]
        imagen = {"nombre": nombre}
        gps = gps_de(datos)
        if gps:
            imagen["gps"] = gps
        camara = " ".join(str(datos[k]) for k in ("IFD0:Make", "IFD0:Model") if datos.get(k))
        if camara:
            imagen["camara"] = camara
        for k in ("ExifIFD:DateTimeOriginal", "ExifIFD:CreateDate", "IFD0:ModifyDate"):
            f = fechas.parsear(datos.get(k))
            if f:
                imagen["fecha"] = f.legible()
                break
        programa = datos.get("IFD0:Software") or datos.get("XMP-xmp:CreatorTool")
        if programa:
            imagen["programa"] = str(programa)
        resultado.append(imagen)
    informe["imagenes_internas"] = resultado


# ------------------------------------------------------------------ informe


def generar(registro, metadatos):
    """Devuelve el informe completo (diccionario listo para JSON)."""
    ruta, motor = registro["ruta"], registro["motor"]
    informe = {
        "avisos": [], "ubicacion": None, "fechas": [], "secciones": [], "firmas": [],
        "proteccion": {}, "documento": {}, "personas_extra": {}, "imagenes_internas": [],
        "_imagenes": [], "_imagenes_sueltas": [],
    }
    carpeta = tempfile.mkdtemp(dir=registro["carpeta"])
    try:
        if motor is not None:
            nombre_motor = motor.nombre
            try:
                if nombre_motor == "Office":
                    analizar_ooxml(ruta, informe)
                elif nombre_motor == "OpenDocument":
                    analizar_odf(ruta, informe)
                elif nombre_motor == "PDF":
                    analizar_pdf(ruta, informe, carpeta)
            except (zipfile.BadZipFile, OSError) as e:
                informe["proteccion"].setdefault("cifrado", f"No se puede leer por dentro ({e.__class__.__name__})")
            analizar_imagenes(ruta, informe, carpeta)
            if nombre_motor == "ExifTool":
                lectura = exiftool_json([ruta], "-n")
                if lectura:
                    informe["ubicacion"] = gps_de(lectura[0])
                    if informe["ubicacion"]:
                        informe["ubicacion"]["fuente"] = "Este archivo"
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)

    if not informe["ubicacion"]:
        for imagen in informe["imagenes_internas"]:
            if imagen.get("gps"):
                informe["ubicacion"] = dict(imagen["gps"], fuente=f"Imagen dentro del documento: {imagen['nombre']}")
                break

    # «Autor» es el nombre neutro que deja la limpieza: no cuenta como persona.
    informe["personas_extra"] = {k: [n for n in v if n != "Autor"] for k, v in informe["personas_extra"].items()}
    informe["personas_extra"] = {k: v for k, v in informe["personas_extra"].items() if v}
    _clasificar_metadatos(registro, metadatos, informe)
    _redactar_avisos(registro, informe)
    for clave in ("_imagenes", "_imagenes_sueltas"):
        informe.pop(clave, None)
    return informe


def _clasificar_metadatos(registro, metadatos, informe):
    personas, dispositivo, programas, ajustes, contenido, lugar = {}, {}, {}, {}, {}, {}
    vistos_fecha = set()
    for d in metadatos:
        valor = str(d["valor"]).strip()
        if not valor or d["grupo"] in ("System", "ExifTool") or valor == "(datos binarios)":
            continue
        clave = _clave(d["nombre"].split(":")[-1] if d["nombre"].startswith(("core:", "app:")) else d["nombre"])
        clave_completa = _clave(d["nombre"])
        # «Creator» en la ficha de un PDF es el programa, no la persona.
        if d["grupo"] == "Info" and clave == "creator":
            programas.setdefault("Programa de origen", valor)
            continue
        f = fechas.parsear(valor)
        if f and (re.search(r"date|time|fecha|created|modified|printed", clave_completa) or clave_completa in ETIQUETAS_FECHA):
            if d["grupo"] in ("Composite",) or (f.estilo == "anio" and clave_completa not in ("date", "year")):
                continue
            firma = (f.legible(), clave_completa)
            if firma in vistos_fecha:
                continue
            vistos_fecha.add(firma)
            informe["fechas"].append({
                "etiqueta": ETIQUETAS_FECHA.get(clave_completa, ETIQUETAS_FECHA.get(clave, d["nombre"])),
                "origen": f"{d['grupo']} · {d['nombre']}", "valor": f.legible(),
                "orden": f.momento.isoformat(), "clave": d["clave"], "editable": d["editable"],
            })
            continue
        for tabla, destino in ((PERSONAS, personas), (DISPOSITIVO, dispositivo), (PROGRAMAS, programas),
                               (AJUSTES, ajustes), (CONTENIDO, contenido), (LUGAR, lugar)):
            etiqueta = tabla.get(clave_completa) or tabla.get(clave)
            if etiqueta:
                destino.setdefault(etiqueta, valor)
                break

    for etiqueta, lista in informe["personas_extra"].items():
        personas[etiqueta] = ", ".join(lista)
    for firma in informe["firmas"]:
        if firma.get("firmante"):
            personas.setdefault("Firmado por", firma["firmante"])

    # Fechas del archivo en tu ordenador (solo si se conocen)
    for etiqueta, valor in (registro.get("fechas_sistema") or {}).items():
        informe["fechas"].append({"etiqueta": etiqueta, "origen": "Tu ordenador", "valor": valor["legible"],
                                  "orden": valor["orden"], "clave": None, "editable": False})
    informe["fechas"].sort(key=lambda x: x["orden"])

    if informe["ubicacion"]:
        u = informe["ubicacion"]
        u["texto"] = f"{u['lat']:.6f}, {u['lon']:.6f}"
        u["google"] = f"https://www.google.com/maps?q={u['lat']},{u['lon']}"
        u["osm"] = f"https://www.openstreetmap.org/?mlat={u['lat']}&mlon={u['lon']}#map=17/{u['lat']}/{u['lon']}"
    if lugar:
        informe["lugar"] = lugar

    secciones = [
        ("Personas", "persona", personas), ("Dispositivo", "dispositivo", dispositivo),
        ("Programas usados", "programa", programas), ("Lugar escrito en el archivo", "lugar", lugar),
        ("Ajustes de la foto", "camara", ajustes), ("Contenido", "contenido", contenido),
    ]
    informe["secciones"] = [{"titulo": t, "icono": i, "filas": [[k, _corto(v, 300)] for k, v in filas.items()]}
                            for t, i, filas in secciones if filas]

    doc = informe["documento"]
    filas_doc = []
    etiquetas_doc = [
        ("paginas", "Páginas"), ("tamano_pagina", "Tamaño de página"), ("version_pdf", "Versión PDF"),
        ("hojas", "Hojas"), ("hojas_ocultas", "Hojas ocultas"), ("comentarios", "Comentarios"),
        ("revisiones", "Cambios registrados (control de cambios)"), ("texto_oculto", "Fragmentos de texto oculto"),
        ("plantilla", "Plantilla (ruta original)"), ("impresora", "Impresora"), ("campos_formulario", "Campos de formulario"),
        ("imagenes", "Imágenes"), ("fuentes", "Fuentes"), ("adjuntos", "Archivos adjuntos"),
        ("incrustados", "Objetos incrustados"), ("enlaces", "Enlaces"),
    ]
    for clave, etiqueta in etiquetas_doc:
        if clave in doc and doc[clave] not in (None, "", [], 0):
            valor = doc[clave]
            if isinstance(valor, list):
                valor = ", ".join(map(str, valor[:30])) + (f" … (+{len(valor) - 30})" if len(valor) > 30 else "")
            elif valor is True:
                valor = "Sí"
            filas_doc.append([etiqueta, _corto(valor, 400)])
    for clave, etiqueta in (("macros", "Contiene macros"), ("javascript", "Contiene código JavaScript"),
                            ("vinculos_externos", "Vincula datos de otros archivos"),
                            ("certificado_documento", "Documento certificado")):
        if doc.get(clave):
            filas_doc.append([etiqueta, "Sí"])
    if filas_doc:
        informe["secciones"].append({"titulo": "Documento por dentro", "icono": "documento", "filas": filas_doc})

    # Archivo
    ruta = registro["ruta"]
    tipo, descripcion = tipo_real(ruta)
    ext = registro["ext"]
    filas = [["Nombre", registro["nombre"]], ["Tamaño", f"{os.path.getsize(ruta):,} bytes".replace(",", ".")]]
    if descripcion:
        filas.append(["Tipo real", descripcion])
        if tipo in COMPATIBLES and ext not in COMPATIBLES[tipo]:
            informe["extension_no_coincide"] = descripcion
            filas.append(["⚠️ Aviso", f"La extensión «{ext}» no corresponde a lo que el archivo es en realidad"])
    for nombre, valor in huellas(ruta).items():
        filas.append([f"Huella {nombre}", valor])
    for etiqueta, valor in registro.get("procedencia") or []:
        filas.append([etiqueta, valor])
    informe["secciones"].append({"titulo": "Archivo", "icono": "archivo", "filas": filas})


def _redactar_avisos(registro, informe):
    avisos = informe["avisos"]
    u = informe["ubicacion"]
    if u:
        donde = "una imagen que hay dentro" if u["fuente"].startswith("Imagen") else "dónde se hizo"
        avisos.append(("ubicacion", f"Revela {donde}: coordenadas {u['texto']}"))
    secciones = {s["titulo"]: dict(s["filas"]) for s in informe["secciones"]}
    disp = secciones.get("Dispositivo", {})
    if disp:
        texto = " ".join(v for k, v in disp.items() if k in ("Marca", "Modelo", "Modelo de cámara")) or next(iter(disp.values()))
        serie = next((v for k, v in disp.items() if "serie" in k.lower()), None)
        avisos.append(("dispositivo", f"Revela el dispositivo: {texto}" + (f" (nº de serie {serie})" if serie else "")))
    personas = secciones.get("Personas", {})
    nombres = []
    for k, v in personas.items():
        for n in re.split(r",\s*", v):
            if n and n not in nombres and not n.lower().startswith(("copyright", "©")):
                nombres.append(n)
    if nombres:
        avisos.append(("persona", "Aparecen nombres: " + ", ".join(nombres[:8]) + ("…" if len(nombres) > 8 else "")))
    creacion = next((f for f in informe["fechas"] if f["origen"] != "Tu ordenador"), None)
    if creacion:
        avisos.append(("fecha", f"Revela cuándo se creó: {creacion['valor']}"))
    programas = secciones.get("Programas usados", {})
    if programas:
        avisos.append(("programa", "Revela los programas usados: " + ", ".join(list(dict.fromkeys(programas.values()))[:4])))
    doc = informe["documento"]
    extra = informe["personas_extra"]
    if doc.get("comentarios") and "Autores de comentarios" in extra:
        avisos.append(("comentario", f"Tiene {doc['comentarios']} comentario(s) con el nombre de quien los escribió"))
    if doc.get("revisiones") and "Autores de cambios (control de cambios)" in extra:
        avisos.append(("comentario", f"Guarda {doc['revisiones']} cambio(s) del control de cambios con nombres"))
    if doc.get("hojas_ocultas"):
        avisos.append(("documento", "Tiene hojas ocultas: " + ", ".join(doc["hojas_ocultas"])))
    if doc.get("texto_oculto"):
        avisos.append(("documento", "Contiene texto oculto"))
    if doc.get("javascript"):
        avisos.append(("peligro", "Contiene código JavaScript (puede ejecutar acciones al abrirlo)"))
    if doc.get("macros"):
        avisos.append(("peligro", "Contiene macros (programas dentro del documento)"))
    if doc.get("adjuntos"):
        avisos.append(("documento", "Lleva archivos adjuntos: " + ", ".join(doc["adjuntos"][:5])))
    if informe["firmas"]:
        quien = ", ".join(f.get("firmante") or f.get("nombre") or "desconocido" for f in informe["firmas"])
        avisos.append(("firma", f"Está firmado digitalmente por: {quien}"))
    p = informe["proteccion"]
    if p:
        avisos.append(("candado", "Está protegido: " + "; ".join(([p["cifrado"]] if p.get("cifrado") else []) + p.get("restricciones", []))))
    con_gps = [i for i in informe["imagenes_internas"] if i.get("gps")]
    if informe["imagenes_internas"]:
        texto = f"Contiene {len(informe['imagenes_internas'])} imagen(es) dentro"
        if con_gps:
            texto += f"; {len(con_gps)} con ubicación GPS"
        avisos.append(("imagen", texto))
    todos = " ".join(str(v) for s in informe["secciones"] for _, v in s["filas"]) + " " + str(doc.get("plantilla", ""))
    rutas = sorted(set(RUTA_USUARIO.findall(todos)))
    if rutas:
        avisos.append(("carpeta", "Revela rutas de un ordenador (y su nombre de usuario): " + ", ".join(rutas[:3])))
    correos = sorted(set(CORREO.findall(todos)))
    if correos:
        avisos.append(("correo", "Contiene correos electrónicos: " + ", ".join(correos[:5])))
    for etiqueta, valor in registro.get("procedencia") or []:
        if etiqueta.startswith("Descargado de"):
            avisos.append(("internet", f"Se descargó de internet: {valor}"))
            break
    if informe.get("extension_no_coincide"):
        avisos.append(("peligro", f"La extensión no coincide: en realidad es {informe['extension_no_coincide']}"))
    informe["avisos"] = [{"tipo": t, "texto": x} for t, x in avisos]
