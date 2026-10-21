"use strict";

const $ = (s) => document.querySelector(s);

// Nombres en español para los metadatos más habituales.
const TRADUCCIONES = {
  GPSLatitude: "Latitud (GPS)", GPSLongitude: "Longitud (GPS)", GPSAltitude: "Altitud (GPS)",
  GPSLatitudeRef: "Latitud N/S (GPS)", GPSLongitudeRef: "Longitud E/O (GPS)",
  GPSAltitudeRef: "Referencia de altitud (GPS)", GPSPosition: "Posición (GPS)",
  GPSTimeStamp: "Hora (GPS)", GPSDateStamp: "Fecha (GPS)", GPSSpeed: "Velocidad (GPS)",
  GPSImgDirection: "Dirección (GPS)", GPSCoordinates: "Coordenadas (GPS)",
  Make: "Marca del dispositivo", Model: "Modelo del dispositivo", LensModel: "Objetivo",
  LensMake: "Marca del objetivo", SerialNumber: "Número de serie", Software: "Programa",
  Artist: "Autor", Creator: "Autor", Author: "Autor", Copyright: "Copyright", Rights: "Derechos",
  Title: "Título", ImageDescription: "Descripción", Description: "Descripción",
  UserComment: "Comentario", Comment: "Comentario", Keywords: "Palabras clave", Subject: "Asunto / palabras clave",
  DateTimeOriginal: "Fecha en que se tomó", CreateDate: "Fecha de creación", ModifyDate: "Fecha de modificación",
  CreationDate: "Fecha de creación", ModDate: "Fecha de modificación", Producer: "Programa que lo generó",
  CreatorTool: "Programa usado", "xmp:CreatorTool": "Programa usado", "pdf:Producer": "Programa que lo generó",
  "xmp:CreateDate": "Fecha de creación", "xmp:ModifyDate": "Fecha de modificación", "xmp:MetadataDate": "Fecha de los metadatos",
  "pdf:Keywords": "Palabras clave", "xmpMM:DocumentID": "Identificador del documento", "xmpMM:InstanceID": "Identificador de versión", OwnerName: "Propietario", HostComputer: "Ordenador",
  Orientation: "Orientación", ColorSpace: "Espacio de color",
  "dc:title": "Título", "dc:subject": "Asunto", "dc:creator": "Autor", "cp:keywords": "Palabras clave",
  "dc:description": "Comentarios", "cp:lastModifiedBy": "Modificado por", "cp:revision": "Número de revisión",
  "dcterms:created": "Fecha de creación", "dcterms:modified": "Fecha de modificación",
  "cp:lastPrinted": "Última impresión", "cp:category": "Categoría", "cp:contentStatus": "Estado",
  "dc:language": "Idioma", Company: "Empresa", Manager: "Responsable", Template: "Plantilla",
  Application: "Aplicación", AppVersion: "Versión de la aplicación", TotalTime: "Minutos de edición",
  "meta:initial-creator": "Autor original", "meta:creation-date": "Fecha de creación",
  "dc:date": "Fecha de modificación", "meta:generator": "Programa", "meta:editing-cycles": "Veces editado",
  "meta:editing-duration": "Tiempo de edición", "meta:keyword": "Palabra clave", "meta:print-date": "Fecha de impresión",
  "meta:printed-by": "Impreso por", "meta:template": "Plantilla",
  title: "Título", artist: "Artista", album: "Álbum", albumartist: "Artista del álbum", date: "Fecha",
  genre: "Género", tracknumber: "Pista", discnumber: "Disco", composer: "Compositor", copyright: "Copyright",
  comment: "Comentario", encodedby: "Codificado por", organization: "Sello / organización",
  FileSize: "Tamaño", FileType: "Tipo", MIMEType: "Tipo MIME", ImageWidth: "Ancho", ImageHeight: "Alto",
  ImageSize: "Dimensiones", Duration: "Duración", Megapixels: "Megapíxeles",
};

const TIPOS = {
  imagen: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp", "avif", "dng", "cr2", "nef", "arw", "raw"],
  video: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp", "wmv"],
  audio: ["mp3", "flac", "ogg", "oga", "opus", "m4a", "aac", "wav", "wma", "aiff", "aif"],
  pdf: ["pdf"],
};

// En la aplicación de escritorio existe window.pywebview.api con diálogos nativos.
let escritorio = false;
let archivoAbierto = null;
let cambios = {};
let nuevos = [];

// ------------------------------------------------------------------ utilidades

function crear(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) el.append(h);
  return el;
}

