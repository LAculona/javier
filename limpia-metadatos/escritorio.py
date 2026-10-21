"""Limpia Metadatos como aplicación de escritorio: su propia ventana, sin navegador.

La interfaz es la misma; el servidor interno solo escucha en este equipo y se
cierra junto con la ventana.
"""

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
        return [
            servidor.registrar(os.path.basename(r), lambda destino, r=r: shutil.copyfile(r, destino),
                               carpeta_origen=os.path.dirname(r))
            for r in rutas
        ]

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
                shutil.copyfile(registro["ruta"], nombre_libre(carpeta, registro["nombre"]))
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
            lineas.append(f"{os.path.basename(ruta)}: {datos['motor']} OK")
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
        comprobar_ventana if prueba_ventana else None,
        (ventana, prueba_ventana) if prueba_ventana else None,
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
