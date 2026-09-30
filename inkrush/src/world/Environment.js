// Sky, lighting, skyline and non-paintable decoration for the arena.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TEAM, TEAM_INFO } from '../core/config.js';

export function createDetailTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 232 + Math.random() * 23;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  g.putImageData(img, 0, 0);
  // Panel seams
  g.strokeStyle = 'rgba(70,75,95,0.55)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, s - 3, s - 3);
  g.strokeStyle = 'rgba(70,75,95,0.22)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  // Bolts
  g.fillStyle = 'rgba(60,64,84,0.45)';
  for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12]]) {
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  // Grime
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(90,95,120,${0.03 + Math.random() * 0.05})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 8 + Math.random() * 26, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b3a8f) },
      mid: { value: new THREE.Color(0xb58ce0) },
      bottom: { value: new THREE.Color(0xffc49a) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.7, h)) : mix(bottom, mid, smoothstep(-0.1, 0.08, h));
      float sun = pow(max(dot(vP, normalize(vec3(0.5,0.35,-0.6))), 0.0), 60.0);
      c += vec3(1.0,0.85,0.6) * sun * 0.8;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function textCanvas(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.font = '900 96px "Bungee", "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg;
  g.fillText(text, 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.animated = [];

    scene.background = new THREE.Color(0x8f7fd0);
    scene.fog = new THREE.Fog(0xb89bd8, 90, 260);
    scene.add(makeSky());

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a7a, 1.1);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.set(30, 60, 25);
    sun.target.position.set(0, 0, 0);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.buildSkyline();
    this.buildDecor();
  }

  setShadows(enabled, size) {
    this.sun.castShadow = enabled;
    if (enabled && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  buildSkyline() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b4f8e, roughness: 0.9 });
    const count = 70;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const palette = [0x5b4f8e, 0x6c5fa6, 0x4c5a92, 0x7a6aa8, 0x3f4a7c];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.05;
      const r = 85 + Math.random() * 45;
      const w = 8 + Math.random() * 14, h = 14 + Math.random() * 45, d = 8 + Math.random() * 14;
      m.compose(new THREE.Vector3(Math.cos(a) * r, -1, Math.sin(a) * r * 1.2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)),
        new THREE.Vector3(w, h, d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(palette[i % palette.length]));
    }
    this.scene.add(mesh);

    // Glowing window strips on the skyline
    const stripGeo = new THREE.BoxGeometry(1, 0.35, 1);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe9b8, fog: true });
    const strips = new THREE.InstancedMesh(stripGeo, stripMat, 160);
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 40;
      m.compose(new THREE.Vector3(Math.cos(a) * r, 4 + Math.random() * 30, Math.sin(a) * r * 1.2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)),
        new THREE.Vector3(3 + Math.random() * 6, 1, 0.3));
      strips.setMatrixAt(i, m);
      strips.setColorAt(i, col.setHex([0xffe9b8, 0x9fe8ff, 0xffb0e0][i % 3]));
    }
    this.scene.add(strips);

    // Floating billboards
    const bb = [
      { text: 'INKRUSH', bg: '#141833', fg: '#ff6a13', pos: [0, 16, -60], rot: 0 },
      { text: 'INKRUSH', bg: '#141833', fg: '#1f7dff', pos: [0, 16, 60], rot: Math.PI },
      { text: 'VOLTIO', bg: '#f4f0ff', fg: '#6c5fa6', pos: [-48, 13, 0], rot: Math.PI / 2 },
      { text: '¡PINTA!', bg: '#ffdf6b', fg: '#221a44', pos: [48, 13, 0], rot: -Math.PI / 2 },
    ];
    for (const b of bb) {
      const tex = textCanvas(b.text, b.bg, b.fg);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(22, 6.9), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      plane.position.set(...b.pos);
      plane.rotation.y = b.rot;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(23, 7.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2f55, roughness: 0.5, metalness: 0.4 }));
      frame.position.set(0, 0, -0.35);
      plane.add(frame);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 16, 8), frame.material);
      pole.position.set(0, -11, -0.6);
      plane.add(pole);
      this.scene.add(plane);
    }
  }

  buildDecor() {
    const neon = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
    // Perimeter neon rail on top of walls
    const railMatA = neon(0xc58bff);
    const add = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      return m;
    };
    add(0.25, 0.18, 104, -35.9, 4.7, 0, railMatA);
    add(0.25, 0.18, 104, 35.9, 4.7, 0, railMatA);
    add(72, 0.18, 0.25, 0, 4.7, 49.9, neon(TEAM_INFO[TEAM.ORANGE].color));
    add(72, 0.18, 0.25, 0, 4.7, -49.9, neon(TEAM_INFO[TEAM.BLUE].color));

    // Spawn pads
    for (const team of [TEAM.ORANGE, TEAM.BLUE]) {
      const z = team === TEAM.ORANGE ? 45 : -45;
      const color = TEAM_INFO[team].color;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.12, 40),
        new THREE.MeshStandardMaterial({ color: 0x2a2e4a, roughness: 0.4, metalness: 0.3 }));
      pad.position.set(0, 0.06, z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.0, 0.12, 8, 64), neon(color));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.15, z);
      this.scene.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.08, 8, 48), neon(color));
      ring2.rotation.x = Math.PI / 2;
      ring2.position.set(0, 0.14, z);
      this.scene.add(ring2);
      const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 7, 40, 1, true), beamMat);
      beam.position.set(0, 3.5, z);
      this.scene.add(beam);
      this.animated.push((t) => { beamMat.opacity = 0.08 + Math.sin(t * 2 + z) * 0.04; ring2.rotation.z = t * 0.6; });
    }

    // Central hologram ring above the tower
    const holo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.09, 8, 48), neon(0xffffff));
    holo.position.set(0, 6.2, 0);
    this.scene.add(holo);
    const holo2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc58bff, emissiveIntensity: 1.2, roughness: 0.2 }));
    holo2.position.set(0, 6.2, 0);
    this.scene.add(holo2);
    this.holo = { ring: holo, gem: holo2 };
    this.animated.push((t) => {
      holo.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.3;
      holo.rotation.y = t * 0.8;
      holo2.rotation.y = t * 1.3;
      holo2.position.y = 6.2 + Math.sin(t * 1.6) * 0.25;
    });

    // Neon edge strips on selected rooftops
    const stripMat = neon(0x3dffc5);
    for (const s of [1, -1]) {
      add(12, 0.12, 0.12, -28 * s, 4.06, 18 * s, stripMat);
      add(0.12, 0.12, 8, -26 * s, 3.26, 8 * s, stripMat);
      add(12, 0.12, 0.12, 28 * s, 3.06, 4 * s, stripMat);
      add(12, 0.12, 0.12, 0, 2.06, 22 * s, neon(0xc58bff));
    }

    // Street lamps
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f55, roughness: 0.5, metalness: 0.5 });
    const bulbMat = neon(0xfff2c8);
    for (const [x, z] of [[-34.8, -30], [-34.8, 30], [34.8, -30], [34.8, 30], [-34.8, 0], [34.8, 0]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 8), poleMat);
      pole.position.set(x, 3, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), bulbMat);
      bulb.position.set(x + Math.sign(-x) * 0.4, 6.1, z);
      this.scene.add(bulb);
    }

    // Hanging cables with flags across the arena (pure decoration, high up)
    const flagGeo = new THREE.ConeGeometry(0.45, 0.9, 3);
    flagGeo.rotateX(Math.PI);
    const flagCols = [TEAM_INFO[1].color, 0xffffff, TEAM_INFO[2].color, 0xc58bff];
    for (const z of [-20, 20]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 72, 4), poleMat);
      cable.rotation.z = Math.PI / 2;
      cable.position.set(0, 9, z);
      this.scene.add(cable);
      for (let i = 0; i < 24; i++) {
        const f = new THREE.Mesh(flagGeo, neon(flagCols[i % flagCols.length]));
        f.position.set(-34 + i * 3, 8.55, z);
        this.scene.add(f);
      }
    }
  }

  update(t) {
    for (const fn of this.animated) fn(t);
  }
}