function tamano(bytes) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i ? 1 : 0).replace(".", ",")} ${u[i]}`;
}

function extension(nombre) {
  const p = nombre.lastIndexOf(".");
  return p > 0 ? nombre.slice(p + 1).toLowerCase() : "";
}

function aviso(texto, tipo = "", accion = null) {
  const el = crear("div", { class: `aviso-flotante ${tipo}` }, crear("span", {}, texto),
    accion ? crear("button", { class: "accion", onclick: () => { accion.alPulsar(); el.remove(); } }, accion.texto) : null);
  $("#avisos").append(el);
  setTimeout(() => el.remove(), tipo === "error" || accion ? 7000 : 3500);
}

async function api(ruta, opciones = {}) {
  document.body.classList.add("cargando");
  try {
    const r = await fetch(ruta, opciones);
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
    return datos;
  } finally {
    document.body.classList.remove("cargando");
  }
}

async function conBoton(boton, tarea) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Un momento…";
  try {
    await tarea();
  } catch (e) {
    aviso(e.message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function chipsEstado(a) {
  if (a.bloqueado) return [crear("span", { class: "chip sensible" }, "🔒 Protegido con contraseña")];
  if (!a.compatible) return [crear("span", { class: "chip error" }, a.error || "No compatible")];
  const chips = [];
  if (a.personales === 0) {
    chips.push(crear("span", { class: "chip limpio" }, "✓ Sin datos personales"));
  } else {
    chips.push(crear("span", { class: "chip" }, plural(a.personales, "dato personal", "datos personales")));
    if (a.sensibles) chips.push(crear("span", { class: "chip sensible" }, plural(a.sensibles, "sensible", "sensibles")));
  }
  if (a.gps) chips.push(crear("span", { class: "chip gps" }, "📍 Revela la ubicación"));
  if (a.modificado) chips.push(crear("span", { class: "chip" }, "Modificado"));
  return chips;
}

// ------------------------------------------------------------------ lista de archivos

const lista = new Map();

function pintarLista() {
  const ul = $("#lista");
  ul.replaceChildren();
  for (const a of lista.values()) {
    const ext = extension(a.nombre);
    const tipo = Object.keys(TIPOS).find((t) => TIPOS[t].includes(ext)) || "";
    ul.append(crear("li", { class: "archivo" },
      crear("div", { class: `tipo ${tipo}` }, (ext || "?").slice(0, 4)),
      crear("div", { class: "datos-archivo" },
        crear("div", { class: "nombre", title: a.nombre }, a.nombre),
        crear("div", { class: "detalles" }, crear("span", {}, tamano(a.tamano)), chipsEstado(a)),
      ),
      crear("div", { class: "botones-archivo" },
        a.bloqueado
          ? crear("button", { class: "boton peque aviso", onclick: () => abrirEditor(a.id) }, "🔓 Desbloquear")
          : crear("button", { class: "boton peque", disabled: !a.compatible, onclick: () => abrirEditor(a.id) }, "Ver todo"),
        crear("button", {
          class: "boton peque principal", disabled: !a.compatible || a.personales === 0,
          onclick: (e) => conBoton(e.currentTarget, () => limpiarArchivo(a.id)),
        }, "Limpiar"),
        botonDescargar(a.id, "boton peque"),
      ),
      crear("button", { class: "icono", title: "Quitar de la lista", "aria-label": "Quitar de la lista", onclick: () => quitarArchivo(a.id) }, "✕"),
    ));
  }
  const hay = lista.size > 0;
  $("#panel-archivos").hidden = !hay;
  $("#lista-vacia").hidden = hay;
  $("#zona").classList.toggle("compacta", hay);
  const pendientes = [...lista.values()].filter((a) => a.compatible && a.personales > 0).length;
  $("#titulo-lista").textContent = hay
    ? `${plural(lista.size, "archivo", "archivos")}${pendientes ? ` · ${pendientes} con datos personales` : " · todo limpio ✓"}`
    : "Archivos";
  $("#btn-limpiar-todos").disabled = pendientes === 0;
}

function actualizar(a) {
  lista.set(a.id, a);
  pintarLista();
}

async function subir(ficheros) {
  if (!ficheros.length) return;
  const datos = new FormData();
  for (const f of ficheros) {
    datos.append("archivos", f);
    datos.append("modificados", String(f.lastModified || ""));
  }
  aviso(`Analizando ${plural(ficheros.length, "archivo", "archivos")}…`);
  try {
    recibirSubidos(await api("/api/subir", { method: "POST", body: datos }));
  } catch (e) {
    aviso(e.message, "error");
  }
}

let ultimaRecepcion = 0;

function recibirSubidos(nuevosArchivos) {
  ultimaRecepcion = Date.now();
  nuevosArchivos.forEach(actualizar);
  const conDatos = nuevosArchivos.filter((a) => a.personales > 0).length;
  if (conDatos) aviso(`${plural(conDatos, "archivo tiene", "archivos tienen")} datos personales.`);
  else aviso("Ninguno tiene datos personales.", "ok");
}

// Botón de descarga: en el navegador es un enlace; en la aplicación abre «Guardar como…».
function botonDescargar(id, clase, idElemento) {
  return crear("a", {
    class: clase, id: idElemento, href: `/api/archivo/${id}/descargar`,
    onclick: (e) => {
      if (!escritorio) return;
      e.preventDefault();
      conBoton(e.currentTarget, async () => {
        const r = await window.pywebview.api.guardar(id);
        if (r.error) aviso(r.error, "error");
        else if (r.ok) aviso("Archivo guardado.", "ok", { texto: "Mostrar", alPulsar: () => window.pywebview.api.mostrar(r.ruta) });
      });
    },
  }, escritorio ? "Guardar…" : "Descargar");
}

function activarEscritorio() {
  if (escritorio) return;
  escritorio = true;
  $("#btn-descargar-todos").textContent = "Guardar todos en una carpeta…";
  $("#paso-3").textContent = "Guarda el archivo ya limpio donde quieras. El original nunca se modifica.";
  pintarLista();
  if (archivoAbierto) pintarEditor();
}

async function limpiarArchivo(id) {
  const a = await api(`/api/archivo/${id}/limpiar`, { method: "POST" });
  actualizar(a);
  aviso(a.personales === 0 ? `«${a.nombre}» está limpio. Ya puedes ${escritorio ? "guardarlo" : "descargarlo"}.` : `Se limpió lo posible de «${a.nombre}».`, "ok");
  return a;
}

async function quitarArchivo(id) {
  await api(`/api/archivo/${id}`, { method: "DELETE" });
  lista.delete(id);
  pintarLista();
}

// ------------------------------------------------------------------ editor

function nombreBonito(d) {
  return TRADUCCIONES[d.nombre] || d.nombre;
}

function pintarEditor() {
  const a = archivoAbierto;
  $("#ed-nombre").textContent = a.nombre;
  $("#ed-resumen").replaceChildren(crear("span", {}, `${tamano(a.tamano)} · ${a.motor || ""}`), ...chipsEstado(a));
  $("#ed-descargar").replaceWith(botonDescargar(a.id, "boton", "ed-descargar"));
  $(".editor-acciones").hidden = !!a.bloqueado;
  $(".pestanas").hidden = !!a.bloqueado;
  if (a.bloqueado) {
    mostrarPestana("herramientas");
    pintarHerramientas();
    return;
  }
  $("#ed-limpiar").disabled = a.personales === 0;
  $("#ed-gps").hidden = !a.gps;
  $("#ed-sensibles").hidden = !a.sensibles;
  $("#ed-restaurar").hidden = !a.modificado;

  const filtro = $("#ed-buscar").value.trim().toLowerCase();
  const coincide = (d) => !filtro || [d.nombre, nombreBonito(d), d.grupo, d.valor].some((t) => String(t).toLowerCase().includes(filtro));

  const personales = a.metadatos.filter((d) => d.seccion === "personal");
  const conValor = personales.filter((d) => !d.vacio).length;
  const tecnicos = a.metadatos.filter((d) => d.seccion === "tecnico");
  $("#ed-cuenta").textContent = `(${conValor})`;
  $("#ed-cuenta-tecnica").textContent = `(${tecnicos.length})`;

  // Primero los sensibles y al final los campos vacíos.
  personales.sort((x, y) => (y.sensible - x.sensible) || (x.vacio - y.vacio));
  const contenedor = $("#ed-personales");
  contenedor.replaceChildren();
  if (!conValor && !personales.some((d) => d.editable)) {
    contenedor.replaceWith(crear("div", { id: "ed-personales", class: "vacia" }, "✓ Este archivo no tiene datos personales."));
  } else {
    if (!contenedor.classList.contains("tabla")) contenedor.className = "tabla";
    personales.filter(coincide).forEach((d) => contenedor.append(filaPersonal(d)));
    if (!contenedor.children.length) contenedor.append(crear("div", { class: "fila" }, crear("span", { class: "texto" }, "Nada coincide con la búsqueda.")));
  }

  const tablaTecnica = $("#ed-tecnicos");
  tablaTecnica.className = "tabla tecnica";
  tablaTecnica.replaceChildren(...tecnicos.filter(coincide).map((d) => crear("div", { class: "fila" },
    crear("div", { class: "etiqueta" }, crear("span", {}, nombreBonito(d), crear("span", { class: "grupo" }, `${d.grupo} · ${d.nombre}`))),
    crear("div", { class: "texto" }, d.valor),
  )));

  // Bloque de añadir
  const puedeAnadir = a.campos.length > 0 || a.personalizado;
  $("#ed-bloque-anadir").hidden = !puedeAnadir;
  const select = $("#ed-campo");
  const anterior = select.value;
  select.replaceChildren(
    ...a.campos.map((c) => crear("option", { value: c.clave }, c.etiqueta)),
    a.personalizado ? crear("option", { value: "otro" }, "Otro (escribir nombre)…") : null,
  );
  if ([...select.options].some((o) => o.value === anterior)) select.value = anterior;
  cambiarCampo();
  pintarNuevos();
  pintarPie();
}

function filaPersonal(d) {
  const fila = crear("div", { class: "fila" });
  const borrada = cambios[d.clave] === null;
  const cambiada = d.clave in cambios && !borrada;
  fila.classList.toggle("borrada", borrada);
  fila.classList.toggle("cambiada", cambiada);

  const etiqueta = crear("div", { class: "etiqueta" },
    d.sensible ? crear("span", { class: "punto", title: "Dato sensible" }) : null,
    crear("span", {}, nombreBonito(d), crear("span", { class: "grupo" }, `${d.grupo} · ${d.nombre}`)),
  );

  let valor;
  if (d.editable) {
    valor = crear("input", {
      type: "text", value: cambiada ? cambios[d.clave] : d.valor, disabled: borrada,
      placeholder: "(vacío)", "aria-label": nombreBonito(d),
    });
    valor.addEventListener("input", () => {
      if (valor.value === d.valor) delete cambios[d.clave];
      else cambios[d.clave] = valor.value;
      fila.classList.toggle("cambiada", d.clave in cambios);
      pintarPie();
    });
  } else {
    valor = crear("div", { class: "texto" }, d.valor);
  }

  const papelera = crear("button", {
    class: "icono",
    title: borrada ? "Deshacer" : "Quitar este dato",
    "aria-label": borrada ? "Deshacer" : "Quitar este dato",
    onclick: () => {
      if (cambios[d.clave] === null) delete cambios[d.clave];
      else cambios[d.clave] = null;
      fila.replaceWith(filaPersonal(d));
      pintarPie();
    },
  });
  papelera.innerHTML = borrada
    ? '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  if (!d.borrable) papelera.style.visibility = "hidden";

  fila.append(etiqueta, valor, papelera);
  return fila;
}

function cambiarCampo() {
  const campo = $("#ed-campo").value;
  $("#ed-campo-otro").hidden = campo !== "otro";
  const valor = $("#ed-valor");
  const tipo = campo === "fecha" ? "datetime-local" : "text";
  if (valor.type !== tipo) { valor.type = tipo; valor.value = ""; }
  valor.placeholder = campo === "palabras_clave" ? "Separadas por comas" : "Valor";
}

function anadirNuevo() {
  const select = $("#ed-campo");
  let campo = select.value;
  let etiqueta = select.selectedOptions[0]?.textContent || campo;
  const valor = $("#ed-valor").value.trim();
  if (campo === "otro") {
    const nombre = $("#ed-campo-otro").value.trim();
    if (!/^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/.test(nombre)) {
      aviso("Escribe el nombre del dato sin espacios ni tildes (por ejemplo: Artist o XMP:Label).", "error");
      $("#ed-campo-otro").focus();
      return;
    }
    campo = `otro:${nombre}`;
    etiqueta = nombre;
  }
  if (!valor) {
    aviso("Escribe un valor para el dato.", "error");
    $("#ed-valor").focus();
    return;
  }
  nuevos.push({ campo, etiqueta, valor });
  $("#ed-valor").value = "";
  $("#ed-campo-otro").value = "";
  pintarNuevos();
  pintarPie();
}

function pintarNuevos() {
  $("#ed-nuevos").replaceChildren(...nuevos.map((n, i) => crear("li", {},
    crear("span", {}, crear("b", {}, `${n.etiqueta}: `), n.valor.replace("T", " ")),
    crear("button", { class: "icono", title: "Quitar", "aria-label": "Quitar", onclick: () => { nuevos.splice(i, 1); pintarNuevos(); pintarPie(); } }, "✕"),
  )));
}

function numeroPendientes() {
  return Object.keys(cambios).length + nuevos.length;
}

function pintarPie() {
  const n = numeroPendientes();
  $("#ed-pie").hidden = n === 0;
  $("#ed-pendientes").textContent = `${plural(n, "cambio sin guardar", "cambios sin guardar")}`;
}

async function abrirEditor(id) {
  try {
    archivoAbierto = await api(`/api/archivo/${id}`);
  } catch (e) {
    aviso(e.message, "error");
    return;
  }
  cambios = {};
  nuevos = [];
  informeActual = null;
  $("#ed-buscar").value = "";
  mostrarPestana("resumen");
  pintarEditor();
  cargarInforme();
  $("#fondo").hidden = false;
  $("#editor").hidden = false;
  $("#ed-buscar").blur();
}

function cerrarEditor(forzar = false) {
  if (!forzar && numeroPendientes() && !confirm("Tienes cambios sin guardar. ¿Cerrar de todas formas?")) return;
  $("#fondo").hidden = true;
  $("#editor").hidden = true;
  archivoAbierto = null;
}

function recibir(a) {
  archivoAbierto = a;
  cambios = {};
  nuevos = [];
  actualizar(a);
  pintarEditor();
  cargarInforme();
}

async function guardar() {
  const a = await api(`/api/archivo/${archivoAbierto.id}/editar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cambios, nuevos: nuevos.map(({ campo, valor }) => ({ campo, valor })) }),
  });
  recibir(a);
  aviso("Cambios guardados.", "ok");
}

