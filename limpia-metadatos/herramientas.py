"""Herramientas que van más allá de editar un dato suelto.

- Cambiar o desplazar todas las fechas de golpe.
- Poner, cambiar o quitar la ubicación GPS.
- Desbloquear documentos (restricciones de edición y contraseñas).
- Quitar firmas digitales.
- Limpiar las fotos que hay dentro de documentos.
"""

import io
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timedelta

import fechas
import motores
from motores import ErrorMetadatos

# ------------------------------------------------------------------ fechas


def cambios_de_fechas(metadatos, modo, nueva=None, desplazamiento=None):
    """Calcula los cambios para todas las fechas editables con datos personales.

    modo «fijar»: todas pasan a ser `nueva` (datetime).
    modo «desplazar»: a todas se les suma `desplazamiento` (timedelta).
    Cada fecha conserva su formato y su zona horaria.
    """
    cambios = {}
    for d in metadatos:
        if not d.get("editable") or d.get("seccion") != "personal":
            continue
        if not re.search(r"date|time|fecha|created|modified|printed", d["nombre"], re.I):
            continue
        f = fechas.parsear(d["valor"])
        if not f:
            continue
        momento = nueva if modo == "fijar" else f.momento + desplazamiento
        texto = f.texto(momento)
        if texto != d["valor"]:
            cambios[d["clave"]] = texto
    return cambios


def leer_fecha_usuario(texto):
    """'2024-05-01T12:30' (lo que manda el formulario) -> datetime."""
    try:
        return datetime.fromisoformat(texto)
    except (TypeError, ValueError):
        raise ErrorMetadatos("Elige una fecha y hora válidas.")


def leer_desplazamiento(datos):
    try:
        delta = timedelta(days=float(datos.get("dias") or 0), hours=float(datos.get("horas") or 0),
                          minutes=float(datos.get("minutos") or 0))
        anios = int(datos.get("anios") or 0)
    except (TypeError, ValueError):
        raise ErrorMetadatos("Escribe números en días, horas y minutos.")
    delta += timedelta(days=365.2425 * anios)
    if datos.get("signo") == "-":
        delta = -delta
    if not delta:
        raise ErrorMetadatos("Indica cuánto quieres mover las fechas.")
    return delta


# ------------------------------------------------------------------ ubicación


def leer_coordenadas(datos):
    """Acepta latitud y longitud por separado o pegadas juntas ('40.4168, -3.7038')."""
    texto = str(datos.get("pegado") or "").strip()
    if texto:
        numeros = re.findall(r"-?\d+(?:[.,]\d+)?", texto.replace(", ", " ").replace(",", "."))
        if len(numeros) < 2:
            raise ErrorMetadatos("No reconozco las coordenadas. Pega algo como: 40.4168, -3.7038")
        lat, lon = numeros[0], numeros[1]
    else:
        lat, lon = datos.get("lat"), datos.get("lon")
    try:
        lat, lon = float(str(lat).replace(",", ".")), float(str(lon).replace(",", "."))
    except (TypeError, ValueError):
        raise ErrorMetadatos("Escribe la latitud y la longitud (por ejemplo 40.4168 y -3.7038).")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ErrorMetadatos("Esas coordenadas no existen (latitud entre -90 y 90, longitud entre -180 y 180).")
    alt = datos.get("alt")
    try:
        alt = float(str(alt).replace(",", ".")) if alt not in (None, "") else None
    except ValueError:
        raise ErrorMetadatos("La altitud debe ser un número (en metros).")
    return lat, lon, alt


def poner_ubicacion(ruta, lat, lon, alt=None):
    if not motores.EXIFTOOL:
        raise ErrorMetadatos("Para cambiar la ubicación hace falta ExifTool.")
    argumentos = [
        f"-GPSLatitude={abs(lat)}", f"-GPSLatitudeRef={'N' if lat >= 0 else 'S'}",
        f"-GPSLongitude={abs(lon)}", f"-GPSLongitudeRef={'E' if lon >= 0 else 'W'}",
    ]
    if alt is not None:
        argumentos += [f"-GPSAltitude={abs(alt)}", f"-GPSAltitudeRef={0 if alt >= 0 else 1}"]
    if os.path.splitext(ruta)[1].lower() in motores.EXTENSIONES_QUICKTIME:
        coordenadas = f"{lat}, {lon}" + (f", {alt}" if alt is not None else "")
        argumentos = [f"-GPSCoordinates={coordenadas}"]
    motores.MotorExifTool()._escribir(ruta, argumentos)


