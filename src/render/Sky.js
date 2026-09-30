import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  Sky · cúpula de cielo estilizada de media tarde
//  Degradado cálido, sol con halo, nubes toon (lado iluminado crema,
//  sombra lila), silueta de ciudad con ventanas al este y mar al oeste.
//  El mismo shader genera el environment map (PMREM) para reflejos.
// ─────────────────────────────────────────────────────────────

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww; // siempre en el plano lejano
}
`;

const frag = /* glsl */ `
uniform vec3 uSunDir;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCityFar;
uniform vec3 uCityNear;
uniform vec3 uWindow;
uniform vec3 uSea;
uniform vec3 uSeaFar;
uniform float uEnvMode;
uniform sampler2D uNoise;
varying vec3 vDir;

float hash1( float x ) { return fract( sin( x * 127.1 ) * 43758.5453 ); }

float fbm( vec2 p ) {
  float s = 0.0;
  float a = 0.55;
  for ( int i = 0; i < 4; i++ ) {
    s += texture2D( uNoise, p ).r * a;
    p = p * 2.03 + vec2( 0.17, 0.31 );
    a *= 0.5;
  }
  return s / 1.03;
}

// altura de un edificio de la capa (en elevación), por acimut
float skyline( float az, float density, float base, float vary, float seed, out float id ) {
  float x = az * density + seed;
  id = floor( x );
  float h = hash1( id + seed * 13.0 );
  float tower = step( 0.86, hash1( id * 1.7 + seed ) );
  float height = base + pow( h, 1.6 ) * vary + tower * vary * 1.3;
  // escalonado de azotea
  float f = fract( x );
  float setback = step( 0.72, hash1( id + 3.1 ) ) * step( 0.3, abs( f - 0.5 ) ) * vary * 0.25;
  // antena
  float ant = tower * step( abs( f - 0.5 ), 0.04 ) * vary * 0.8;
  return height - setback + ant;
}