function marcarParaBorrar(condicion) {
  archivoAbierto.metadatos
    .filter((d) => d.seccion === "personal" && d.borrable && condicion(d))
    .forEach((d) => { cambios[d.clave] = null; });
}

// ------------------------------------------------------------------ resumen (informe completo)

let informeActual = null;
const ICONOS = {
  ubicacion: "📍", dispositivo: "📱", persona: "👤", fecha: "🕒", programa: "💻", comentario: "💬",
  documento: "📄", peligro: "⚠️", firma: "✍️", candado: "🔒", imagen: "🖼️", carpeta: "📁",
  correo: "✉️", internet: "🌐", camara: "📷", contenido: "🎞️", archivo: "🗂️", lugar: "🗺️",
};

function mostrarPestana(nombre) {
  document.querySelectorAll(".pestana").forEach((b) => b.classList.toggle("activa", b.dataset.panel === nombre));
  for (const panel of ["resumen", "datos", "herramientas"]) $(`#panel-${panel}`).hidden = panel !== nombre;
}

async function cargarInforme() {
  const a = archivoAbierto;
  if (!a || a.bloqueado) return;
  $("#ed-informe").replaceChildren(crear("div", { class: "cargando-informe" }, "Analizando el archivo a fondo…"));
  try {
    const informe = await api(`/api/archivo/${a.id}/informe`);
    if (archivoAbierto?.id !== a.id) return;
    informeActual = informe;
    pintarInforme();
    pintarHerramientas();
  } catch (e) {
    $("#ed-informe").replaceChildren(crear("div", { class: "vacia error" }, e.message));
  }
}