def quitar_ubicacion(ruta):
    # «Location» agrupa en ExifTool todo lo que dice dónde: GPS, ciudad, país…
    motores.MotorExifTool()._escribir(ruta, ["-location:all="])


# ------------------------------------------------------------------ zips (Office / LibreOffice)


def reescribir_zip(ruta, reemplazos=None, quitar=()):
    reemplazos = reemplazos or {}
    temporal = ruta + ".tmp"
    with zipfile.ZipFile(ruta) as origen, zipfile.ZipFile(temporal, "w") as destino:
        for info in origen.infolist():
            if info.filename in quitar:
                continue
            contenido = reemplazos.get(info.filename)
            destino.writestr(info, origen.read(info.filename) if contenido is None else contenido)
    os.replace(temporal, ruta)


def _sub(patron, texto, contador):
    nuevo, n = re.subn(patron, b"", texto, flags=re.S)
    contador[0] += n
    return nuevo


# ------------------------------------------------------------------ desbloquear


def es_ole(ruta):
    with open(ruta, "rb") as f:
        return f.read(8) == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def desbloquear(ruta, motor_nombre, contrasena=""):
    """Quita contraseñas y restricciones. Devuelve una frase con lo que se ha hecho."""
    ext = os.path.splitext(ruta)[1].lower()
    if ext == ".pdf":
        import pikepdf

        try:
            pdf = pikepdf.open(ruta, password=contrasena or "")
        except pikepdf.PasswordError:
            raise ErrorMetadatos("CONTRASEÑA: Este PDF pide contraseña para abrirse. Escríbela para desbloquearlo."
                                 if not contrasena else "CONTRASEÑA: La contraseña no es correcta.")
        if not pdf.is_encrypted:
            pdf.close()
            return "Este PDF no tenía ninguna protección."
        temporal = ruta + ".tmp"
        pdf.save(temporal)  # sin cifrado: se quitan contraseña y restricciones
        pdf.close()
        os.replace(temporal, ruta)
        return "PDF desbloqueado: ya no tiene contraseña ni restricciones (imprimir, copiar, editar…)."

    if motor_nombre == "Office" and es_ole(ruta):
        import msoffcrypto

        with open(ruta, "rb") as f:
            oficina = msoffcrypto.OfficeFile(f)
            if not oficina.is_encrypted():
                raise ErrorMetadatos("Este archivo es de un formato antiguo de Office que no se puede desbloquear aquí.")
            if not contrasena:
                raise ErrorMetadatos("CONTRASEÑA: Este documento pide contraseña para abrirse. Escríbela para desbloquearlo.")
            salida = io.BytesIO()
            try:
                oficina.load_key(password=contrasena)
                oficina.decrypt(salida)
            except Exception:  # noqa: BLE001 - msoffcrypto usa varias excepciones para lo mismo
                raise ErrorMetadatos("CONTRASEÑA: La contraseña no es correcta.")
        with open(ruta, "wb") as f:
            f.write(salida.getvalue())
        quitadas = desbloquear_ooxml(ruta)
        return "Documento desbloqueado: ya no pide contraseña" + (" y se quitaron sus restricciones." if quitadas else ".")

    if motor_nombre == "Office":
        if desbloquear_ooxml(ruta):
            return "Restricciones quitadas: ya se puede editar libremente."
        return "Este documento no tenía restricciones."

    if motor_nombre == "OpenDocument":
        with zipfile.ZipFile(ruta) as z:
            if "META-INF/manifest.xml" in z.namelist() and b"encryption-data" in z.read("META-INF/manifest.xml"):
                raise ErrorMetadatos("Este documento de LibreOffice está cifrado con contraseña; ábrelo en LibreOffice "
                                     "y guárdalo sin contraseña.")
            contador = [0]
            reemplazos = {}
            for nombre in ("content.xml", "settings.xml", "styles.xml"):
                if nombre not in z.namelist():
                    continue
                datos = z.read(nombre)
                nuevo = _sub(rb'\s(?:table|text|style):protected="true"', datos, contador)
                nuevo = _sub(rb'\stable:protection-key(?:-digest-algorithm)?="[^"]*"', nuevo, contador)
                nuevo, n = re.subn(rb'(config:name="LoadReadonly"[^>]*>)true', rb"\1false", nuevo)
                contador[0] += n
                if nuevo != datos:
                    reemplazos[nombre] = nuevo
        if reemplazos:
            reescribir_zip(ruta, reemplazos)
            return "Protecciones quitadas: ya se puede editar libremente."
        return "Este documento no tenía protecciones."

    raise ErrorMetadatos("Este tipo de archivo no tiene protecciones que quitar.")


