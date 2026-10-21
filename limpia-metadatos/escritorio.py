"""Limpia Metadatos como aplicación de escritorio: su propia ventana, sin navegador.

La interfaz es la misma; el servidor interno solo escucha en este equipo y se
cierra junto con la ventana.
"""

import json
import os
import shutil
import subprocess
import sys
import threading

import app as servidor
import motores


class Puente:
    """Funciones nativas que la ventana llama con window.pywebview.api.<nombre>()."""

    def __init__(self):
        self._ventana = None  # con guion bajo para que pywebview no la exponga

    def _dialogo(self, tipo, **opciones):
        """Abre un diálogo del sistema y devuelve la lista de rutas elegidas (vacía si se cancela)."""
        resultado = self._ventana.create_file_dialog(tipo, **opciones)
        if not resultado:
            return []
        return [resultado] if isinstance(resultado, str) else list(resultado)

    def elegir_archivos(self):
        import webview

        rutas = self._dialogo(webview.FileDialog.OPEN, allow_multiple=True)
        return [servidor.registrar_ruta(r) for r in rutas]

    def guardar(self, id_archivo):
        import webview

        with servidor.cerrojo:
            registro = servidor.archivos.get(id_archivo)
        if not registro:
            return {"ok": False, "error": "Ese archivo ya no existe."}
        destino = self._dialogo(
            webview.FileDialog.SAVE,
            directory=registro.get("carpeta_origen") or carpeta_inicial(),
            save_filename=registro["nombre"],
        )
        if not destino:
            return {"ok": False}
        destino = destino[0]
        with servidor.cerrojo:
            shutil.copyfile(registro["ruta"], destino)
            poner_fecha_archivo(registro, destino)
        return {"ok": True, "ruta": destino}

    def guardar_todos(self):
        import webview

        carpeta = self._dialogo(webview.FileDialog.FOLDER, directory=carpeta_inicial())
        if not carpeta:
            return {"ok": False}
        carpeta = carpeta[0]
        total = 0
        with servidor.cerrojo:
            for registro in servidor.archivos.values():
                destino = nombre_libre(carpeta, registro["nombre"])
                shutil.copyfile(registro["ruta"], destino)
                poner_fecha_archivo(registro, destino)
                total += 1
        return {"ok": True, "ruta": carpeta, "total": total}

    def mostrar(self, ruta):
        """Abre la carpeta donde se ha guardado un archivo."""
        try:
            if sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", os.path.normpath(ruta)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", ruta])
            else:
                carpeta = ruta if os.path.isdir(ruta) else os.path.dirname(ruta)
                subprocess.Popen(["xdg-open", carpeta])
        except OSError:
            pass


def poner_fecha_archivo(registro, destino):
    """Si se eligió una fecha para el archivo, se le pone al guardarlo."""
    if registro.get("fecha_archivo"):
        os.utime(destino, (registro["fecha_archivo"], registro["fecha_archivo"]))


def carpeta_inicial():
    for carpeta in ("Desktop", "Escritorio", ""):
        ruta = os.path.join(os.path.expanduser("~"), carpeta)
        if os.path.isdir(ruta):
            return ruta
    return ""


def nombre_libre(carpeta, nombre):
    """No pisa archivos que ya existan: añade (2), (3)…"""
    base, ext = os.path.splitext(nombre)
    destino = os.path.join(carpeta, nombre)
    n = 2
    while os.path.exists(destino):
        destino = os.path.join(carpeta, f"{base} ({n}){ext}")
        n += 1
    return destino