function tarjeta(titulo, icono, ...contenido) {
  return crear("section", { class: "tarjeta" },
    crear("h3", {}, crear("span", { class: "icono-tarjeta" }, ICONOS[icono] || "•"), titulo), ...contenido);
}

function filas(lista) {
  return crear("dl", { class: "filas" }, ...lista.flatMap(([k, v]) => [crear("dt", {}, k), crear("dd", {}, String(v))]));
}

function enlaceExterno(texto, url) {
  return crear("a", { href: url, target: "_blank", rel: "noopener", class: "enlace" }, texto);
}

function pintarInforme() {
  const inf = informeActual;
  const cont = $("#ed-informe");
  cont.replaceChildren();

  // Lo más importante, en frases
  cont.append(tarjeta("Qué revela este archivo", "peligro", inf.avisos.length
    ? crear("ul", { class: "avisos-lista" }, ...inf.avisos.map((x) =>
      crear("li", { class: `aviso-${x.tipo}` }, crear("span", { class: "icono-aviso" }, ICONOS[x.tipo] || "•"), crear("span", {}, x.texto))))
    : crear("div", { class: "vacia" }, "✓ No hemos encontrado nada que revele datos personales.")));

  if (inf.ubicacion) cont.append(tarjetaUbicacion(inf.ubicacion));

  if (inf.fechas.length) {
    cont.append(tarjeta("Fechas y horas", "fecha", crear("ol", { class: "linea-tiempo" }, ...inf.fechas.map((f) =>
      crear("li", {}, crear("b", {}, f.valor), crear("span", {}, f.etiqueta), crear("small", {}, f.origen))))));
  }

  for (const s of inf.secciones) {
    if (s.titulo === "Archivo") continue;
    cont.append(tarjeta(s.titulo, s.icono, filas(s.filas)));
  }

  for (const f of inf.firmas) {
    const lista = [["Tipo", f.tipo], ["Firmado por", f.firmante || f.nombre], ["Identificador", f.identificador],
      ["Correo", f.correo], ["Fecha de la firma", f.fecha], ["Motivo", f.motivo], ["Lugar", f.lugar],
      ["Certificado emitido por", f.emisor], ["Certificado válido", f.valido]].filter(([, v]) => v);
    cont.append(tarjeta("Firma digital", "firma", filas(lista)));
  }

  if (inf.imagenes_internas.length) {
    cont.append(tarjeta(`Imágenes dentro del documento (${inf.imagenes_internas.length})`, "imagen",
      crear("div", { class: "imagenes" }, ...inf.imagenes_internas.map((img) => crear("div", { class: "imagen-interna" },
        crear("b", {}, img.nombre),
        img.camara ? crear("span", {}, `📷 ${img.camara}`) : null,
        img.fecha ? crear("span", {}, `🕒 ${img.fecha}`) : null,
        img.programa ? crear("span", {}, `💻 ${img.programa}`) : null,
        img.gps
          ? enlaceExterno(`📍 ${img.gps.lat.toFixed(5)}, ${img.gps.lon.toFixed(5)}`, `https://www.google.com/maps?q=${img.gps.lat},${img.gps.lon}`)
          : crear("span", { class: "suave" }, "Sin ubicación"),
      )))));
  }

  const archivo = inf.secciones.find((s) => s.titulo === "Archivo");
  if (archivo) cont.append(tarjeta("Archivo", "archivo", filas(archivo.filas)));
}

