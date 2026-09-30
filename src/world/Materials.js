import * as THREE from 'three';
import { createToonMaterial } from '../render/ToonMaterial.js';
import {
  makeConcreteTextures,
  makeCorrugatedTextures,
  makePanelTextures,
  makeGratingTextures,
  makeStripeTexture,
  makeWindowTextures
} from '../render/TextureFactory.js';
import { makeSignAtlas } from './props/Signage.js';

// Biblioteca de materiales del mundo. Todos son toon (MeshStandard parcheado):
// ninguno usa MeshBasicMaterial y todos tienen variación de superficie.
export function createWorldTextures() {
  const concrete = makeConcreteTextures(512, 3);
  const concrete2 = makeConcreteTextures(512, 21);
  const corrugated = makeCorrugatedTextures(256, 9);
  const panel = makePanelTextures(256, 17);
  const grating = makeGratingTextures(128);
  const awningA = makeStripeTexture('#f3e6cf', '#9fcfb8', 8);
  const awningB = makeStripeTexture('#f3e6cf', '#c7b8e0', 8);
  const awningC = makeStripeTexture('#fbf3e4', '#f2a7c3', 6);
  const windowsA = makeWindowTextures(3, 2, 5, { wall: '#f1e4cc', frame: '#5b5570' });
  const windowsB = makeWindowTextures(3, 2, 11, { wall: '#e8efe6', frame: '#4d6b62' });
  const windowsC = makeWindowTextures(4, 2, 19, { wall: '#ece4f4', frame: '#5b4f7a' });
  const signs = makeSignAtlas();
  return { concrete, concrete2, corrugated, panel, grating, awningA, awningB, awningC, windowsA, windowsB, windowsC, signs };
}

export function createWorldMaterials(t) {
  const m = {};
  m.ground = createToonMaterial({
    name: 'ground',
    color: 0xe8dcc6,
    map: t.concrete.map,
    normalMap: t.concrete.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: t.concrete.roughnessMap,
    roughness: 1,
    envMapIntensity: 0.32,
    variation: 0.14,
    variationScale: 0.035,
    paint: 'ground',
    overlay: true,
    slabs: true
  });
  m.concrete = createToonMaterial({
    name: 'concrete',
    vertexColors: true,
    map: t.concrete2.map,
    normalMap: t.concrete2.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.86,
    envMapIntensity: 0.4,
    variation: 0.12,
    variationScale: 0.09,
    grime: 0.2,
    grimeHeight: 0.7,
    wear: 0.55,
    wearColor: 0xfbf5ea,
    paint: 'both',
    overlay: true
  });
  m.container = createToonMaterial({
    name: 'container',
    vertexColors: true,
    map: t.corrugated.map,
    normalMap: t.corrugated.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.55,
    metalness: 0.2,
    envMapIntensity: 0.6,
    variation: 0.1,
    variationScale: 0.15,
    grime: 0.28,
    grimeHeight: 0.9,
    wear: 0.6,
    wearColor: 0xd9d2c6,
    paint: 'both'
  });
  m.metal = createToonMaterial({
    name: 'paintedMetal',
    vertexColors: true,
    map: t.panel.map,
    normalMap: t.panel.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.46,
    metalness: 0.25,
    envMapIntensity: 0.65,
    variation: 0.08,
    wear: 0.5,
    wearColor: 0xe6e0d6,
    grime: 0.15,
    paint: 'both'
  });
  m.darkMetal = createToonMaterial({
    name: 'darkMetal',
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.6,
    envMapIntensity: 0.8,
    variation: 0.08,
    rim: 0.28,
    paint: 'none'
  });
  m.plastic = createToonMaterial({
    name: 'plastic',
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 0.7,
    variation: 0.07,
    wear: 0.3,
    wearColor: 0xfff8ec,
    grime: 0.12,
    rim: 0.12,
    paint: 'both'
  });
  m.wood = createToonMaterial({
    name: 'wood',
    vertexColors: true,
    roughness: 0.78,
    envMapIntensity: 0.3,
    variation: 0.3,
    variationScale: 0.6,
    wear: 0.4,
    wearColor: 0xf0d9b5,
    paint: 'ground'
  });
  m.rubber = createToonMaterial({
    name: 'rubber',
    vertexColors: true,
    roughness: 0.92,
    envMapIntensity: 0.2,
    variation: 0.1,
    paint: 'none'
  });
  m.foliage = createToonMaterial({
    name: 'foliage',
    vertexColors: true,
    roughness: 0.7,
    envMapIntensity: 0.35,
    variation: 0.22,
    variationScale: 0.7,
    rim: 0.35,
    paint: 'none'
  });
  m.grating = createToonMaterial({
    name: 'grating',
    vertexColors: true,
    map: t.grating.map,
    normalMap: t.grating.normalMap,
    roughness: 0.42,
    metalness: 0.55,
    envMapIntensity: 0.7,
    variation: 0.06,
    paint: 'none'
  });
  const buildingMat = (tex, name) =>
    createToonMaterial({
      name,
      vertexColors: true,
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.25,
      roughness: 0.62,
      envMapIntensity: 0.55,
      variation: 0.08,
      variationScale: 0.05,
      grime: 0.18,
      grimeHeight: 1.2,
      paint: 'both'
    });
  m.buildingA = buildingMat(t.windowsA, 'buildingA');
  m.buildingB = buildingMat(t.windowsB, 'buildingB');
  m.buildingC = buildingMat(t.windowsC, 'buildingC');
  const awning = (tex, name) =>
    createToonMaterial({
      name,
      map: tex,
      roughness: 0.8,
      side: THREE.DoubleSide,
      envMapIntensity: 0.3,
      variation: 0.08,
      rim: 0.15,
      paint: 'none'
    });
  m.awningA = awning(t.awningA, 'awningA');
  m.awningB = awning(t.awningB, 'awningB');
  m.awningC = awning(t.awningC, 'awningC');
  m.sign = createToonMaterial({
    name: 'sign',
    vertexColors: true,
    map: t.signs.texture,
    alphaTest: 0.45,
    roughness: 0.5,
    envMapIntensity: 0.5,
    variation: 0.05,
    paint: 'atlas'
  });
  m.neon = createToonMaterial({
    name: 'neon',
    vertexColors: true,
    map: t.signs.texture,
    emissiveMap: t.signs.texture,
    emissive: 0xffffff,
    emissiveIntensity: 3.2,
    alphaTest: 0.45,
    roughness: 0.4,
    variation: 0,
    paint: 'none'
  });
  m.glow = createToonMaterial({
    name: 'glow',
    vertexColors: true,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    roughness: 0.3,
    variation: 0,
    paint: 'none'
  });
  // el color emisivo viene de los vertex colors
  m.glow.onBeforeCompile = ((orig) =>
    function (shader) {
      orig.call(this, shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb * 3.4;'
      );
    })(m.glow.onBeforeCompile);
  m.glow.customProgramCacheKey = () => 'ink-glow';
  m.glass = createToonMaterial({
    name: 'glass',
    vertexColors: true,
    roughness: 0.08,
    metalness: 0.1,
    envMapIntensity: 1.3,
    variation: 0.03,
    rim: 0.2,
    paint: 'none'
  });
  return m;
}