def prueba(fichero_resultado):
    """Comprobación automática del programa ya empaquetado (sin abrir ventana)."""
    import tempfile

    import pikepdf
    from PIL import Image

    lineas = []
    carpeta = tempfile.mkdtemp()
    try:
        cliente = servidor.app.test_client()
        lineas.append(f"exiftool: {motores.version_exiftool()}")
        assert motores.EXIFTOOL, "no se encuentra ExifTool"

        foto = os.path.join(carpeta, "foto.jpg")
        exif = Image.Exif()
        exif[0x013B] = "Javier"  # Artist
        exif[0x010F] = "Apple"  # Make
        Image.new("RGB", (64, 48), "red").save(foto, exif=exif)
        pdf = os.path.join(carpeta, "documento.pdf")
        with pikepdf.new() as doc:
            doc.add_blank_page()
            doc.docinfo["/Author"] = "Javier"
            doc.save(pdf)

        for ruta in (foto, pdf):
            datos = servidor.registrar(os.path.basename(ruta), lambda d, r=ruta: shutil.copyfile(r, d))
            assert datos["personales"] > 0, f"{ruta}: no se leen los metadatos"
            limpio = cliente.post(f"/api/archivo/{datos['id']}/limpiar").get_json()
            assert limpio["personales"] == 0, f"{ruta}: no se limpió"
            editado = cliente.post(f"/api/archivo/{datos['id']}/editar",
                                   json={"cambios": {}, "nuevos": [{"campo": "autor", "valor": "Prueba ñ"}]}).get_json()
            assert any("Prueba ñ" in m["valor"] for m in editado["metadatos"]), f"{ruta}: no se editó"
            informe = cliente.get(f"/api/archivo/{datos['id']}/informe").get_json()
            assert "avisos" in informe and informe["secciones"], f"{ruta}: el informe no funciona"
            cambio = cliente.post(f"/api/archivo/{datos['id']}/fechas", json={"modo": "fijar", "fecha": "2020-01-02T03:04"})
            assert cambio.status_code == 200, f"{ruta}: no se cambiaron las fechas"
            lineas.append(f"{os.path.basename(ruta)}: {datos['motor']} OK")
        # Un Word con contraseña: se tiene que poder desbloquear.
        import io
        import zipfile

        from msoffcrypto.format.ooxml import OOXMLFile

        paquete = io.BytesIO()
        with zipfile.ZipFile(paquete, "w") as z:
            z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            z.writestr("docProps/core.xml", '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/'
                       'package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Javier'
                       '</dc:creator></cp:coreProperties>')
            # Relleno: los documentos de verdad ocupan más de 4 KB (msoffcrypto no cifra bien los diminutos).
            z.writestr("word/media/relleno.bin", os.urandom(8192))
        paquete.seek(0)
        cifrado = os.path.join(carpeta, "cifrado.docx")
        with open(cifrado, "wb") as f:
            OOXMLFile(paquete).encrypt("1234", f)
        datos = servidor.registrar("cifrado.docx", lambda d: shutil.copyfile(cifrado, d))
        assert datos.get("bloqueado"), "no detecta el Word con contraseña"
        abierto = cliente.post(f"/api/archivo/{datos['id']}/desbloquear", json={"contrasena": "1234"}).get_json()
        assert abierto.get("compatible") and abierto.get("personales"), f"no se desbloquea el Word: {abierto}"
        lineas.append("Word con contraseña: OK")
        # La dirección se consulta en internet: si falla aquí no es grave, solo se anota.
        lugar = cliente.get("/api/lugar?lat=40.4168&lon=-3.7038").get_json()
        lineas.append(f"dirección de prueba: {lugar.get('direccion') or lugar.get('error')}")
        assert cliente.get("/").status_code == 200, "no se encuentra la interfaz"
        lineas.append("OK")
        return 0
    except Exception as e:  # noqa: BLE001 - se informa de cualquier fallo
        lineas.append(f"FALLO: {e!r}")
        return 1
    finally:
        with open(fichero_resultado, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas) + "\n")
        shutil.rmtree(carpeta, ignore_errors=True)


def carpeta_registro():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Logs")
    else:
        base = os.path.expanduser("~/.cache")
    carpeta = os.path.join(base, "Limpia Metadatos")
    os.makedirs(carpeta, exist_ok=True)
    return carpeta


def avisar_error(detalle):
    """Guarda el error en un archivo y lo muestra en una ventanita, para no fallar en silencio."""
    try:
        registro = os.path.join(carpeta_registro(), "error.txt")
        with open(registro, "w", encoding="utf-8") as f:
            f.write(detalle)
    except OSError:
        registro = "(no se pudo guardar)"
    mensaje = ("Limpia Metadatos no ha podido abrirse.\n\n"
               f"{detalle.strip().splitlines()[-1]}\n\n"
               f"El detalle está guardado en:\n{registro}")
    if "WebView2" in detalle or "webview2" in detalle.lower():
        mensaje += ("\n\nFalta el componente WebView2 de Microsoft. Instálalo gratis desde:\n"
                    "https://developer.microsoft.com/microsoft-edge/webview2/")
    try:
        if sys.platform == "win32":
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, mensaje, "Limpia Metadatos", 0x10)
        elif sys.platform == "darwin":
            texto = mensaje.replace("\\", "\\\\").replace('"', '\\"')
            subprocess.run(["osascript", "-e", f'display alert "Limpia Metadatos" message "{texto}" as critical'])
    except Exception:  # noqa: BLE001 - si ni siquiera se puede avisar, queda el archivo
        pass


