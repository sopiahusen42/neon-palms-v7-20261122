// Car bodies and wheels. Two silhouettes (a low two-door coupe and a saloon)
// are built once from merged boxes and shared by every car in the city; paint
// colour is per-car. The wheels are separate meshes so they can steer and spin
// without rebuilding the body.

import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, boxAt } from './util.js';
import { glowTexture, shadowBlobTexture } from './textures.js';

export const CAR_PAINT = [
  0xf2e7d2, // cream
  0xd9583f, // coral red
  0x2f8f9a, // turquoise
  0xe0a63c, // marigold
  0xf3f0e6, // white
  0x2b3f5c, // deep navy
  0x8c9c6a, // olive
  0xc86a8a, // dusty pink
  0x4d5a63, // graphite
];

const GLASS = 0x213642;
const TRIM_DARK = 0x2a2b2d;

/** A coupe: wedge nose, fastback roof, four wheels. Length ~4.4 m, width ~1.9 m. */
function coupeBody() {
  const parts = [];
  // Lower body, slightly wedge-shaped via a flat slab plus a tapered nose cap.
  parts.push(boxAt(1.86, 0.62, 4.3, 0, 0.66, 0));
  parts.push(boxAt(1.7, 0.34, 1.1, 0, 0.92, -1.75));
  // Bonnet deck slopes down to the nose.
  const bonnet = new THREE.BoxGeometry(1.72, 0.18, 1.5);
  bonnet.rotateX(-0.06);
  bonnet.translate(0, 1.0, -1.35);
  parts.push(bonnet);
  // Cabin: a narrower greenhouse with sloped pillars.
  parts.push(boxAt(1.62, 0.5, 1.95, 0, 1.2, 0.12));
  const roof = new THREE.BoxGeometry(1.5, 0.14, 1.5);
  roof.translate(0, 1.48, 0.2);
  parts.push(roof);
  // Rear deck and boot, with a squared-off lip so the tail reads as a body.
  parts.push(boxAt(1.8, 0.26, 1.05, 0, 0.99, 1.68));
  parts.push(boxAt(1.84, 0.5, 0.22, 0, 0.62, 2.09));
  // Side skirts plus a rear valance that frames the wheels.
  parts.push(boxAt(1.92, 0.16, 3.4, 0, 0.4, 0));
  parts.push(boxAt(1.7, 0.22, 0.3, 0, 0.34, 2.0));
  return mergeGeometries(parts);
}

function coupeGlass() {
  const parts = [];
  // Windscreen, rear screen and two side windows, as thin slabs.
  const ws = new THREE.BoxGeometry(1.52, 0.46, 0.08);
  ws.rotateX(-0.42);
  ws.translate(0, 1.22, -0.82);
  parts.push(ws);
  const rs = new THREE.BoxGeometry(1.44, 0.44, 0.08);
  rs.rotateX(0.5);
  rs.translate(0, 1.21, 1.05);
  parts.push(rs);
  parts.push(boxAt(0.06, 0.38, 1.5, 0.78, 1.22, 0.14));
  parts.push(boxAt(0.06, 0.38, 1.5, -0.78, 1.22, 0.14));
  return mergeGeometries(parts);
}

/** A saloon: taller cabin, upright rear, longer boot. Length ~4.7 m. */
function saloonBody() {
  const parts = [];
  parts.push(boxAt(1.9, 0.7, 4.6, 0, 0.7, 0));
  parts.push(boxAt(1.84, 0.3, 1.2, 0, 0.96, -1.85));
  parts.push(boxAt(1.68, 0.62, 2.5, 0, 1.26, 0.15));
  const roof = new THREE.BoxGeometry(1.6, 0.14, 2.1);
  roof.translate(0, 1.6, 0.2);
  parts.push(roof);
  parts.push(boxAt(1.84, 0.3, 1.1, 0, 1.0, 1.85));
  parts.push(boxAt(1.96, 0.17, 3.6, 0, 0.42, 0));
  return mergeGeometries(parts);
}

function saloonGlass() {
  const parts = [];
  const ws = new THREE.BoxGeometry(1.6, 0.5, 0.08);
  ws.rotateX(-0.34);
  ws.translate(0, 1.3, -1.05);
  parts.push(ws);
  const rs = new THREE.BoxGeometry(1.56, 0.5, 0.08);
  rs.rotateX(0.28);
  rs.translate(0, 1.3, 1.4);
  parts.push(rs);
  parts.push(boxAt(0.06, 0.46, 2.0, 0.81, 1.32, 0.15));
  parts.push(boxAt(0.06, 0.46, 2.0, -0.81, 1.32, 0.15));
  return mergeGeometries(parts);
}