def desbloquear_ooxml(ruta):
    """Quita las restricciones de edición de Word, Excel y PowerPoint. Devuelve cuántas quitó."""
    contador = [0]
    reemplazos = {}
    patrones = {
        "word/settings.xml": [rb"<w:documentProtection\b[^>]*/>", rb"<w:writeProtection\b[^>]*/>"],
        "xl/workbook.xml": [rb"<workbookProtection\b[^>]*/>", rb"<fileSharing\b[^>]*/>"],
        "ppt/presentation.xml": [rb"<p:modifyVerifier\b[^>]*/>"],
    }
    with zipfile.ZipFile(ruta) as z:
        for nombre in z.namelist():
            lista = patrones.get(nombre)
            if nombre.startswith("xl/worksheets/sheet") and nombre.endswith(".xml"):
                lista = [rb"<sheetProtection\b[^>]*/>"]
            if not lista:
                continue
            datos = nuevo = z.read(nombre)
            for patron in lista:
                nuevo = _sub(patron, nuevo, contador)
            if nuevo != datos:
                reemplazos[nombre] = nuevo
    if reemplazos:
        reescribir_zip(ruta, reemplazos)
    return contador[0]


# ------------------------------------------------------------------ firmas


def quitar_firmas(ruta, motor_nombre):
    """Quita las firmas digitales. Devuelve cuántas quitó."""
    if motor_nombre == "PDF":
        return _quitar_firmas_pdf(ruta)
    if motor_nombre == "Office":
        with zipfile.ZipFile(ruta) as z:
            nombres = z.namelist()
            firmas = [n for n in nombres if n.startswith("_xmlsignatures/")]
            if not firmas:
                return 0
            tipos = re.sub(rb'<Override PartName="/_xmlsignatures/[^"]*"[^>]*/>', b"", z.read("[Content_Types].xml"))
            tipos = re.sub(rb'<Default Extension="sigs"[^>]*/>', b"", tipos)
            rels = re.sub(rb'<Relationship\b[^>]*digital-signature/origin"[^>]*/>', b"", z.read("_rels/.rels"))
        reescribir_zip(ruta, {"[Content_Types].xml": tipos, "_rels/.rels": rels}, quitar=set(firmas))
        return max(1, sum(1 for f in firmas if re.search(r"sig\d+\.xml$", f)))
    if motor_nombre == "OpenDocument":
        firmas = {"META-INF/documentsignatures.xml", "META-INF/macrosignatures.xml"}
        with zipfile.ZipFile(ruta) as z:
            presentes = firmas & set(z.namelist())
            if not presentes:
                return 0
            reemplazos = {}
            if "META-INF/manifest.xml" in z.namelist():
                reemplazos["META-INF/manifest.xml"] = re.sub(
                    rb'<manifest:file-entry[^>]*(?:documentsignatures|macrosignatures)\.xml"[^>]*/>', b"",
                    z.read("META-INF/manifest.xml"))
        reescribir_zip(ruta, reemplazos, quitar=presentes)
        return len(presentes)
    raise ErrorMetadatos("Este tipo de archivo no lleva firmas digitales.")