def al_arrancar(ventana, fichero_prueba=None):
    """Se ejecuta cuando la ventana ya existe."""
    vigilar_arrastre(ventana)
    if fichero_prueba:
        comprobar_ventana(ventana, fichero_prueba)


def vigilar_arrastre(ventana):
    """Al arrastrar archivos a la ventana se usa su ruta real (así se conocen sus fechas y su origen)."""
    import logging

    from webview.dom import DOMEventHandler

    def al_soltar(evento):
        archivos = (evento.get("dataTransfer") or {}).get("files") or []
        rutas = [f.get("pywebviewFullPath") for f in archivos]
        rutas = [r for r in rutas if r and os.path.isfile(r)]
        if not rutas:
            return
        try:
            nuevos = [servidor.registrar_ruta(r) for r in rutas]
            ventana.evaluate_js(f"recibirSubidos({json.dumps(nuevos)})")
        except Exception:  # noqa: BLE001
            logging.exception("No se pudieron añadir los archivos arrastrados")
            ventana.evaluate_js("aviso('No se pudieron añadir los archivos arrastrados.', 'error')")

    try:
        ventana.dom.document.events.drop += DOMEventHandler(al_soltar, True, False)
    except Exception:  # noqa: BLE001 - si falla, se sigue pudiendo usar «elegir archivos»
        logging.exception("No se pudo activar arrastrar y soltar")


def comprobar_ventana(ventana, fichero_resultado):
    """Prueba automática con la ventana de verdad: espera a que cargue y la cierra."""
    import time

    resultado = "FALLO: la ventana no terminó de cargar"
    for _ in range(60):
        try:
            if ventana.evaluate_js("!!(document.querySelector('#zona') && window.pywebview && window.pywebview.api"
                                   " && window.pywebview.api.guardar)"):
                resultado = "OK"
                break
        except Exception as e:  # noqa: BLE001
            resultado = f"FALLO: {e!r}"
        time.sleep(0.5)
    with open(fichero_resultado, "w", encoding="utf-8") as f:
        f.write(resultado + "\n")
    ventana.destroy()


def abrir_ventana():
    import logging

    import webview
    from werkzeug.serving import make_server

    servidor_web = make_server("127.0.0.1", 0, servidor.app, threaded=True)
    threading.Thread(target=servidor_web.serve_forever, daemon=True).start()

    puente = Puente()
    ventana = webview.create_window(
        "Limpia Metadatos",
        f"http://127.0.0.1:{servidor_web.server_port}/",
        js_api=puente,
        width=1120,
        height=820,
        min_size=(420, 560),
        text_select=True,
    )
    puente._ventana = ventana
    # En Windows la ventana toma el icono del propio .exe; pasarle el .png la hace fallar.
    icono = os.path.join(servidor.CARPETA_APP, "recursos", "icono.png") if sys.platform != "win32" else ""
    prueba_ventana = os.environ.get("LIMPIA_PRUEBA_VENTANA")
    logging.info("Abriendo la ventana (servidor en el puerto %s)", servidor_web.server_port)
    webview.start(
        al_arrancar,
        (ventana, prueba_ventana),
        private_mode=True,
        icon=icono if os.path.isfile(icono) else None,
    )
    logging.info("Ventana cerrada")
    servidor_web.shutdown()


_fichero_fallos = None


def preparar_registro():
    """Guarda lo que pasa al arrancar en registro.txt, para poder ver por qué falla."""
    import faulthandler
    import logging

    ruta = os.path.join(carpeta_registro(), "registro.txt")
    logging.basicConfig(filename=ruta, filemode="w", level=logging.INFO, encoding="utf-8",
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("pywebview").setLevel(logging.DEBUG)
    # Los cierres bruscos (fallos dentro de librerías nativas) también quedan apuntados.
    global _fichero_fallos
    _fichero_fallos = open(os.path.join(carpeta_registro(), "fallo-grave.txt"), "w", encoding="utf-8")
    faulthandler.enable(_fichero_fallos)
    logging.info("Arrancando Limpia Metadatos en %s (Python %s)", sys.platform, sys.version.split()[0])


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--prueba":
        sys.exit(prueba(sys.argv[2]))
    try:
        preparar_registro()
    except OSError:
        pass
    try:
        abrir_ventana()
    except Exception:  # noqa: BLE001 - cualquier fallo al arrancar se le enseña a la persona
        import traceback

        avisar_error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
