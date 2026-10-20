#!/bin/bash
# Doble clic en Mac (o ./iniciar.command en Linux) para abrir Limpia Metadatos.
cd "$(dirname "$0")" || exit 1

if [ ! -f app.py ]; then
  echo "Primero descomprime el archivo .zip y abre iniciar.command desde la carpeta creada."
  read -r -p "Pulsa Intro para salir..."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Necesitas instalar Python 3: https://www.python.org/downloads/"
  read -r -p "Pulsa Intro para salir..."
  exit 1
fi

if [ ! -f .venv/listo ]; then
  echo "Preparando la aplicación por primera vez, espera un momento..."
  rm -rf .venv
  python3 -m venv .venv && .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || {
    read -r -p "Algo falló. Pulsa Intro para salir..."; exit 1; }
  touch .venv/listo
  if ! command -v exiftool >/dev/null 2>&1; then
    echo
    echo "Consejo: instala ExifTool para trabajar con vídeos y muchos más formatos:"
    echo "  Mac:   brew install exiftool"
    echo "  Linux: sudo apt install libimage-exiftool-perl"
    echo
  fi
fi

.venv/bin/python app.py
echo
read -r -p "La aplicación se ha cerrado. Si ves un error arriba, haz una captura. Pulsa Intro para salir..."