function tarjetaUbicacion(u) {
  const zonaMapa = crear("div", { class: "mapa" });
  const direccion = crear("div", { class: "direccion" });
  const datos = [["Coordenadas", u.texto], ["De dónde sale", u.fuente]];
  if (u.alt !== undefined) datos.push(["Altitud", `${u.alt} m`]);
  if (u.direccion !== undefined) datos.push(["Hacia dónde miraba", `${Math.round(u.direccion)}°`]);
  if (u.precision !== undefined) datos.push(["Precisión", `± ${u.precision} m`]);
  const boton = crear("button", {
    class: "boton",
    onclick: (e) => conBoton(e.currentTarget, async () => {
      const d = 0.004;
      zonaMapa.replaceChildren(crear("iframe", {
        title: "Mapa", loading: "lazy",
        src: `https://www.openstreetmap.org/export/embed.html?bbox=${u.lon - d},${u.lat - d},${u.lon + d},${u.lat + d}&layer=mapnik&marker=${u.lat},${u.lon}`,
      }));
      try {
        const r = await api(`/api/lugar?lat=${u.lat}&lon=${u.lon}`);
        direccion.replaceChildren(crear("b", {}, "Dirección aproximada: "), r.direccion || "desconocida");
      } catch (error) {
        direccion.replaceChildren(error.message);
      }
      boton.hidden = true;
    }),
  }, "Ver mapa y dirección");
  return tarjeta("Ubicación", "ubicacion",
    filas(datos),
    crear("div", { class: "botonera" }, boton, enlaceExterno("Abrir en Google Maps", u.google), enlaceExterno("Abrir en OpenStreetMap", u.osm)),
    crear("p", { class: "ayuda" }, "El mapa y la dirección se piden a OpenStreetMap solo si pulsas el botón (necesita internet)."),
    direccion, zonaMapa);
}

