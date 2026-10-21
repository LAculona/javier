"""Limpia Metadatos: aplicación personal para ver, limpiar y editar metadatos.

Se ejecuta en tu ordenador y solo es accesible desde él (127.0.0.1).
Los archivos se guardan en una carpeta temporal que se borra al cerrar.
"""

import atexit
import io
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import sys
import urllib.parse
import urllib.request
import uuid
import webbrowser
import zipfile
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_file, send_from_directory

import herramientas
import informe as informes
import motores

CARPETA_TRABAJO = tempfile.mkdtemp(prefix="limpia-metadatos-")
atexit.register(shutil.rmtree, CARPETA_TRABAJO, True)

CARPETA_APP = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
app = Flask(__name__, static_folder=os.path.join(CARPETA_APP, "static"), static_url_path="/static")
archivos = {}  # id -> dict con los datos del archivo subido
cerrojo = threading.Lock()


class ErrorUsuario(Exception):
    pass


@app.errorhandler(ErrorUsuario)
@app.errorhandler(motores.ErrorMetadatos)
def error_usuario(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(Exception)
def error_inesperado(e):
    app.logger.exception(e)
    return jsonify(error=f"Algo salió mal: {e}"), 500


def obtener(id_archivo):
    if id_archivo not in archivos:
        raise ErrorUsuario("Ese archivo ya no existe. Vuelve a subirlo.")
    return archivos[id_archivo]


def referencia_limpia(registro):
    """Lee cómo queda el archivo tras limpiarlo, para saber qué datos no se pueden quitar."""
    if registro.get("referencia") is None:
        copia = os.path.join(registro["carpeta"], "referencia" + registro["ext"])
        shutil.copyfile(registro["original"], copia)
        try:
            registro["motor"].limpiar(copia)
            registro["referencia"] = {d["clave"]: d["valor"] for d in registro["motor"].leer(copia)}
        except Exception:
            registro["referencia"] = {}
        finally:
            if os.path.exists(copia):
                os.remove(copia)
    return registro["referencia"]


def resumen(registro, con_metadatos=False):
    motor = registro["motor"]
    resultado = {
        "id": registro["id"],
        "nombre": registro["nombre"],
        "tamano": os.path.getsize(registro["ruta"]),
        "motor": motor.nombre if motor else None,
        "modificado": registro["modificado"],
    }
    if motor is None:
        resultado.update(compatible=False, personales=0, sensibles=0,
                         error="Tipo de archivo no compatible. Instala ExifTool para abrir más formatos.")
        return resultado
    try:
        datos = motor.leer(registro["ruta"])
    except Exception as e:
        if protegido_con_contrasena(registro):
            resultado.update(compatible=False, bloqueado=True, personales=0, sensibles=0,
                             error="Protegido con contraseña")
        else:
            resultado.update(compatible=False, personales=0, sensibles=0,
                             error=f"No se pudieron leer los metadatos: {e}")
        return resultado
    referencia = referencia_limpia(registro)
    for d in datos:
        tecnico = d.pop("tecnico", False) or not d["borrable"] or referencia.get(d["clave"]) == d["valor"]
        d["seccion"] = "tecnico" if tecnico else "personal"
        d["vacio"] = not str(d["valor"]).strip()
        d["sensible"] = not tecnico and not d["vacio"] and motores.es_sensible(d["clave"])
    for d in datos:
        if len(d["valor"]) > 400:  # bloques enormes (XML, listas…): solo se muestra el principio
            d.update(valor=d["valor"][:400] + "…", editable=False)
    # Los campos vacíos se muestran (para poder rellenarlos) pero no cuentan como datos.
    personales = [d for d in datos if d["seccion"] == "personal" and not d["vacio"]]
    resultado.update(
        compatible=True,
        personales=len(personales),
        sensibles=sum(d["sensible"] for d in personales),
        gps=any("gps" in d["clave"].lower() for d in personales),
    )
    if con_metadatos:
        etiquetas = dict(motores.CAMPOS)
        resultado.update(
            metadatos=datos,
            campos=[{"clave": c, "etiqueta": etiquetas[c]} for c in motor.campos],
            personalizado=motor.personalizado,
            editable=motor.campos != () or motor.personalizado,
        )
    return resultado


@app.get("/")
def inicio():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/estado")
def estado():
    return jsonify(exiftool=motores.version_exiftool())


@app.get("/api/archivos")
def listar():
    with cerrojo:
        return jsonify([resumen(r) for r in archivos.values()])


def protegido_con_contrasena(registro):
    if registro["ext"] == ".pdf":
        import pikepdf

        try:
            pikepdf.open(registro["ruta"]).close()
        except pikepdf.PasswordError:
            return True
        except Exception:  # noqa: BLE001 - PDF dañado: no es un tema de contraseña
            return False
        return False
    return registro["motor"] is not None and registro["motor"].nombre == "Office" and herramientas.es_ole(registro["ruta"])


def fecha_legible(marca):
    momento = datetime.fromtimestamp(marca)
    return {"legible": f"{momento:%d/%m/%Y %H:%M:%S}", "orden": momento.isoformat()}


def fechas_de_ruta(ruta):
    """Fechas que tu ordenador guarda del archivo (no están dentro del archivo)."""
    datos = os.stat(ruta)
    fechas_sistema = {"Modificado en tu ordenador": fecha_legible(datos.st_mtime)}
    creado = getattr(datos, "st_birthtime", None) or (datos.st_ctime if sys.platform == "win32" else None)
    if creado:
        fechas_sistema["Creado en tu ordenador"] = fecha_legible(creado)
    return fechas_sistema


def procedencia_de_ruta(ruta):
    """De dónde salió el archivo, según lo que apunta el sistema al descargarlo."""
    resultado = [["Carpeta de origen", os.path.dirname(ruta)]]
    if sys.platform == "win32":
        try:
            with open(ruta + ":Zone.Identifier", encoding="utf-8", errors="replace") as f:
                texto = f.read()
            zonas = {"0": "Este equipo", "1": "Red local", "2": "Sitios de confianza", "3": "Internet", "4": "Sitios restringidos"}
            for linea in texto.splitlines():
                clave, _, valor = linea.partition("=")
                if clave == "ZoneId":
                    resultado.append(["Origen según Windows", zonas.get(valor.strip(), valor)])
                elif clave == "HostUrl" and valor.strip() not in ("", "about:internet"):
                    resultado.append(["Descargado de", valor.strip()])
                elif clave == "ReferrerUrl" and valor.strip():
                    resultado.append(["Página desde la que se descargó", valor.strip()])
        except OSError:
            pass
    elif sys.platform == "darwin":
        try:
            salida = subprocess.run(["mdls", "-raw", "-name", "kMDItemWhereFroms", ruta],
                                    capture_output=True, text=True, timeout=5).stdout
            for i, url in enumerate(re.findall(r'"([^"]+)"', salida)):
                resultado.append(["Descargado de" if i == 0 else "Página desde la que se descargó", url])
            cuarentena = subprocess.run(["xattr", "-p", "com.apple.quarantine", ruta],
                                        capture_output=True, text=True, timeout=5).stdout.strip()
            if cuarentena.count(";") >= 2:
                resultado.append(["Descargado con", cuarentena.split(";")[2]])
        except (OSError, subprocess.SubprocessError):
            pass
    return resultado


def registrar_ruta(ruta):
    """Da de alta un archivo del disco (aplicación de escritorio), con sus fechas y procedencia."""
    return registrar(os.path.basename(ruta), lambda destino: shutil.copyfile(ruta, destino),
                     carpeta_origen=os.path.dirname(ruta), fechas_sistema=fechas_de_ruta(ruta),
                     procedencia=procedencia_de_ruta(ruta))


def registrar(nombre, guardar, carpeta_origen=None, fechas_sistema=None, procedencia=None):
    """Da de alta un archivo. `guardar(ruta)` escribe su contenido en esa ruta."""
    nombre = os.path.basename(nombre or "archivo").strip() or "archivo"
    id_archivo = uuid.uuid4().hex
    carpeta = os.path.join(CARPETA_TRABAJO, id_archivo)
    os.makedirs(carpeta)
    ext = os.path.splitext(nombre)[1].lower()
    # Nombres internos sencillos para evitar problemas con tildes o espacios.
    original = os.path.join(carpeta, "original" + ext)
    guardar(original)
    ruta = os.path.join(carpeta, "archivo" + ext)
    shutil.copyfile(original, ruta)
    registro = {
        "id": id_archivo, "nombre": nombre, "carpeta": carpeta, "ext": ext,
        "original": original, "ruta": ruta, "motor": motores.elegir_motor(nombre),
        "modificado": False, "referencia": None, "carpeta_origen": carpeta_origen,
        "fechas_sistema": fechas_sistema or {}, "procedencia": procedencia or [], "fecha_archivo": None,
    }
    with cerrojo:
        archivos[id_archivo] = registro
        return resumen(registro)


@app.post("/api/subir")
def subir():
    ficheros = request.files.getlist("archivos")
    modificados = request.form.getlist("modificados")
    nuevos = []
    for i, fichero in enumerate(ficheros):
        fechas_sistema = {}
        try:
            fechas_sistema["Modificado en tu ordenador"] = fecha_legible(int(modificados[i]) / 1000)
        except (IndexError, ValueError, OSError):
            pass
        nuevos.append(registrar(fichero.filename, fichero.save, fechas_sistema=fechas_sistema))
    return jsonify(nuevos)


@app.get("/api/archivo/<id_archivo>")
def ver(id_archivo):
    with cerrojo:
        return jsonify(resumen(obtener(id_archivo), con_metadatos=True))


def _exigir_motor(registro):
    if registro["motor"] is None:
        raise ErrorUsuario("Este tipo de archivo no es compatible.")
    return registro["motor"]


@app.post("/api/archivo/<id_archivo>/limpiar")
def limpiar(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        _exigir_motor(registro).limpiar(registro["ruta"])
        registro["modificado"] = True
        return jsonify(resumen(registro, con_metadatos=True))


@app.post("/api/archivo/<id_archivo>/editar")
def editar(id_archivo):
    cuerpo = request.get_json(force=True) or {}
    cambios = cuerpo.get("cambios") or {}
    nuevos = [(n.get("campo", ""), n.get("valor", "")) for n in cuerpo.get("nuevos") or []]
    nuevos = [(c, v) for c, v in nuevos if c and str(v).strip()]
    with cerrojo:
        registro = obtener(id_archivo)
        motor = _exigir_motor(registro)
        # Se trabaja sobre una copia: si algo falla, el archivo queda como estaba.
        aplicar(registro, lambda copia: motor.editar(copia, cambios, nuevos))
        return jsonify(resumen(registro, con_metadatos=True))


def aplicar(registro, funcion):
    """Ejecuta `funcion(copia)` sobre una copia y, si sale bien, la deja como archivo actual."""
    copia = registro["ruta"] + ".editando" + registro["ext"]
    shutil.copyfile(registro["ruta"], copia)
    try:
        resultado = funcion(copia)
        os.replace(copia, registro["ruta"])
    finally:
        if os.path.exists(copia):
            os.remove(copia)
    registro["modificado"] = True
    return resultado


@app.get("/api/archivo/<id_archivo>/informe")
def ver_informe(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        datos = resumen(registro, con_metadatos=True)
        resultado = informes.generar(registro, datos.get("metadatos", []))
        motor = registro["motor"]
        nombre_motor = motor.nombre if motor else ""
        resultado["capacidades"] = {
            "fechas": len(herramientas.cambios_de_fechas(datos.get("metadatos", []), "desplazar",
                                                         desplazamiento=timedelta(seconds=1))),
            "ubicacion": nombre_motor == "ExifTool",
            "desbloquear": nombre_motor in ("PDF", "Office", "OpenDocument"),
            "firmas": nombre_motor in ("PDF", "Office", "OpenDocument"),
            "fecha_archivo": registro.get("fecha_archivo"),
        }
        return jsonify(resultado)


@app.post("/api/archivo/<id_archivo>/fechas")
def cambiar_fechas(id_archivo):
    cuerpo = request.get_json(force=True) or {}
    modo = cuerpo.get("modo")
    with cerrojo:
        registro = obtener(id_archivo)
        motor = _exigir_motor(registro)
        metadatos = resumen(registro, con_metadatos=True).get("metadatos", [])
        if modo == "fijar":
            nueva = herramientas.leer_fecha_usuario(cuerpo.get("fecha"))
            cambios = herramientas.cambios_de_fechas(metadatos, "fijar", nueva=nueva)
        else:
            desplazamiento = herramientas.leer_desplazamiento(cuerpo)
            cambios = herramientas.cambios_de_fechas(metadatos, "desplazar", desplazamiento=desplazamiento)
        if cambios:
            aplicar(registro, lambda copia: motor.editar(copia, cambios, []))
        if cuerpo.get("archivo") and modo == "fijar":
            # Fecha que tendrá el archivo en tu ordenador al guardarlo (solo en la aplicación).
            registro["fecha_archivo"] = nueva.timestamp()
        datos = resumen(registro, con_metadatos=True)
        datos["mensaje"] = f"Se cambiaron {len(cambios)} fecha(s)." if cambios else "No había fechas que cambiar."
        return jsonify(datos)


@app.post("/api/archivo/<id_archivo>/ubicacion")
def cambiar_ubicacion(id_archivo):
    cuerpo = request.get_json(force=True) or {}
    with cerrojo:
        registro = obtener(id_archivo)
        if registro["motor"] is None or registro["motor"].nombre != "ExifTool":
            raise ErrorUsuario("La ubicación solo se puede cambiar en fotos y vídeos.")
        if cuerpo.get("quitar"):
            aplicar(registro, herramientas.quitar_ubicacion)
            mensaje = "Ubicación quitada."
        else:
            lat, lon, alt = herramientas.leer_coordenadas(cuerpo)
            aplicar(registro, lambda copia: herramientas.poner_ubicacion(copia, lat, lon, alt))
            mensaje = f"Ubicación cambiada a {lat:.6f}, {lon:.6f}."
        datos = resumen(registro, con_metadatos=True)
        datos["mensaje"] = mensaje
        return jsonify(datos)


@app.post("/api/archivo/<id_archivo>/desbloquear")
def desbloquear(id_archivo):
    cuerpo = request.get_json(force=True) or {}
    with cerrojo:
        registro = obtener(id_archivo)
        motor = _exigir_motor(registro)
        try:
            mensaje = aplicar(registro, lambda copia: herramientas.desbloquear(copia, motor.nombre, cuerpo.get("contrasena", "")))
        except motores.ErrorMetadatos as e:
            texto = str(e)
            if texto.startswith("CONTRASEÑA: "):
                return jsonify(error=texto[len("CONTRASEÑA: "):], necesita_contrasena=True), 400
            raise
        registro["referencia"] = None  # el archivo ahora se puede leer por dentro
        datos = resumen(registro, con_metadatos=True)
        datos["mensaje"] = mensaje
        return jsonify(datos)


@app.post("/api/archivo/<id_archivo>/quitar-firmas")
def quitar_firmas(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        motor = _exigir_motor(registro)
        cuantas = aplicar(registro, lambda copia: herramientas.quitar_firmas(copia, motor.nombre))
        datos = resumen(registro, con_metadatos=True)
        datos["mensaje"] = f"Se quitaron {cuantas} firma(s) digital(es)." if cuantas else "No tenía firmas digitales."
        return jsonify(datos)


@app.get("/api/lugar")
def lugar():
    """Dirección aproximada de unas coordenadas. Solo se consulta si lo pides (usa OpenStreetMap)."""
    try:
        lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError):
        raise ErrorUsuario("Coordenadas no válidas.")
    consulta = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 18,
                                       "accept-language": "es", "addressdetails": 1})
    peticion = urllib.request.Request(f"https://nominatim.openstreetmap.org/reverse?{consulta}",
                                      headers={"User-Agent": "LimpiaMetadatos/1.0 (aplicacion personal)"})
    try:
        with urllib.request.urlopen(peticion, timeout=10) as respuesta:
            datos = json.loads(respuesta.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 - sin internet, bloqueado, etc.
        raise ErrorUsuario("No se pudo consultar la dirección (¿hay conexión a internet?).")
    return jsonify(direccion=datos.get("display_name"), detalles=datos.get("address", {}))


@app.post("/api/archivo/<id_archivo>/restaurar")
def restaurar(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        shutil.copyfile(registro["original"], registro["ruta"])
        registro["modificado"] = False
        registro["fecha_archivo"] = None
        return jsonify(resumen(registro, con_metadatos=True))


@app.delete("/api/archivo/<id_archivo>")
def quitar(id_archivo):
    with cerrojo:
        registro = archivos.pop(id_archivo, None)
        if registro:
            shutil.rmtree(registro["carpeta"], ignore_errors=True)
    return jsonify(ok=True)


@app.delete("/api/archivos")
def quitar_todos():
    with cerrojo:
        for registro in archivos.values():
            shutil.rmtree(registro["carpeta"], ignore_errors=True)
        archivos.clear()
    return jsonify(ok=True)


@app.post("/api/limpiar-todos")
def limpiar_todos():
    errores = []
    with cerrojo:
        for registro in archivos.values():
            if registro["motor"] is None:
                continue
            try:
                registro["motor"].limpiar(registro["ruta"])
                registro["modificado"] = True
            except Exception as e:
                errores.append(f"{registro['nombre']}: {e}")
        return jsonify(archivos=[resumen(r) for r in archivos.values()], errores=errores)


@app.get("/api/archivo/<id_archivo>/descargar")
def descargar(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        datos = open(registro["ruta"], "rb").read()
    return send_file(io.BytesIO(datos), as_attachment=True, download_name=registro["nombre"])


@app.get("/api/descargar-todos")
def descargar_todos():
    memoria = io.BytesIO()
    usados = set()
    with cerrojo, zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as z:
        for registro in archivos.values():
            nombre = registro["nombre"]
            base, ext = os.path.splitext(nombre)
            n = 2
            while nombre.lower() in usados:
                nombre = f"{base} ({n}){ext}"
                n += 1
            usados.add(nombre.lower())
            z.write(registro["ruta"], nombre)
    memoria.seek(0)
    return send_file(memoria, as_attachment=True, download_name="archivos-limpios.zip")


def abrir_navegador(direccion):
    try:
        if webbrowser.open(direccion):
            return
    except Exception:
        pass
    # Alternativas por si el módulo webbrowser no encuentra el navegador.
    try:
        if sys.platform == "win32":
            os.startfile(direccion)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", direccion])
        else:
            subprocess.Popen(["xdg-open", direccion])
    except Exception:
        pass


def puerto_libre(preferido=5050):
    for puerto in range(preferido, preferido + 50):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", puerto))
                return puerto
            except OSError:
                continue
    return 0


if __name__ == "__main__":
    import logging
    import flask.cli

    # Sin mensajes técnicos del servidor en la ventana: solo lo que te interesa.
    flask.cli.show_server_banner = lambda *a, **k: None
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    puerto = puerto_libre()
    direccion = f"http://127.0.0.1:{puerto}"
    print()
    print("  ==============================================================")
    print("   Limpia Metadatos está funcionando.")
    print()
    print("   Se abrirá sola en tu navegador. Si no se abre, copia esta")
    print("   dirección en la barra de direcciones del navegador:")
    print()
    print(f"       {direccion}")
    print()
    print("   NO cierres esta ventana mientras uses la aplicación.")
    print("   Para salir, ciérrala o pulsa Ctrl+C.")
    print("  ==============================================================")
    print()
    if not motores.EXIFTOOL:
        print("  Aviso: ExifTool no está instalado. Fotos (solo limpiar), PDF, Office y audio")
        print("  funcionan igual; para vídeos y el resto de formatos instala ExifTool.\n")
    if not os.environ.get("SIN_NAVEGADOR"):
        threading.Timer(1.5, abrir_navegador, [direccion]).start()
    app.run(host="127.0.0.1", port=puerto, debug=False)
