# Limpia Metadatos

Aplicación personal para **ver, borrar, editar y añadir metadatos** de tus archivos:
fotos, vídeos, PDF, Word, Excel, PowerPoint, LibreOffice y música.

Funciona **en tu propio ordenador**: tus archivos no se suben a internet y la
aplicación solo es accesible desde tu equipo. Al cerrarla se borra todo lo temporal.

## Instalarla

Descarga el instalador de tu sistema desde la página de descargas:
**https://github.com/LAculona/javier/releases/latest**

- **Windows**: `LimpiaMetadatos-Instalador-Windows.exe`. Ábrelo y sigue los pasos.
  Como el programa no está firmado por Microsoft, puede salir «Windows protegió su PC»:
  pulsa *Más información* → *Ejecutar de todas formas*.
- **Mac** (con chip Apple M1/M2/M3/M4): `LimpiaMetadatos-Mac.dmg`. Ábrelo y arrastra
  *Limpia Metadatos* a *Aplicaciones*. La primera vez ábrela con clic derecho → *Abrir*;
  si no deja, ve a *Ajustes del Sistema → Privacidad y seguridad* → *Abrir igualmente*.

La aplicación ya incluye todo lo necesario (también ExifTool): no hay que instalar
nada más. Se abre en su propia ventana, como cualquier otro programa.

### Crear los instaladores

Los instaladores los fabrica GitHub automáticamente cada vez que se cambia algo en
esta carpeta (ver `.github/workflows/instaladores.yml`), y los publica en *Releases*.

### Usarla sin instalar (para desarrollo)

Con Python 3 instalado: doble clic en `iniciar.bat` (Windows) o `iniciar.command`
(Mac/Linux). Así se abre en el navegador. Para la ventana propia:
`pip install -r requirements-escritorio.txt` y `python escritorio.py`.

Si la usas así, conviene instalar [ExifTool](https://exiftool.org) para vídeos y
muchos más formatos (Windows: `winget install OliverBetz.ExifTool`, Mac:
`brew install exiftool`, Linux: `sudo apt install libimage-exiftool-perl`).

## Cómo se usa

1. **Arrastra** tus archivos a la ventana (o haz clic para elegirlos).
2. Cada archivo te dice cuántos datos personales tiene, cuántos son **sensibles**
   y si **revela la ubicación** (GPS).
3. Pulsa **Ver todo**. Tiene tres pestañas:
   - **Resumen**: todo lo que revela el archivo, explicado:
     - **Ubicación** exacta (también la de las fotos que hay *dentro* de un Word o un PDF),
       con enlaces a Google Maps / OpenStreetMap y, si lo pides, el mapa y la dirección.
     - **Fechas y horas** ordenadas (cuándo se hizo, se modificó, se imprimió…).
     - **Personas**: autor, quién lo modificó, quién escribió comentarios o hizo cambios
       con control de cambios, quién lo firmó.
     - **Dispositivo y programas**: marca, modelo, número de serie, objetivo, programas.
     - **Documento por dentro**: comentarios, cambios, plantilla (con la ruta de tu
       ordenador), hojas ocultas, enlaces, adjuntos, macros, JavaScript, fuentes…
     - **Firmas digitales** (quién firmó, cuándo, con qué certificado) y **protecciones**.
     - **Archivo**: tipo real (avisa si la extensión engaña), huellas MD5/SHA, de qué web
       se descargó y sus fechas en tu ordenador.
   - **Todos los datos**: cambia el texto de cualquier dato, quítalo con la papelera o
     **añade** uno nuevo (título, autor, copyright, fecha…). Pulsa *Guardar cambios*.
   - **Herramientas**:
     - **Fechas y horas**: pon todas las fechas en el día y la hora que quieras, o
       adelántalas/atrásalas (años, días, horas, minutos).
     - **Ubicación**: pon una ubicación nueva (pegando las coordenadas de Google Maps),
       cámbiala o quítala.
     - **Desbloquear**: quita las restricciones de PDF, Word, Excel, PowerPoint y
       LibreOffice (no dejar imprimir, copiar o editar) y, si sabes la contraseña para
       abrirlo, también la contraseña.
     - **Quitar firmas** digitales de PDF, Office y LibreOffice.
4. **Limpiar** borra todo de golpe: metadatos, GPS de las fotos que hay dentro de los
   documentos, nombres de quien comentó o hizo cambios, ruta de la plantilla e impresora.
5. **Guarda** el archivo donde quieras (o todos juntos en una carpeta).

Tu archivo original no se toca nunca, y siempre puedes pulsar **Volver al original**.

## Qué se limpia en cada tipo

| Tipo | Qué se quita |
|---|---|
| Fotos (JPG, PNG, HEIC, WebP, TIFF, RAW…) | EXIF, GPS, cámara, XMP, IPTC, comentarios. Se conservan la orientación y el perfil de color para que la foto se vea igual. |
| Vídeos (MP4, MOV…) | Título, autor, ubicación, programa… Las fechas internas del vídeo se ponen a cero. |
| PDF | Ficha del documento (autor, programa…), bloque XMP y datos internos de las páginas. |
| Word, Excel, PowerPoint | Autor, «modificado por», empresa, responsable, plantilla, tiempo de edición, propiedades personalizadas. |
| LibreOffice (ODT, ODS, ODP) | Autor, programa, fechas, veces editado, propiedades personalizadas. |
| Música (MP3, FLAC, OGG, M4A…) | Todas las etiquetas y la portada. |

> Ojo: los metadatos son los datos *ocultos* del archivo. El **contenido** no se
> modifica: si un Word tiene comentarios o control de cambios con tu nombre, o una
> foto muestra algo identificable, eso sigue ahí.

## Si no se abre

- **Windows dice que falta «WebView2»**: instálalo gratis desde
  https://developer.microsoft.com/microsoft-edge/webview2/ (Windows 10 y 11 casi
  siempre lo traen ya).
- **Mac dice que la app está dañada o no se puede abrir**: clic derecho → *Abrir*, o
  *Ajustes del Sistema → Privacidad y seguridad* → *Abrir igualmente*.
- **Otro problema**: haz una captura del mensaje para ver qué pasa.
