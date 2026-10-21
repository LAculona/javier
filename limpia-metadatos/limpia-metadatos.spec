# Receta de PyInstaller para crear la aplicación de escritorio.
# Uso:  pyinstaller limpia-metadatos.spec
import os
import sys

datos = [("static", "static"), ("recursos/icono.png", "recursos")]
if os.path.isdir("exiftool"):  # ExifTool descargado por el script de construcción
    datos.append(("exiftool", "exiftool"))

a = Analysis(["escritorio.py"], pathex=["."], datas=datos)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Limpia Metadatos",
    console=False,
    icon="recursos/icono.ico" if sys.platform == "win32" else "recursos/icono.png",
    version="version_windows.txt" if sys.platform == "win32" else None,
    upx=False,
)
coleccion = COLLECT(exe, a.binaries, a.datas, name="Limpia Metadatos", upx=False)

if sys.platform == "darwin":
    app = BUNDLE(
        coleccion,
        name="Limpia Metadatos.app",
        icon="recursos/icono.png",
        bundle_identifier="es.javier.limpiametadatos",
        info_plist={
            "CFBundleDisplayName": "Limpia Metadatos",
            "CFBundleShortVersionString": os.environ.get("VERSION_APP", "1.0.0"),
            "NSHighResolutionCapable": True,
        },
    )