void main() {
  vec3 d = normalize( vDir );
  float e = d.y;
  float az = atan( d.z, d.x ); // 0 = este (+X)
  vec3 sunD = normalize( uSunDir );
  float sunDot = dot( d, sunD );
  float sunAz = max( 0.0, dot( normalize( vec2( d.x, d.z ) + 1e-4 ), normalize( sunD.xz + 1e-4 ) ) );

  // ── degradado base
  float t = clamp( e, 0.0, 1.0 );
  vec3 horizon = mix( uHorizon, uHorizonSun, pow( sunAz, 3.0 ) * 0.85 );
  vec3 col = mix( horizon, uMid, smoothstep( 0.0, 0.22, t ) );
  col = mix( col, uZenith, smoothstep( 0.18, 0.85, t ) );

  // ── sol
  float glow = pow( max( sunDot, 0.0 ), 10.0 ) * 0.35 + pow( max( sunDot, 0.0 ), 90.0 ) * 0.9;
  col += uSunColor * glow;
  float disc = smoothstep( 0.9993, 0.9996, sunDot );
  col = mix( col, uSunColor * 6.0, disc * ( 1.0 - uEnvMode * 0.6 ) );

  // ── nubes (plano proyectado)
  if ( e > 0.0 ) {
    vec2 cp = d.xz / ( e + 0.14 ) * 0.085 + vec2( uTime * 0.0035, uTime * 0.0012 );
    float n = fbm( cp );
    float n2 = fbm( cp * 2.3 + 7.0 );
    float dens = n * 0.75 + n2 * 0.25;
    float cover = smoothstep( 0.5, 0.56, dens ) * smoothstep( 0.02, 0.16, e ) * ( 1.0 - smoothstep( 0.55, 0.95, e ) * 0.7 );
    // iluminación toon: muestreo desplazado hacia el sol
    vec2 toSun = normalize( sunD.xz + 1e-4 ) * 0.035;
    float nl = fbm( cp + toSun ) * 0.75 + fbm( ( cp + toSun ) * 2.3 + 7.0 ) * 0.25;
    float lit = smoothstep( 0.02, -0.03, nl - dens );
    vec3 cloudCol = mix( uCloudShade, uCloudLit, smoothstep( 0.35, 0.65, lit ) );
    // borde brillante hacia el sol
    float edge = smoothstep( 0.5, 0.53, dens ) - smoothstep( 0.53, 0.6, dens );
    cloudCol += uSunColor * edge * pow( max( sunDot, 0.0 ), 3.0 ) * 0.9;
    cloudCol = mix( cloudCol, horizon, smoothstep( 0.2, 0.0, e ) * 0.6 );
    col = mix( col, cloudCol, cover );
  }

  // ── silueta de ciudad (este) y mar abierto (oeste)
  if ( uEnvMode < 0.5 && e > -0.02 && e < 0.2 ) {
    float cityMask = smoothstep( -2.3, -1.4, az ) * ( 1.0 - smoothstep( 1.4, 2.3, az ) );
    float idF; float idN;
    float hFar = skyline( az, 38.0, 0.012, 0.05, 1.0, idF );
    float hNear = skyline( az, 22.0, 0.006, 0.075, 4.0, idN );
    float haze = smoothstep( 0.0, 0.14, e );
    if ( e < hFar * cityMask ) {
      col = mix( uCityFar, horizon, 0.35 + haze * 0.3 );
    }
    if ( e < hNear * cityMask ) {
      vec3 c = mix( uCityNear, horizon, 0.18 + haze * 0.2 );
      // ventanas
      float wx = fract( az * 22.0 * 7.0 + idN );
      float wy = fract( e * 260.0 );
      float lit = step( 0.62, hash1( floor( az * 22.0 * 7.0 ) * 3.1 + floor( e * 260.0 ) * 7.7 ) );
      float win = step( 0.25, wx ) * step( wx, 0.7 ) * step( 0.3, wy ) * step( wy, 0.75 ) * lit;
      c += uWindow * win * 0.9;
      // borde superior iluminado por el sol
      float rim = smoothstep( hNear * cityMask - 0.0015, hNear * cityMask, e );
      c += uSunColor * rim * 0.25 * sunAz;
      col = c;
    }
    // bruma baja sobre el horizonte
    col = mix( col, horizon, smoothstep( 0.03, -0.01, e ) * 0.5 );
  }

  // ── bajo el horizonte: mar (para el env map y huecos)
  if ( e <= 0.0 ) {
    float k = smoothstep( 0.0, -0.25, e );
    vec3 sea = mix( uSeaFar, uSea, k );
    sea += uSunColor * pow( max( dot( reflect( d, vec3( 0.0, 1.0, 0.0 ) ), sunD ), 0.0 ), 24.0 ) * 0.6;
    col = mix( horizon, sea, smoothstep( 0.0, -0.035, e ) );
  }

  gl_FragColor = vec4( col, 1.0 );
}
`;

export class Sky {
  constructor(opts = {}) {
    const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    this.uniforms = {
      uSunDir: { value: (opts.sunDir || new THREE.Vector3(-0.5, 0.45, -0.3)).clone().normalize() },
      uTime: { value: 0 },
      uZenith: { value: lin(0x5f9ce8, 1.05) },
      uMid: { value: lin(0x9cc8f2, 1.1) },
      uHorizon: { value: lin(0xf7dcc6, 1.18) },
      uHorizonSun: { value: lin(0xffc58f, 1.3) },
      uSunColor: { value: lin(0xffd9a8, 1.0) },
      uCloudLit: { value: lin(0xfff3e2, 1.45) },
      uCloudShade: { value: lin(0xc2b3de, 1.05) },
      uCityFar: { value: lin(0xb7a9cf, 0.95) },
      uCityNear: { value: lin(0x8c7fae, 0.85) },
      uWindow: { value: lin(0xffd08a, 1.4) },
      uSea: { value: lin(0x1f6f84, 0.8) },
      uSeaFar: { value: lin(0x6fb0bf, 0.95) },
      uEnvMode: { value: 0 },
      uNoise: { value: opts.noise || null }
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  get horizonColor() {
    return this.uniforms.uHorizon.value;
  }

  update(camera, time) {
    this.mesh.position.copy(camera.position);
    this.uniforms.uTime.value = time;
  }

  /** Genera un environment map PMREM a partir del propio cielo. */
  makeEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const envMat = this.material.clone();
    envMat.uniforms = THREE.UniformsUtils.clone(this.uniforms);
    envMat.uniforms.uNoise.value = this.uniforms.uNoise.value;
    envMat.uniforms.uEnvMode.value = 1;
    const m = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat);
    envScene.add(m);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 100);
    pmrem.dispose();
    envMat.dispose();
    m.geometry.dispose();
    return rt.texture;
  }
}