// ------------------------------------------------------------------ herramientas

async function herramienta(ruta, cuerpo) {
  const r = await fetch(`/api/archivo/${archivoAbierto.id}/${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(datos.error || `Error ${r.status}`);
    error.necesitaContrasena = datos.necesita_contrasena;
    throw error;
  }
  recibir(datos);
  if (datos.mensaje) aviso(datos.mensaje, "ok");
  return datos;
}

function campo(etiqueta, control) {
  return crear("label", { class: "campo" }, crear("span", {}, etiqueta), control);
}

function pintarHerramientas() {
  const cont = $("#ed-herramientas");
  const a = archivoAbierto;
  cont.replaceChildren();

  if (a.bloqueado) {
    cont.append(herramientaDesbloquear({ cifrado: "Necesita contraseña para abrirse" }, true));
    return;
  }
  if (!informeActual) {
    cont.append(crear("div", { class: "cargando-informe" }, "Cargando…"));
    return;
  }
  const cap = informeActual.capacidades;
  cont.append(herramientaFechas(cap));
  if (cap.ubicacion) cont.append(herramientaUbicacion());
  if (cap.desbloquear) cont.append(herramientaDesbloquear(informeActual.proteccion, false));
  if (cap.firmas) cont.append(herramientaFirmas());
}

function herramientaFechas(cap) {
  if (!cap.fechas) {
    return tarjeta("Fechas y horas", "fecha", crear("p", { class: "ayuda" },
      "Este archivo no tiene fechas que se puedan cambiar. Puedes añadir una en «Todos los datos» → «Añadir un dato» → «Fecha de creación»."));
  }
  const ahora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const fecha = crear("input", { type: "datetime-local", value: ahora, step: 1 });
  const signo = crear("select", {}, crear("option", { value: "+" }, "Adelantar"), crear("option", { value: "-" }, "Atrasar"));
  const num = (ph) => crear("input", { type: "number", min: 0, step: 1, placeholder: ph, class: "corto" });
  const anios = num("0"), dias = num("0"), horas = num("0"), minutos = num("0");
  const tambienArchivo = crear("input", { type: "checkbox" });
  const modoFijar = crear("input", { type: "radio", name: "modo-fechas", checked: true });
  const modoMover = crear("input", { type: "radio", name: "modo-fechas" });
  const listaFechas = (informeActual.fechas || []).filter((f) => f.editable);
  return tarjeta("Fechas y horas", "fecha",
    crear("p", { class: "ayuda" }, `Cambia de golpe las ${cap.fechas} fecha(s) guardadas dentro del archivo` +
      (listaFechas.length ? `: ${listaFechas.map((f) => f.etiqueta.toLowerCase()).join(", ")}.` : ".") +
      " Cada una conserva su formato y su zona horaria."),
    crear("label", { class: "opcion" }, modoFijar, crear("span", {}, "Poner todas en esta fecha y hora:")),
    crear("div", { class: "fila-campos" }, fecha),
    crear("label", { class: "opcion" }, modoMover, crear("span", {}, "Adelantar o atrasar todas:")),
    crear("div", { class: "fila-campos" }, signo, campo("años", anios), campo("días", dias), campo("horas", horas), campo("minutos", minutos)),
    escritorio ? crear("label", { class: "opcion" }, tambienArchivo,
      crear("span", {}, "Poner también esa fecha al archivo en tu ordenador al guardarlo")) : null,
    crear("div", { class: "botonera" }, crear("button", {
      class: "boton principal",
      onclick: (e) => conBoton(e.currentTarget, () => herramienta("fechas", modoFijar.checked
        ? { modo: "fijar", fecha: fecha.value, archivo: tambienArchivo.checked }
        : { modo: "desplazar", signo: signo.value, anios: anios.value, dias: dias.value, horas: horas.value, minutos: minutos.value })),
    }, "Cambiar fechas")));
}

function herramientaUbicacion() {
  const u = informeActual.ubicacion;
  const pegado = crear("input", { type: "text", placeholder: "Pega aquí las coordenadas, p. ej. 40.4168, -3.7038" });
  const lat = crear("input", { type: "text", placeholder: "Latitud", value: u ? u.lat : "" });
  const lon = crear("input", { type: "text", placeholder: "Longitud", value: u ? u.lon : "" });
  const alt = crear("input", { type: "text", placeholder: "Altitud (m, opcional)", value: u?.alt ?? "" });
  return tarjeta("Ubicación", "ubicacion",
    crear("p", { class: "ayuda" }, u ? `Ahora mismo: ${u.texto}.` : "Ahora mismo no tiene ubicación."),
    crear("p", { class: "ayuda" }, "Para sacar coordenadas en Google Maps: clic derecho sobre el sitio y pulsa en los números que aparecen arriba (se copian solos)."),
    crear("div", { class: "fila-campos" }, pegado),
    crear("div", { class: "fila-campos" }, lat, lon, alt),
    crear("div", { class: "botonera" },
      crear("button", {
        class: "boton principal",
        onclick: (e) => conBoton(e.currentTarget, () => herramienta("ubicacion",
          pegado.value.trim() ? { pegado: pegado.value } : { lat: lat.value, lon: lon.value, alt: alt.value })),
      }, u ? "Cambiar ubicación" : "Poner ubicación"),
      u ? crear("button", { class: "boton aviso", onclick: (e) => conBoton(e.currentTarget, () => herramienta("ubicacion", { quitar: true })) }, "Quitar ubicación") : null));
}

function herramientaDesbloquear(proteccion, pideContrasena) {
  const protegido = proteccion && (proteccion.cifrado || (proteccion.restricciones || []).length);
  const contrasena = crear("input", { type: "password", placeholder: "Contraseña para abrirlo", autocomplete: "off" });
  const zonaContrasena = crear("div", { class: "fila-campos", hidden: !pideContrasena }, contrasena);
  const desbloquear = async () => {
    try {
      await herramienta("desbloquear", { contrasena: contrasena.value });
    } catch (e) {
      if (e.necesitaContrasena) {
        zonaContrasena.hidden = false;
        contrasena.focus();
      }
      throw e;
    }
  };
  contrasena.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-desbloquear")?.click(); });
  return tarjeta("Desbloquear", "candado",
    crear("p", { class: "ayuda" }, protegido
      ? "Estado: " + [proteccion.cifrado, ...(proteccion.restricciones || [])].filter(Boolean).join("; ") + "."
      : "No tiene contraseña ni restricciones."),
    crear("p", { class: "ayuda" }, "Quita las restricciones (no dejar imprimir, copiar, editar…) y, si sabes la contraseña para abrirlo, también la contraseña."),
    zonaContrasena,
    crear("div", { class: "botonera" }, crear("button", {
      id: "btn-desbloquear", class: "boton principal", disabled: !protegido && !pideContrasena,
      onclick: (e) => conBoton(e.currentTarget, desbloquear),
    }, "Desbloquear")));
}

function herramientaFirmas() {
  const firmas = informeActual.firmas;
  return tarjeta("Firmas digitales", "firma",
    crear("p", { class: "ayuda" }, firmas.length
      ? `Firmado por: ${firmas.map((f) => f.firmante || f.nombre || "desconocido").join(", ")}.`
      : "No tiene firmas digitales."),
    firmas.length ? crear("p", { class: "ayuda" }, "Al quitar la firma, el documento deja de demostrar quién lo firmó. Úsalo solo con documentos tuyos.") : null,
    crear("div", { class: "botonera" }, crear("button", {
      class: "boton aviso", disabled: !firmas.length,
      onclick: (e) => conBoton(e.currentTarget, async () => {
        if (!confirm("¿Quitar las firmas digitales de este documento?")) return;
        await herramienta("quitar-firmas");
      }),
    }, "Quitar firmas")));
}

// ------------------------------------------------------------------ eventos

function iniciar() {
  const selector = $("#selector");
  selector.addEventListener("change", () => { subir([...selector.files]); selector.value = ""; });

  // Arrastrar y soltar en cualquier parte de la ventana.
  let profundidad = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    profundidad++;
    $("#soltar").hidden = false;
  });
  window.addEventListener("dragleave", () => {
    profundidad = Math.max(0, profundidad - 1);
    if (!profundidad) $("#soltar").hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    profundidad = 0;
    $("#soltar").hidden = true;
    const ficheros = [...(e.dataTransfer?.files || [])];
    if (!escritorio) { subir(ficheros); return; }
    // En la aplicación, Python recibe los archivos con su ruta real (fechas y procedencia).
    // Si en 2 segundos no han llegado así, se suben de la forma normal.
    const momento = Date.now();
    setTimeout(() => { if (ultimaRecepcion < momento) subir(ficheros); }, 2000);
  });

  $("#btn-limpiar-todos").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
    const r = await api("/api/limpiar-todos", { method: "POST" });
    r.archivos.forEach((a) => lista.set(a.id, a));
    pintarLista();
    if (r.errores.length) aviso(`Algunos no se pudieron limpiar: ${r.errores.join(" · ")}`, "error");
    else aviso(`Todos los archivos están limpios. Ya puedes ${escritorio ? "guardarlos" : "descargarlos"}.`, "ok");
  }));
  $("#btn-descargar-todos").addEventListener("click", (e) => {
    if (!escritorio) { location.href = "/api/descargar-todos"; return; }
    conBoton(e.currentTarget, async () => {
      const r = await window.pywebview.api.guardar_todos();
      if (r.ok) aviso(`${plural(r.total, "archivo guardado", "archivos guardados")}.`, "ok", { texto: "Abrir carpeta", alPulsar: () => window.pywebview.api.mostrar(r.ruta) });
    });
  });
  $("#zona").addEventListener("click", async (e) => {
    if (!escritorio) return; // en el navegador se usa el selector normal
    e.preventDefault();
    try {
      const nuevosArchivos = await window.pywebview.api.elegir_archivos();
      if (nuevosArchivos.length) recibirSubidos(nuevosArchivos);
    } catch (error) {
      aviso(String(error.message || error), "error");
    }
  });
  if (window.pywebview?.api) activarEscritorio();
  else window.addEventListener("pywebviewready", activarEscritorio);
  $("#btn-quitar-todos").addEventListener("click", async () => {
    if (!confirm("¿Quitar todos los archivos de la lista?")) return;
    await api("/api/archivos", { method: "DELETE" });
    lista.clear();
    pintarLista();
  });

  // Editor
  $("#ed-cerrar").addEventListener("click", () => cerrarEditor());
  $("#fondo").addEventListener("click", () => cerrarEditor());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && archivoAbierto) cerrarEditor();
  });
  $("#ed-buscar").addEventListener("input", pintarEditor);
  $("#ed-campo").addEventListener("change", cambiarCampo);
  $("#ed-anadir").addEventListener("click", anadirNuevo);
  $("#ed-valor").addEventListener("keydown", (e) => { if (e.key === "Enter") anadirNuevo(); });
  $("#ed-descartar").addEventListener("click", () => { cambios = {}; nuevos = []; pintarEditor(); });
  $("#ed-guardar").addEventListener("click", (e) => conBoton(e.currentTarget, guardar));
  $("#ed-limpiar").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
    recibir(await limpiarArchivo(archivoAbierto.id));
  }));
  $("#ed-gps").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
    if (archivoAbierto.motor === "ExifTool") {
      await herramienta("ubicacion", { quitar: true });
      return;
    }
    marcarParaBorrar((d) => /gps|location|geotag/i.test(d.clave));
    await guardar();
  }));
  document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => mostrarPestana(b.dataset.panel)));
  $("#ed-sensibles").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
    marcarParaBorrar((d) => d.sensible);
    await guardar();
  }));
  $("#ed-restaurar").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
    if (!confirm("Se desharán todos los cambios y el archivo volverá a estar como lo subiste. ¿Continuar?")) return;
    recibir(await api(`/api/archivo/${archivoAbierto.id}/restaurar`, { method: "POST" }));
    aviso("Archivo restaurado al original.", "ok");
  }));

  api("/api/estado").then((r) => {
    const p = $("#estado-exiftool");
    if (r.exiftool) {
      p.textContent = `ExifTool ${r.exiftool} · todos los formatos`;
      p.className = "pastilla ok";
    } else {
      p.textContent = "Sin ExifTool · formatos limitados";
      p.className = "pastilla mal";
      p.title = "Instala ExifTool para editar fotos y abrir vídeos y otros formatos (mira el archivo LEEME).";
    }
  }).catch(() => {});

  api("/api/archivos").then((a) => a.forEach((x) => lista.set(x.id, x))).finally(pintarLista);
}

iniciar();