/** Police cruiser: a wide saloon with a push bar, roof bar and a light bar. */
function cruiserBody() {
  const parts = [];
  parts.push(boxAt(1.98, 0.76, 4.85, 0, 0.74, 0));
  parts.push(boxAt(1.92, 0.32, 1.3, 0, 1.02, -1.95));
  parts.push(boxAt(1.76, 0.66, 2.6, 0, 1.34, 0.12));
  const roof = new THREE.BoxGeometry(1.66, 0.15, 2.2);
  roof.translate(0, 1.7, 0.18);
  parts.push(roof);
  parts.push(boxAt(1.92, 0.32, 1.2, 0, 1.06, 1.95));
  parts.push(boxAt(2.04, 0.18, 3.8, 0, 0.44, 0));
  // Push bar.
  parts.push(boxAt(1.5, 0.12, 0.1, 0, 0.95, -2.5));
  parts.push(boxAt(0.1, 0.5, 0.1, -0.55, 0.72, -2.5));
  parts.push(boxAt(0.1, 0.5, 0.1, 0.55, 0.72, -2.5));
  return mergeGeometries(parts);
}

function cruiserGlass() {
  const parts = [];
  const ws = new THREE.BoxGeometry(1.68, 0.54, 0.08);
  ws.rotateX(-0.34);
  ws.translate(0, 1.4, -1.15);
  parts.push(ws);
  const rs = new THREE.BoxGeometry(1.62, 0.54, 0.08);
  rs.rotateX(0.3);
  rs.translate(0, 1.4, 1.5);
  parts.push(rs);
  parts.push(boxAt(0.06, 0.48, 2.1, 0.86, 1.41, 0.15));
  parts.push(boxAt(0.06, 0.48, 2.1, -0.86, 1.41, 0.15));
  return mergeGeometries(parts);
}

/** Four wheels as one instanced-friendly set of meshes, ready to parent. */
function wheelSet(radius, width) {
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 14);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10);
  hub.rotateZ(Math.PI / 2);
  const tyreGeo = mergeGeometries([tyre]);
  const hubGeo = mergeGeometries([hub]);
  return { tyreGeo, hubGeo, radius };
}

// Shared geometry and material pools: built once at load.
let cache = null;

export function carAssets() {
  if (cache) return cache;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.16, metalness: 0.4, envMapIntensity: 0.6 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.92 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.3, metalness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM_DARK, roughness: 0.6 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe9b0, emissiveIntensity: 0.55, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc23a2c, emissive: 0x8e1d12, emissiveIntensity: 0.5, roughness: 0.4 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xe4e2d4, emissive: 0x2a2a26, emissiveIntensity: 0.2, roughness: 0.55 });
  cache = {
    coupe: { body: coupeBody(), glass: coupeGlass(), len: 4.4, width: 1.92, wheels: [[0.9, -1.36], [-0.9, -1.36], [0.9, 1.4], [-0.9, 1.4]] },
    saloon: { body: saloonBody(), glass: saloonGlass(), len: 4.7, width: 1.96, wheels: [[0.93, -1.5], [-0.93, -1.5], [0.93, 1.5], [-0.93, 1.5]] },
    cruiser: { body: cruiserBody(), glass: cruiserGlass(), len: 4.95, width: 2.06, wheels: [[0.97, -1.56], [-0.97, -1.56], [0.97, 1.56], [-0.97, 1.56]] },
    mats: { glassMat, tyreMat, hubMat, trimMat, lightMat, tailMat, plateMat },
  };
  return cache;
}

/**
 * Builds one car: a Group with body, glass, lights and four wheel groups
 * (front two steerable). The group's origin is at the ground between the axles
 * and its nose faces -Z, matching headingVector().
 */
