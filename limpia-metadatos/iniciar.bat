@echo off
chcp 65001 >nul
title Limpia Metadatos
cd /d "%~dp0"

rem --- 1. Comprobar que el zip esta descomprimido -----------------------------
if not exist "app.py" goto sin_descomprimir

rem --- 2. Buscar Python (el lanzador "py" o "python") -------------------------
rem     Se ejecuta de verdad para no confundirlo con el acceso directo de la
rem     Microsoft Store, que existe aunque Python no este instalado.
set "PY="
py -3 --version >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto python_ok
python --version >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY goto sin_python
:python_ok

rem --- 3. Preparar la aplicacion la primera vez -------------------------------
if exist ".venv\listo" goto arrancar
echo.
echo  Preparando la aplicacion por primera vez. Puede tardar un par de minutos...
echo.
if exist ".venv" rmdir /s /q ".venv"
%PY% -m venv .venv
if not exist ".venv\Scripts\python.exe" goto fallo_venv
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto fallo_pip
echo ok> ".venv\listo"

rem --- 4. Ofrecer ExifTool (opcional) -----------------------------------------
where exiftool >nul 2>nul
if not errorlevel 1 goto arrancar
if exist "%ProgramFiles%\ExifTool\exiftool.exe" goto arrancar
if exist "exiftool.exe" goto arrancar
echo.
echo  ExifTool (opcional) permite trabajar con videos y muchos mas formatos.
choice /c SN /m "  Quieres instalarlo ahora"
if errorlevel 2 goto arrancar
winget install -e --id OliverBetz.ExifTool --accept-package-agreements --accept-source-agreements

rem --- 5. Arrancar -------------------------------------------------------------
:arrancar
".venv\Scripts\python.exe" app.py
echo.
echo  La aplicacion se ha cerrado. Si ves un error arriba, haz una foto de esta ventana.
pause
exit /b

:sin_descomprimir
echo.
echo  Primero tienes que DESCOMPRIMIR el archivo .zip:
echo    clic derecho sobre limpia-metadatos.zip  ^>  "Extraer todo"
echo  Despues abre iniciar.bat desde la carpeta que se crea.
echo.
pause
exit /b

:sin_python
echo.
echo  No se ha encontrado Python (es gratis). Se va a abrir la pagina de descarga.
echo.
echo  IMPORTANTE: en la primera pantalla del instalador marca la casilla
echo     "Add python.exe to PATH"
echo  y cuando termine vuelve a abrir este archivo.
echo.
start "" "https://www.python.org/downloads/"
pause
exit /b

:fallo_venv
echo.
echo  No se pudo preparar Python. Prueba a reinstalar Python desde python.org
echo  marcando la casilla "Add python.exe to PATH".
echo.
pause
exit /b

:fallo_pip
echo.
echo  No se pudieron descargar los componentes. Comprueba tu conexion a internet
echo  y vuelve a abrir este archivo.
echo.
if exist ".venv" rmdir /s /q ".venv"
pause
exit /b
