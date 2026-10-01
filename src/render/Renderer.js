import * as THREE from 'three';

// Envoltorio de WebGLRenderer: resolución de render por preset y resize.
export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = true;
    r.setClearColor(0xf2d6c0, 1);
    r.domElement.id = 'game-canvas';
    r.domElement.tabIndex = 0;
    container.appendChild(r.domElement);

    this.renderScale = 1;
    this.maxPixelRatio = 1;
    this.width = 1;
    this.height = 1;
    this.listeners = [];
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  /**
   * Identifica la GPU para elegir la calidad inicial: software (sin
   * aceleración) → mínima, integrada → baja, dedicada → media.
   */
  detectGpu() {
    const gl = this.renderer.getContext();
    let name = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      name = '';
    }
    name = String(name || '');
    const n = name.toLowerCase();
    const software = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(n);
    const integrated = /intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics|vega \d|apple gpu/.test(n);
    const cores = navigator.hardwareConcurrency || 4;
    const tier = software ? 'minimal' : integrated || cores <= 4 ? 'low' : 'medium';
    this.gpu = { name: name.replace(/^ANGLE \((.*)\)$/, '$1'), software, integrated, tier };
    return this.gpu;
  }

  get canvas() {
    return this.renderer.domElement;
  }

  onResize(fn) {
    this.listeners.push(fn);
  }

  applyPreset(p) {
    this.renderScale = p.renderScale;
    this.maxPixelRatio = p.maxPixelRatio;
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, true);
    for (const fn of this.listeners) fn(w, h);
  }
}