def _quitar_firmas_pdf(ruta):
    import pikepdf

    with pikepdf.open(ruta, allow_overwriting_input=True) as pdf:
        raiz = pdf.Root
        formulario = raiz.get("/AcroForm")
        quitadas = 0
        firmas = set()
        if formulario is not None and "/Fields" in formulario:
            def recorrer(lista):
                nonlocal quitadas
                nuevos = []
                for campo in lista:
                    if "/Kids" in campo:
                        campo.Kids = pikepdf.Array(recorrer(list(campo.Kids)))
                    if campo.get("/FT") == "/Sig":
                        quitadas += 1 if "/V" in campo else 0
                        firmas.add(campo.objgen)
                        continue
                    nuevos.append(campo)
                return nuevos

            formulario.Fields = pikepdf.Array(recorrer(list(formulario.Fields)))
            if "/SigFlags" in formulario:
                del formulario["/SigFlags"]
        # Las firmas también aparecen como «widgets» en las páginas.
        for pagina in pdf.pages:
            if "/Annots" in pagina.obj:
                anotaciones = [a for a in pagina.obj.Annots if a.objgen not in firmas
                               and not (a.get("/FT") == "/Sig" or (a.get("/Parent") is not None and a.Parent.get("/FT") == "/Sig"))]
                pagina.obj.Annots = pikepdf.Array(anotaciones)
        for clave in ("/Perms", "/DSS"):
            if clave in raiz:
                del raiz[clave]
        pdf.save(ruta)
    return quitadas


# ------------------------------------------------------------------ fotos dentro de documentos


