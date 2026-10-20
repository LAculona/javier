"""Limpia Metadatos: aplicación personal para ver, limpiar y editar metadatos.

Se ejecuta en tu ordenador y solo es accesible desde él (127.0.0.1).
Los archivos se guardan en una carpeta temporal que se borra al cerrar.
"""

import atexit
import io
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import uuid
import webbrowser
import zipfile

from flask import Flask, jsonify, request, send_file, send_from_directory

import motores

CARPETA_TRABAJO = tempfile.mkdtemp(prefix="limpia-metadatos-")
atexit.register(shutil.rmtree, CARPETA_TRABAJO, True)

app = Flask(__name__, static_folder="static", static_url_path="/static")
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


@app.post("/api/subir")
def subir():
    nuevos = []
    for fichero in request.files.getlist("archivos"):
        nombre = os.path.basename(fichero.filename or "archivo").strip() or "archivo"
        id_archivo = uuid.uuid4().hex
        carpeta = os.path.join(CARPETA_TRABAJO, id_archivo)
        os.makedirs(carpeta)
        ext = os.path.splitext(nombre)[1].lower()
        # Nombres internos sencillos para evitar problemas con tildes o espacios.
        original = os.path.join(carpeta, "original" + ext)
        fichero.save(original)
        ruta = os.path.join(carpeta, "archivo" + ext)
        shutil.copyfile(original, ruta)
        registro = {
            "id": id_archivo, "nombre": nombre, "carpeta": carpeta, "ext": ext,
            "original": original, "ruta": ruta, "motor": motores.elegir_motor(nombre),
            "modificado": False, "referencia": None,
        }
        with cerrojo:
            archivos[id_archivo] = registro
            nuevos.append(resumen(registro))
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
        copia = registro["ruta"] + ".editando" + registro["ext"]
        shutil.copyfile(registro["ruta"], copia)
        try:
            motor.editar(copia, cambios, nuevos)
            os.replace(copia, registro["ruta"])
        finally:
            if os.path.exists(copia):
                os.remove(copia)
        registro["modificado"] = True
        return jsonify(resumen(registro, con_metadatos=True))


@app.post("/api/archivo/<id_archivo>/restaurar")
def restaurar(id_archivo):
    with cerrojo:
        registro = obtener(id_archivo)
        shutil.copyfile(registro["original"], registro["ruta"])
        registro["modificado"] = False
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
