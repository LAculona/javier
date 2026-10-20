@echo off
chcp 65001 >nul
title Limpia Metadatos
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Necesitas instalar Python ^(gratis^). Se va a abrir la pagina de descarga.
  echo  Durante la instalacion marca la casilla "Add python.exe to PATH".
  echo  Despues vuelve a abrir este archivo.
  start https://www.python.org/downloads/
  pause
  exit /b
)

if not exist ".venv\listo" (
  echo.
  echo  Preparando la aplicacion por primera vez, espera un momento...
  python -m venv .venv
  ".venv\Scripts\python" -m pip install --disable-pip-version-check -q -r requirements.txt || (pause & exit /b)
  echo ok> ".venv\listo"

  where exiftool >nul 2>nul
  if errorlevel 1 if not exist "%ProgramFiles%\ExifTool\exiftool.exe" if not exist "exiftool.exe" (
    echo.
    echo  ExifTool permite trabajar con videos y con muchos mas formatos.
    choice /c SN /m "  Quieres instalarlo ahora"
    if not errorlevel 2 winget install -e --id OliverBetz.ExifTool --accept-package-agreements --accept-source-agreements
  )
)

".venv\Scripts\python" app.py
pause