export function createCarMesh(kind, colour) {
  const A = carAssets();
  const spec = A[kind] ?? A.coupe;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.34,
    metalness: 0.32,
  });

  const body = new THREE.Mesh(spec.body, paint);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const glass = new THREE.Mesh(spec.glass, A.mats.glassMat);
  glass.castShadow = true;
  group.add(glass);

  // Head and tail lamps.
  const lampGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
  const tailGeo = new THREE.BoxGeometry(0.3, 0.18, 0.08);
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(lampGeo, A.mats.lightMat);
    hl.position.set(s * 0.6, 0.86, -spec.len / 2 + 0.04);
    group.add(hl);
    const tl = new THREE.Mesh(tailGeo, A.mats.tailMat);
    tl.position.set(s * 0.62, 0.9, spec.len / 2 - 0.04);
    group.add(tl);
  }
  // Sills and a front grille, dark.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.55, 0.16, 0.06), A.mats.trimMat);
  grille.position.set(0, 0.62, -spec.len / 2 + 0.02);
  group.add(grille);

  // Rear plate and a dark bumper blade: without these the tail reads as a slab.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.03), A.mats.plateMat);
  plate.position.set(0, 0.56, spec.len / 2 + 0.03);
  group.add(plate);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 0.14, 0.1), A.mats.trimMat);
  bumper.position.set(0, 0.44, spec.len / 2 + 0.01);
  group.add(bumper);

  // Soft contact shadow so the car is planted on the asphalt rather than pasted
  // on top of it. Additive-darkening is unavailable, so this is a low-opacity
  // multiply-ish black quad lying just above the road.
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width * 1.25, spec.len * 0.96),
    new THREE.MeshBasicMaterial({
      map: shadowBlobTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0x000000,
      blending: THREE.NormalBlending,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.035;
  contact.renderOrder = 1;
  group.add(contact);
  group.userData.contact = contact;

  // Wheels: two front groups that steer, all four that spin.
  const wheelRadius = 0.36;
  const tyreGeo = mergeGeometries([(() => { const g = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.26, 14); g.rotateZ(Math.PI / 2); return g; })()]);
  const hubGeo = mergeGeometries([(() => { const g = new THREE.CylinderGeometry(wheelRadius * 0.5, wheelRadius * 0.5, 0.28, 9); g.rotateZ(Math.PI / 2); return g; })()]);
  const wheels = [];
  const front = [];
  for (let i = 0; i < spec.wheels.length; i++) {
    const [wx, wz] = spec.wheels[i];
    const pivot = new THREE.Group();
    pivot.position.set(wx, wheelRadius, wz);
    const tyre = new THREE.Mesh(tyreGeo, A.mats.tyreMat);
    tyre.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, A.mats.hubMat);
    pivot.add(tyre, hub);
    group.add(pivot);
    wheels.push({ pivot, tyre, hub });
    if (wz < 0) front.push({ pivot, tyre, hub });
  }

  group.userData.paint = paint;
  group.userData.wheels = wheels;
  group.userData.frontWheels = front;
  group.userData.spec = spec;
  return group;
}

/** The light bar on a cruiser: red and blue emissive slabs plus a glowing halo. */
export function createLightBar() {
  const g = new THREE.Group();
  // Deep, saturated tones with restrained emissive: under ACES at exposure 1.34
  // a hot emissive slab clips straight to white and the colour identity is lost.
  // Red is crimson rather than scarlet so it never reads as an amber beacon.
  const red = new THREE.MeshStandardMaterial({ color: 0xd00a04, emissive: 0xc00400, emissiveIntensity: 1.3, roughness: 0.28, metalness: 0 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0a3ce8, emissive: 0x0030d8, emissiveIntensity: 1.3, roughness: 0.28, metalness: 0 });
  const barGeo = new THREE.BoxGeometry(0.94, 0.24, 0.4);
  const l = new THREE.Mesh(barGeo, red);
  l.position.set(-0.52, 1.94, 0.1);
  const r = new THREE.Mesh(barGeo, blue);
  r.position.set(0.52, 1.94, 0.1);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.1, 0.46), new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.7 }));
  base.position.set(0, 1.81, 0.1);
  g.add(l, r, base);

  // Each lamp gets a saturated halo so the bar reads as *lit* from any distance
  // without a bloom pass. Kept tight and deep-toned: an oversized additive
  // sprite blows out to white and the blue channel disappears.
  const haloMat = (colour) =>
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: colour,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
  const redHalo = new THREE.Sprite(haloMat(0xff2a10));
  redHalo.scale.setScalar(2.2);
  redHalo.position.set(-0.52, 1.94, 0.1);
  const blueHalo = new THREE.Sprite(haloMat(0x1854ff));
  blueHalo.scale.setScalar(2.2);
  blueHalo.position.set(0.52, 1.94, 0.1);
  g.add(redHalo, blueHalo);
  // A second, fainter pair further out so the bar still registers at range.
  const redFar = new THREE.Sprite(haloMat(0xff3a1e));
  redFar.scale.setScalar(4.6);
  redFar.position.set(-0.52, 1.94, 0.1);
  redFar.material.opacity = 0.16;
  const blueFar = new THREE.Sprite(haloMat(0x2a66ff));
  blueFar.scale.setScalar(4.6);
  blueFar.position.set(0.52, 1.94, 0.1);
  blueFar.material.opacity = 0.16;
  g.add(redFar, blueFar);

  g.userData = { red, blue, redMesh: l, blueMesh: r, redHalo, blueHalo, base };
  return g;
}
