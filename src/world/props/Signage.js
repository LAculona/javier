import { makeCanvas, canvasTexture, rng } from '../../render/TextureFactory.js';

// ─────────────────────────────────────────────────────────────
//  Signage · atlas de carteles, logos de marcas ficticias y grafitis
//  originales dibujados en canvas. Celdas de 256 px en un atlas 2048².
// ─────────────────────────────────────────────────────────────

const CELL = 256;
const SIZE = 2048;
const HEAD = '"Bungee", "Dela Gothic One", sans-serif';
const BODY = '"Rubik", sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitText(g, text, font, maxW, size) {
  let s = size;
  g.font = `${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 8) {
    s -= 2;
    g.font = `${s}px ${font}`;
  }
  return s;
}

function outlinedText(g, text, x, y, fill, stroke, lw) {
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

// Cada entrada dibuja en (x,y,w,h) del atlas
const DRAWERS = {
  kroma(g, x, y, w, h) {
    // KROMA LINE: ola + círculo, tipografía gruesa
    g.fillStyle = '#f6efe2';
    roundRect(g, x + 8, y + 40, w - 16, h - 80, 18);
    g.fill();
    g.strokeStyle = '#6b5a92';
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = '#6b5a92';
    g.beginPath();
    g.arc(x + 58, y + h / 2, 30, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f6efe2';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x + 32, y + h / 2 + 6);
    g.quadraticCurveTo(x + 45, y + h / 2 - 12, x + 58, y + h / 2 + 4);
    g.quadraticCurveTo(x + 71, y + h / 2 + 18, x + 84, y + h / 2 - 2);
    g.stroke();
    g.fillStyle = '#3d3060';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    fitText(g, 'KROMA', HEAD, w - 120, 46);
    g.fillText('KROMA', x + 100, y + h / 2 - 12);
    g.font = `600 22px ${BODY}`;
    g.fillText('LINE · LOGISTICS', x + 102, y + h / 2 + 24);
  },
  orbita(g, x, y, w, h) {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(x, y, w, h);
    g.strokeStyle = '#f7f1e6';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(x + 60, y + h / 2, 34, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(x + 60, y + h / 2, 56, 16, -0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f7f1e6';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    fitText(g, 'ÓRBITA', HEAD, w - 130, 52);
    g.fillText('ÓRBITA', x + 128, y + h / 2 - 10);
    g.font = `700 22px ${BODY}`;
    g.fillText('SHIPPING CO.', x + 130, y + h / 2 + 28);
  },
  sodavolt(g, x, y, w, h) {
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, '#8fe3c9');
    grd.addColorStop(1, '#f5a8c8');
    g.fillStyle = grd;
    roundRect(g, x + 6, y + 6, w - 12, h - 12, 26);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#2d2445';
    g.stroke();
    // lata
    g.fillStyle = '#fdf6ea';
    roundRect(g, x + 26, y + 40, 64, h - 80, 14);
    g.fill();
    g.stroke();
    g.fillStyle = '#f6c945';
    g.beginPath();
    g.moveTo(x + 64, y + 62);
    g.lineTo(x + 44, y + h / 2 + 6);
    g.lineTo(x + 58, y + h / 2 + 6);
    g.lineTo(x + 50, y + h - 60);
    g.lineTo(x + 74, y + h / 2 - 8);
    g.lineTo(x + 60, y + h / 2 - 8);
    g.closePath();
    g.fill();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    fitText(g, 'SODA', HEAD, w - 120, 56);
    outlinedText(g, 'SODA', x + 104, y + h / 2 - 26, '#fdf6ea', '#2d2445', 8);
    fitText(g, 'VOLT', HEAD, w - 120, 56);
    outlinedText(g, 'VOLT', x + 104, y + h / 2 + 28, '#f6c945', '#2d2445', 8);
  },
  noodles(g, x, y, w, h) {
    g.fillStyle = '#2f2748';
    roundRect(g, x + 6, y + 30, w - 12, h - 60, 16);
    g.fill();
    // cuenco pixel
    const px = 8;
    const bowl = [
      '..........',
      '.x.x.x.x..',
      '.x.x.x.x..',
      'xxxxxxxxxx',
      '.xxxxxxxx.',
      '..xxxxxx..'
    ];
    for (let r = 0; r < bowl.length; r++) {
      for (let c = 0; c < bowl[r].length; c++) {
        if (bowl[r][c] === 'x') {
          g.fillStyle = r < 3 ? '#fbe9b7' : '#f59bb8';
          g.fillRect(x + 22 + c * px, y + h / 2 - 26 + r * px, px - 1, px - 1);
        }
      }
    }
    g.fillStyle = '#fbe9b7';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    fitText(g, 'PIXEL', HEAD, w - 130, 40);
    g.fillText('PIXEL', x + 118, y + h / 2 - 16);
    g.fillStyle = '#8fe3c9';
    fitText(g, 'NOODLES', HEAD, w - 130, 34);
    g.fillText('NOODLES', x + 118, y + h / 2 + 22);
  },
  muelle(g, x, y, w, h) {
    g.fillStyle = '#f3e6cf';
    roundRect(g, x + 10, y + 10, w - 20, h - 20, 20);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#3a3050';
    g.stroke();
    g.fillStyle = '#3a3050';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 34px ${BODY}`;
    g.fillText('MUELLE', x + w / 2, y + 62);
    g.font = `150px ${HEAD}`;
    g.fillText('7', x + w / 2, y + h / 2 + 34);
  },
  fizz(g, x, y, w, h) {
    g.clearRect(x, y, w, h);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(-0.12);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, 'FIZZ', HEAD, w - 30, 88);
    outlinedText(g, 'FIZZ', 0, -26, '#fbd35a', '#2d2445', 12);
    fitText(g, 'KOMBAT', HEAD, w - 30, 52);
    outlinedText(g, 'KOMBAT', 0, 44, '#f59bb8', '#2d2445', 10);
    g.restore();
  },
  dripwave(g, x, y, w, h) {
    g.fillStyle = '#c7b8e0';
    g.beginPath();
    g.arc(x + w / 2, y + h / 2, w / 2 - 12, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#2d2445';
    g.stroke();
    g.strokeStyle = '#2d2445';
    g.lineWidth = 9;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(x + w / 2, y + h / 2 + 30, 26 + i * 22, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
    }
    g.fillStyle = '#2d2445';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, 'DRIPWAVE', HEAD, w - 70, 34);
    g.fillText('DRIPWAVE', x + w / 2, y + h / 2 + 62);
    g.font = `800 26px ${BODY}`;
    g.fillText('98.7 FM', x + w / 2, y + h / 2 + 96);
  },
  neokai(g, x, y, w, h) {
    g.clearRect(x, y, w, h);
    g.strokeStyle = '#9ff4ff';
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x + 30, y + h / 2 + 30);
    g.lineTo(x + 30, y + h / 2 - 30);
    g.lineTo(x + 70, y + h / 2 + 30);
    g.lineTo(x + 70, y + h / 2 - 30);
    g.stroke();
    g.fillStyle = '#9ff4ff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    fitText(g, 'NEOKAI', HEAD, w - 100, 50);
    g.fillText('NEOKAI', x + 90, y + h / 2);
  },
  gruas(g, x, y, w, h) {
    g.fillStyle = '#f6d77a';
    g.fillRect(x + 6, y + 50, w - 12, h - 100);
    // rayas de peligro
    g.save();
    g.beginPath();
    g.rect(x + 6, y + 50, w - 12, 24);
    g.clip();
    g.fillStyle = '#3a3050';
    for (let i = -2; i < 20; i++) {
      g.beginPath();
      g.moveTo(x + i * 30, y + 74);
      g.lineTo(x + i * 30 + 16, y + 50);
      g.lineTo(x + i * 30 + 30, y + 50);
      g.lineTo(x + i * 30 + 14, y + 74);
      g.fill();
    }
    g.restore();
    g.fillStyle = '#3a3050';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, 'GRÚAS VEGA', HEAD, w - 30, 40);
    g.fillText('GRÚAS VEGA', x + w / 2, y + h / 2 + 18);
  },
  cromamart(g, x, y, w, h) {
    g.fillStyle = '#f3e6cf';
    roundRect(g, x + 6, y + 56, w - 12, h - 112, 12);
    g.fill();
    g.fillStyle = '#6e9e8a';
    g.fillRect(x + 6, y + 56, 60, h - 112);
    g.fillStyle = '#f3e6cf';
    g.font = `44px ${HEAD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('C', x + 36, y + h / 2 + 2);
    g.fillStyle = '#3a3050';
    fitText(g, 'CROMA MART', HEAD, w - 90, 36);
    g.fillText('CROMA MART', x + 36 + (w - 60) / 2, y + h / 2 + 2);
  },
  graffitiDrip(g, x, y, w, h, seed = 1) {
    g.clearRect(x, y, w, h);
    const r = rng(seed);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(-0.08);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `92px ${HEAD}`;
    g.lineJoin = 'round';
    // sombra desplazada
    g.fillStyle = '#3a2c58';
    g.fillText('DRIP', 6, 6);
    g.lineWidth = 14;
    g.strokeStyle = '#3a2c58';
    g.strokeText('DRIP', 0, 0);
    const grd = g.createLinearGradient(0, -40, 0, 40);
    grd.addColorStop(0, '#c9f5e3');
    grd.addColorStop(1, '#c7b8e0');
    g.fillStyle = grd;
    g.fillText('DRIP', 0, 0);
    // chorretones
    g.fillStyle = '#c7b8e0';
    for (let i = 0; i < 6; i++) {
      const dx = -90 + r() * 180;
      const len = 20 + r() * 50;
      g.fillRect(dx, 28, 6, len);
      g.beginPath();
      g.arc(dx + 3, 28 + len, 5, 0, Math.PI * 2);
      g.fill();
    }
    // estrellas
    g.fillStyle = '#f6d77a';
    for (let i = 0; i < 3; i++) {
      star(g, -100 + r() * 200, -70 + r() * 20, 8 + r() * 8);
    }
    g.restore();
  },
  graffitiZap(g, x, y, w, h) {
    g.clearRect(x, y, w, h);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(0.1);
    // explosión
    g.fillStyle = '#f59bb8';
    g.strokeStyle = '#3a2c58';
    g.lineWidth = 8;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? 58 : 100;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.7);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `64px ${HEAD}`;
    outlinedText(g, 'ZAP!', 0, 4, '#fff6e2', '#3a2c58', 10);
    g.restore();
  },
  graffitiFace(g, x, y, w, h) {
    // gota sonriente (mascota urbana original)
    g.clearRect(x, y, w, h);
    g.save();
    g.translate(x + w / 2, y + h / 2 + 10);
    g.fillStyle = '#8fe3c9';
    g.strokeStyle = '#3a2c58';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, -95);
    g.bezierCurveTo(40, -40, 80, 0, 72, 40);
    g.bezierCurveTo(64, 90, -64, 90, -72, 40);
    g.bezierCurveTo(-80, 0, -40, -40, 0, -95);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a2c58';
    g.beginPath();
    g.ellipse(-24, 20, 9, 14, 0, 0, Math.PI * 2);
    g.ellipse(24, 20, 9, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 38, 22, 0.2, Math.PI - 0.2);
    g.stroke();
    g.fillStyle = '#fff6e2';
    g.beginPath();
    g.ellipse(-30, -10, 10, 18, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },
  graffitiArrow(g, x, y, w, h) {
    g.clearRect(x, y, w, h);
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.fillStyle = '#f6d77a';
    g.strokeStyle = '#3a2c58';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-100, -26);
    g.lineTo(30, -26);
    g.lineTo(30, -62);
    g.lineTo(104, 0);
    g.lineTo(30, 62);
    g.lineTo(30, 26);
    g.lineTo(-100, 26);
    g.closePath();
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `30px ${HEAD}`;
    g.fillStyle = '#3a2c58';
    g.fillText('GO GO', -26, 2);
    g.restore();
  },
  hazard(g, x, y, w, h) {
    g.fillStyle = '#f6d77a';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#3a3050';
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (let i = -8; i < 16; i++) {
      g.beginPath();
      g.moveTo(x + i * 40, y + h);
      g.lineTo(x + i * 40 + 20, y + h);
      g.lineTo(x + i * 40 + 20 + h, y);
      g.lineTo(x + i * 40 + h, y);
      g.fill();
    }
    g.restore();
  },
  teamOrange(g, x, y, w, h) {
    teamEmblem(g, x, y, w, h, '#FF6A13', '#FFB347', 'NARANJA');
  },
  teamBlue(g, x, y, w, h) {
    teamEmblem(g, x, y, w, h, '#1E6BFF', '#3FE0FF', 'AZUL');
  },
  puerto(g, x, y, w, h) {
    g.clearRect(x, y, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, 'PUERTO', HEAD, w - 20, 64);
    outlinedText(g, 'PUERTO', x + w / 2, y + h / 2 - 34, '#fff3e0', '#3a2c58', 10);
    fitText(g, 'CROMA', HEAD, w - 20, 74);
    outlinedText(g, 'CROMA', x + w / 2, y + h / 2 + 38, '#c7b8e0', '#3a2c58', 10);
  },
  vending(g, x, y, w, h) {
    // frontal de máquina expendedora "SODA VOLT"
    g.fillStyle = '#fdf6ea';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#8fe3c9';
    g.fillRect(x + 10, y + 10, w * 0.62, h - 20);
    const cols = ['#f59bb8', '#f6d77a', '#c7b8e0', '#fdf6ea'];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) {
        g.fillStyle = cols[(r + c) % 4];
        roundRect(g, x + 20 + c * 36, y + 22 + r * 44, 26, 34, 6);
        g.fill();
      }
    }
    g.fillStyle = '#2d2445';
    g.fillRect(x + w * 0.7, y + 30, w * 0.24, 40);
    g.fillStyle = '#f59bb8';
    g.fillRect(x + w * 0.72, y + 90, w * 0.2, 16);
    g.fillRect(x + w * 0.72, y + 114, w * 0.2, 16);
    g.fillStyle = '#2d2445';
    g.fillRect(x + 20, y + h - 46, w * 0.55, 26);
  }
};

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function teamEmblem(g, x, y, w, h, main, accent, label) {
  g.clearRect(x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2 - 12;
  // gota estilizada con salpicadura
  g.fillStyle = main;
  g.strokeStyle = '#2a1f3d';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(cx, cy - 92);
  g.bezierCurveTo(cx + 44, cy - 30, cx + 74, cy + 4, cx + 66, cy + 44);
  g.bezierCurveTo(cx + 56, cy + 92, cx - 56, cy + 92, cx - 66, cy + 44);
  g.bezierCurveTo(cx - 74, cy + 4, cx - 44, cy - 30, cx, cy - 92);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(cx - 24, cy + 6, 12, 24, -0.5, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy, rr] of [
    [-88, 40, 12],
    [90, 30, 10],
    [-70, -40, 8],
    [78, -30, 7]
  ]) {
    g.fillStyle = main;
    g.beginPath();
    g.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, label, HEAD, w - 20, 40);
  outlinedText(g, label, cx, y + h - 26, '#fff6e2', '#2a1f3d', 8);
}

// Disposición: nombre → [col, fila, anchoCeldas, altoCeldas]
const LAYOUT = {
  kroma: [0, 0, 2, 1],
  orbita: [2, 0, 2, 1],
  sodavolt: [4, 0, 2, 1],
  noodles: [6, 0, 2, 1],
  muelle: [0, 1, 1, 1],
  fizz: [1, 1, 1, 1],
  dripwave: [2, 1, 1, 1],
  neokai: [3, 1, 2, 1],
  gruas: [5, 1, 2, 1],
  graffitiFace: [7, 1, 1, 1],
  cromamart: [0, 2, 2, 1],
  graffitiDrip: [2, 2, 2, 1],
  graffitiZap: [4, 2, 1, 1],
  graffitiArrow: [5, 2, 1, 1],
  hazard: [6, 2, 2, 1],
  teamOrange: [0, 3, 1, 1],
  teamBlue: [1, 3, 1, 1],
  puerto: [2, 3, 2, 1],
  vending: [4, 3, 1, 2]
};

export function makeSignAtlas() {
  const c = makeCanvas(SIZE, SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, SIZE, SIZE);
  const rects = {};
  for (const [name, [col, row, cw, ch]] of Object.entries(LAYOUT)) {
    const x = col * CELL;
    const y = row * CELL;
    const w = cw * CELL;
    const h = ch * CELL;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    DRAWERS[name](g, x + 4, y + 4, w - 8, h - 8);
    g.restore();
    // UV (flipY de CanvasTexture: v = 1 - y)
    rects[name] = {
      u0: x / SIZE,
      v0: 1 - (y + h) / SIZE,
      u1: (x + w) / SIZE,
      v1: 1 - y / SIZE,
      aspect: w / h
    };
  }
  const texture = canvasTexture(c, { anisotropy: 8 });
  return { texture, rects, canvas: c };
}

/** Aplica el rect UV de un cartel a una geometría con UV 0..1. */
export function applySignUV(geo, rect) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
  }
  uv.needsUpdate = true;
  return geo;
}

export const SIGN_NAMES = Object.keys(LAYOUT);
