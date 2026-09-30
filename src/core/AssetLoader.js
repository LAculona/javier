// Cola de tareas de carga con progreso ponderado. Todo el contenido es
// procedural, así que "cargar" significa: fuentes, texturas generadas,
// geometría del mapa, compilación de shaders y audio.
export class AssetLoader {
  constructor(onProgress) {
    this.tasks = [];
    this.onProgress = onProgress || (() => {});
    this.done = 0;
    this.total = 0;
    this.timings = [];
  }

  add(label, weight, fn) {
    this.tasks.push({ label, weight, fn });
    this.total += weight;
    return this;
  }

  async run() {
    this.onProgress(0, this.tasks[0] ? this.tasks[0].label : '');
    for (const task of this.tasks) {
      this.onProgress(this.done / this.total, task.label);
      // cede el hilo para que la barra de carga se pinte
      await nextFrame();
      const t0 = performance.now();
      await task.fn();
      this.timings.push([task.label, Math.round(performance.now() - t0)]);
      this.done += task.weight;
      this.onProgress(this.done / this.total, task.label);
    }
    await nextFrame();
    this.onProgress(1, 'LISTO');
  }
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function loadFonts(families) {
  if (!document.fonts || !document.fonts.load) return;
  const jobs = [];
  for (const f of families) jobs.push(document.fonts.load(f));
  try {
    await Promise.all(jobs);
    await document.fonts.ready;
  } catch {
    // Si una fuente no carga seguimos con la siguiente de la pila CSS
  }
}