def limpiar_imagenes_zip(ruta, prefijos):
    """Borra los metadatos (GPS, cámara…) de las fotos que hay dentro de un Word, Excel, LibreOffice…"""
    if not motores.EXIFTOOL:
        return 0
    with zipfile.ZipFile(ruta) as z:
        imagenes = [n for n in z.namelist() if n.startswith(prefijos) and
                    n.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic"))]
        if not imagenes:
            return 0
        carpeta = tempfile.mkdtemp()
        try:
            rutas = {}
            for i, nombre in enumerate(imagenes):
                destino = os.path.join(carpeta, f"{i:04d}{os.path.splitext(nombre)[1].lower()}")
                with open(destino, "wb") as f:
                    f.write(z.read(nombre))
                rutas[nombre] = destino
            motores._ejecutar_exiftool(["-overwrite_original", "-all=", "-tagsfromfile", "@",
                                        "-ColorSpaceTags", "-Orientation", *rutas.values()])
            reemplazos = {}
            for nombre, destino in rutas.items():
                with open(destino, "rb") as f:
                    reemplazos[nombre] = f.read()
        finally:
            shutil.rmtree(carpeta, ignore_errors=True)
    reescribir_zip(ruta, reemplazos)
    return len(imagenes)


def limpiar_jpeg(datos):
    """Quita de un JPEG los bloques de metadatos (EXIF, XMP, IPTC, comentarios) sin tocar la imagen."""
    if not datos.startswith(b"\xff\xd8"):
        return datos
    salida = bytearray(b"\xff\xd8")
    i = 2
    while i + 4 <= len(datos) and datos[i] == 0xFF:
        marcador = datos[i + 1]
        if marcador == 0xDA:  # empieza la imagen en sí: se copia el resto tal cual
            break
        longitud = int.from_bytes(datos[i + 2:i + 4], "big")
        bloque = datos[i:i + 2 + longitud]
        # APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) y COM (comentarios) fuera; el resto se queda.
        if marcador not in (0xE1, 0xED, 0xFE):
            salida += bloque
        i += 2 + longitud
    return bytes(salida + datos[i:])


def limpiar_imagenes_pdf(pdf):
    """Quita EXIF/GPS de las fotos JPEG metidas en un PDF (pdf ya abierto con pikepdf)."""
    import pikepdf

    limpiadas = 0
    vistas = set()
    for pagina in pdf.pages:
        objetos = (pagina.get("/Resources", {}) or {}).get("/XObject", {}) or {}
        for imagen in objetos.values():
            try:
                if imagen.objgen in vistas or imagen.get("/Subtype") != "/Image" or imagen.get("/Filter") != "/DCTDecode":
                    continue
                vistas.add(imagen.objgen)
                crudo = imagen.read_raw_bytes()
                limpio = limpiar_jpeg(crudo)
                if limpio != crudo:
                    imagen.write(limpio, filter=pikepdf.Name.DCTDecode)
                    limpiadas += 1
            except Exception:  # noqa: BLE001 - una imagen rara no debe impedir limpiar el resto
                continue
    return limpiadas


# ------------------------------------------------------------------ nombres dentro del contenido


ANONIMO = b"Autor"


def anonimizar_ooxml(ruta):
    """Cambia por «Autor» los nombres de quien comentó o hizo cambios, y quita la ruta de la plantilla."""
    reglas = [
        (rb'((?:w|w15|w16cex|w16cid):author)="[^"]*"', rb'\1="' + ANONIMO + rb'"'),
        (rb'(w:initials)="[^"]*"', rb'\1="A"'),
        (rb'\sw:date="[^"]*"', b""),
        (rb"<w15:presenceInfo\b[^>]*/>", b""),
        (rb"<author>[^<]*</author>", b"<author>" + ANONIMO + b"</author>"),
        (rb'(displayName|name)="[^"]*"(?=[^>]*(?:userId|initials|providerId|clrIdx))', rb'\1="' + ANONIMO + rb'"'),
        (rb'(userId)="[^"]*"', rb'\1=""'),
        (rb'(initials)="[^"]*"', rb'\1="A"'),
        (rb"<w:attachedTemplate\b[^>]*/>", b""),
    ]
    partes = re.compile(r"^(word/(document|comments\w*|people|footnotes|endnotes|header\d*|footer\d*|settings)\.xml"
                        r"|xl/comments\d*\.xml|xl/persons/person\.xml|xl/threadedComments/.*\.xml"
                        r"|ppt/commentAuthors\.xml|ppt/authors\.xml|ppt/comments/.*\.xml)$")
    reemplazos = {}
    with zipfile.ZipFile(ruta) as z:
        for nombre in z.namelist():
            if partes.match(nombre):
                datos = nuevo = z.read(nombre)
                for patron, cambio in reglas:
                    nuevo = re.sub(patron, cambio, nuevo)
                if nuevo != datos:
                    reemplazos[nombre] = nuevo
        if "word/_rels/settings.xml.rels" in z.namelist():
            datos = z.read("word/_rels/settings.xml.rels")
            nuevo = re.sub(rb"<Relationship\b[^>]*/attachedTemplate\"[^>]*/>", b"", datos)
            if nuevo != datos:
                reemplazos["word/_rels/settings.xml.rels"] = nuevo
    if reemplazos:
        reescribir_zip(ruta, reemplazos)


def anonimizar_odf(ruta):
    """Lo mismo para LibreOffice: autores de comentarios/cambios y la impresora usada."""
    reemplazos = {}
    with zipfile.ZipFile(ruta) as z:
        for nombre in ("content.xml", "styles.xml", "settings.xml"):
            if nombre not in z.namelist():
                continue
            datos = nuevo = z.read(nombre)
            nuevo = re.sub(rb"<dc:creator>[^<]*</dc:creator>", b"<dc:creator>" + ANONIMO + b"</dc:creator>", nuevo)
            nuevo = re.sub(rb"<dc:date>[^<]*</dc:date>", b"<dc:date>2000-01-01T00:00:00</dc:date>", nuevo)
            nuevo = re.sub(rb'<config:config-item config:name="Printer(?:Name|Setup)"[^>]*>[^<]*</config:config-item>', b"", nuevo)
            if nuevo != datos:
                reemplazos[nombre] = nuevo
    if reemplazos:
        reescribir_zip(ruta, reemplazos)


def anonimizar_pdf(pdf):
    """Quita el autor y las fechas de las notas y comentarios de un PDF (ya abierto)."""
    for pagina in pdf.pages:
        for anotacion in pagina.get("/Annots", []) or []:
            try:
                for clave in ("/T", "/M", "/CreationDate"):
                    if clave in anotacion:
                        del anotacion[clave]
            except Exception:  # noqa: BLE001
                continue
