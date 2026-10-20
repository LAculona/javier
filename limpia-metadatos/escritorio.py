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


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--prueba":
        sys.exit(prueba(sys.argv[2]))

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
    icono = os.path.join(servidor.CARPETA_APP, "recursos", "icono.png")
    webview.start(private_mode=True, icon=icono if os.path.isfile(icono) else None)
    servidor_web.shutdown()


if __name__ == "__main__":
    main()
