# Limpia Metadatos

Aplicación personal para **ver, borrar, editar y añadir metadatos** de tus archivos:
fotos, vídeos, PDF, Word, Excel, PowerPoint, LibreOffice y música.

Funciona **en tu propio ordenador**: tus archivos no se suben a internet y la
aplicación solo es accesible desde tu equipo. Al cerrarla se borra todo lo temporal.

## Cómo abrirla

| Sistema | Qué hacer |
|---|---|
| **Windows** | Doble clic en `iniciar.bat` |
| **Mac** | Doble clic en `iniciar.command` (la primera vez: clic derecho → Abrir) |
| **Linux** | `./iniciar.command` en una terminal |

Se abrirá el navegador solo. Para cerrar la aplicación, cierra la ventana negra.

La primera vez tarda un poco porque prepara lo que necesita. Solo hace falta tener
**Python 3** instalado (en Windows, marca la casilla *Add python.exe to PATH* al instalarlo).

### ExifTool (recomendado)

[ExifTool](https://exiftool.org) es el programa que permite trabajar con **vídeos y
casi cualquier formato**. En Windows, el lanzador te ofrece instalarlo la primera vez.
También puedes hacerlo a mano:

- Windows: `winget install OliverBetz.ExifTool`, o descarga el `.zip` de exiftool.org,
  renombra `exiftool(-k).exe` a `exiftool.exe` y ponlo (con su carpeta `exiftool_files`)
  dentro de esta carpeta.
- Mac: `brew install exiftool`
- Linux: `sudo apt install libimage-exiftool-perl`

Sin ExifTool siguen funcionando PDF, Office, LibreOffice y música, y las fotos se
pueden ver y limpiar (pero no editar).

## Cómo se usa

1. **Arrastra** tus archivos a la ventana (o haz clic para elegirlos).
2. Cada archivo te dice cuántos datos personales tiene, cuántos son **sensibles**
   y si **revela la ubicación** (GPS).
3. Elige:
   - **Limpiar**: borra todos los metadatos de golpe.
   - **Ver y editar**: cambia el texto de cualquier dato, quítalo con la papelera
     o **añade** uno nuevo (título, autor, copyright, fecha…). Pulsa *Guardar cambios*.
   - Atajos dentro del editor: **Quitar solo la ubicación** y **Quitar los datos sensibles**.
4. **Descarga** el archivo (o todos juntos en un `.zip`).

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
