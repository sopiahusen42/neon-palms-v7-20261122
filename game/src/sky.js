// Sky, sun, fog and the scene's two lights. The sky is a vertical gradient
// sphere whose horizon band exactly matches the fog colour, so the boulevard
// dissolves into warm haze rather than ending on a hard edge, and a glowing sun
// disc sits low in the sun's own direction.

import * as THREE from '../../vendor/three.module.min.js';
import { SUN, SKY, FOG } from './config.js';
import { glowTexture } from './textures.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  varying vec3 vWorld;

  // Cheap value noise for thin cirrus streaks high in the sky.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorld);
    float h = clamp(dir.y, -1.0, 1.0);

    // Three-stop vertical gradient: warm pale haze at the horizon, saturated
    // azure in the middle, deeper blue overhead.
    vec3 col = mix(horizon, mid, smoothstep(-0.01, 0.26, h));
    col = mix(col, zenith, smoothstep(0.20, 0.92, h));

    vec3 sd = normalize(sunDir);
    float sunAmount = max(dot(dir, sd), 0.0);

    // Aerosol haze hugging the horizon: warm, and clearly stronger toward the
    // sun, so it does not read as a uniform white fog plane.
    float band = exp(-max(h, 0.0) * 13.0);
    float toward = pow(sunAmount, 1.5);
    col = mix(col, vec3(0.90, 0.83, 0.71), band * (0.16 + toward * 0.40));

    // Broad forward scatter, then a hot bloom and the disc itself.
    col += sunColor * pow(sunAmount, 4.0) * 0.20;
    col += sunColor * pow(sunAmount, 42.0) * 0.55;
    col += sunColor * pow(sunAmount, 900.0) * 3.2;

    // Thin cirrus combed across the upper sky. Projected onto a plane above the
    // camera, faded near the horizon so the streaks never touch the skyline.
    if (h > 0.015) {
      vec2 p = dir.xz / max(h, 0.015);
      // Two stretched octaves give long wind-combed bands, not blobs.
      float streak = fbm(vec2(p.x * 0.30, p.y * 1.7) + vec2(3.1, 11.4));
      float detail = fbm(vec2(p.x * 0.75, p.y * 3.4) + vec2(8.7, 2.2));
      float c = smoothstep(0.46, 0.74, streak * 0.72 + detail * 0.34);
      c *= smoothstep(0.02, 0.26, h);
      c *= 1.0 - smoothstep(0.55, 0.95, h) * 0.55;
      col = mix(col, vec3(1.0, 0.99, 0.96), c * 0.72);
      // Undersides of the streaks pick up the warm haze.
      col = mix(col, vec3(0.97, 0.92, 0.84), c * toward * 0.35);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSky(scene) {
  const sunDir = new THREE.Vector3(SUN.direction.x, SUN.direction.y, SUN.direction.z).normalize();

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(SKY.zenith) },
      mid: { value: new THREE.Color(SKY.mid) },
      horizon: { value: new THREE.Color(FOG.color) },
      sunDir: { value: sunDir.clone() },
      sunColor: { value: new THREE.Color(0xfff2d0) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 32, 20), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // The sun itself: a soft additive disc on the sky, kept out of the fog.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xfff6e0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }),
  );
  glow.scale.setScalar(560);
  glow.position.copy(sunDir).multiplyScalar(1800);
  glow.renderOrder = -9;
  scene.add(glow);

  return { sky, glow, sunDir };
}

export function createLights(scene) {
  const sunDir = new THREE.Vector3(SUN.direction.x, SUN.direction.y, SUN.direction.z).normalize();

  const hemi = new THREE.HemisphereLight(SUN.hemiSky, SUN.hemiGround, SUN.hemiIntensity);
  hemi.position.set(0, 60, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const box = 120;
  const cam = sun.shadow.camera;
  cam.left = -box * 0.5;
  cam.right = box * 0.5;
  cam.top = box * 0.5;
  cam.bottom = -box * 0.5;
  cam.near = 1;
  cam.far = 420;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 2;
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  // A little warm bounce off the pale road and stucco.
  const bounce = new THREE.DirectionalLight(0xffd8b4, 0.28);
  bounce.position.set(0.4, -0.25, 0.9);
  scene.add(bounce);

  // Ambient floor: without it, the long building shadows that rake across the
  // boulevard crush to near-black and the frame measures as night.
  const ambient = new THREE.AmbientLight(0xfff2dd, 0.42);
  scene.add(ambient);

  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  return { sun, hemi, bounce, ambient, sunDir };
}

/**
 * Keep the sun's tight shadow box centred a little ahead of the action: the
 * palms at the frame's edge still throw shadows into shot, and 2048 square
 * across 120 m stays crisp.
 */
export function followShadow(sun, focus, forward) {
  const dir = new THREE.Vector3(SUN.direction.x, SUN.direction.y, SUN.direction.z).normalize();
  const target = new THREE.Vector3(focus.x, 0, focus.z);
  if (forward) target.addScaledVector(forward, 16);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
  sun.position.copy(target).addScaledVector(dir, 150);
  sun.shadow.camera.updateProjectionMatrix();
}
