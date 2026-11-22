// Palms, street lamps and small street furniture, all instanced. A palm is two
// instanced meshes (tapered trunk, merged crown of fronds) so six hundred palms
// cost four draw calls; the long shadows across the boulevard are these trunks.

import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries, boxAt } from './util.js';
import { Rng } from './rng.js';

/** One curved, tapered frond blade in the XY plane, bending down along +X. */
function frondGeometry(length = 3.2, width = 0.5, droop = 1.5, segments = 7) {
  const pos = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = length * t;
    const y = -droop * t * t;
    const halfWidth = width * 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.35);
    // Two edges of the blade, plus a slight V fold so it catches light.
    pos.push(x, y + 0.06, -halfWidth, x, y - 0.05, 0, x, y + 0.06, halfWidth);
    for (let k = 0; k < 3; k++) normals.push(0, 0.55, 0);
    uvs.push(t, 0, t, 0.5, t, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
    indices.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** A whole palm head: ten fronds at varying pitch and rotation, merged. */
function palmCrownGeometry(seed) {
  const rng = new Rng(seed);
  const geoms = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const g = frondGeometry(rng.float(2.7, 3.9), rng.float(0.44, 0.62), rng.float(0.9, 2.2));
    const yaw = (i / count) * Math.PI * 2 + rng.float(-0.15, 0.15);
    const pitch = rng.float(0.05, 0.55);
    g.rotateZ(pitch);
    g.rotateY(yaw);
    geoms.push(g);
  }
  // A couple of dead fronds hanging under the crown, browner.
  return mergeGeometries(geoms);
}

export function buildPalms(scene, layout) {
  const palms = layout.palms;
  const n = palms.length;

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 1, 7, 4, false);
  trunkGeo.translate(0, 0.5, 0);
  // Bend the trunk slightly by displacing upper rings.
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + y * y * 0.055);
  }
  trunkGeo.computeVertexNormals();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xb99b74, roughness: 0.95, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  const crownGeo = palmCrownGeometry(7);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x7fb45c,
    roughness: 0.68,
    side: THREE.DoubleSide,
    flatShading: true,
    emissive: 0x2a4a22,
    emissiveIntensity: 0.35,
  });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, n);
  crowns.castShadow = true;
  crowns.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const colour = new THREE.Color();
  const rng = new Rng(404);
  const crownColours = [0x84b95f, 0x93c96b, 0x76ab53, 0x9ed47a, 0x6fa04c];

  for (let i = 0; i < n; i++) {
    const p = palms[i];
    const height = p.height * p.scale;
    const lean = p.lean;
    e.set(lean, p.yaw, lean * 0.6);
    q.setFromEuler(e);
    pos.set(p.x, 0.15, p.z);
    scl.set(p.scale, height, p.scale);
    m.compose(pos, q, scl);
    trunks.setMatrixAt(i, m);

    // Crown sits on the trunk top, following the lean.
    const top = new THREE.Vector3(lean * height * 0.9, height, lean * height * 0.5);
    pos.set(p.x + top.x, 0.15 + height, p.z + top.z);
    e.set(0, p.yaw * 1.7 + rng.float(0, 1), lean * 0.4);
    q.setFromEuler(e);
    scl.setScalar(p.scale * 1.05);
    m.compose(pos, q, scl);
    crowns.setMatrixAt(i, m);
    colour.setHex(crownColours[i % crownColours.length]);
    crowns.setColorAt(i, colour);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  scene.add(trunks, crowns);

  return { trunks, crowns };
}

/** Street lamps: tapered pole, curved arm, a warm head. Instanced in two parts. */
export function buildLamps(scene, layout) {
  const lamps = layout.lamps;
  if (lamps.length === 0) return null;
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 7.2, 8);
  pole.translate(0, 3.6, 0);
  const arm = boxAt(1.7, 0.1, 0.12, 0.8, 7.15, 0);
  const base = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8);
  base.translate(0, 0.25, 0);
  const body = mergeGeometries([pole, arm, base]);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a6a63, roughness: 0.55, metalness: 0.35 });
  const bodies = new THREE.InstancedMesh(body, bodyMat, lamps.length);
  bodies.castShadow = true;
  bodies.receiveShadow = true;

  const head = new THREE.BoxGeometry(0.72, 0.16, 0.34);
  head.translate(1.5, 7.05, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfdf3d2, emissive: 0xffe9b0, emissiveIntensity: 0.35, roughness: 0.4 });
  const heads = new THREE.InstancedMesh(head, headMat, lamps.length);
  heads.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.yaw);
    pos.set(l.x, 0.15, l.z);
    m.compose(pos, q, one);
    bodies.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(bodies, heads);
  return { bodies, heads };
}

/** Hydrants, benches, bins and bus stops: small merged props, instanced. */
export function buildStreetFurniture(scene, layout) {
  const out = {};
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  const place = (items, geo, mat, y = 0.15) => {
    if (items.length === 0) return null;
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      q.setFromAxisAngle(up, it.yaw ?? 0);
      pos.set(it.x, y, it.z);
      m.compose(pos, q, one);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    return inst;
  };

  // Hydrant: body + two caps + a bonnet.
  const hydGeo = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.16, 0.19, 0.72, 8); g.translate(0, 0.36, 0); return g; })(),
    boxAt(0.52, 0.13, 0.13, 0, 0.5, 0),
    (() => { const g = new THREE.SphereGeometry(0.16, 8, 6); g.translate(0, 0.77, 0); return g; })(),
  ]);
  out.hydrants = place(layout.hydrants, hydGeo, new THREE.MeshStandardMaterial({ color: 0xd8503c, roughness: 0.55 }));

  // Bench: seat slab, back, two legs.
  const benchGeo = mergeGeometries([
    boxAt(1.9, 0.1, 0.5, 0, 0.46, 0),
    boxAt(1.9, 0.42, 0.09, 0, 0.72, -0.22),
    boxAt(0.11, 0.46, 0.44, -0.8, 0.23, 0),
    boxAt(0.11, 0.46, 0.44, 0.8, 0.23, 0),
  ]);
  out.benches = place(layout.benches, benchGeo, new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 0.85 }));

  // Bin: a slatted cylinder with a lid.
  const binGeo = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.29, 0.24, 0.86, 10); g.translate(0, 0.43, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10); g.translate(0, 0.9, 0); return g; })(),
  ]);
  out.bins = place(layout.bins, binGeo, new THREE.MeshStandardMaterial({ color: 0x3f5a52, roughness: 0.7, metalness: 0.2 }));

  // Bus stop: two posts, a roof, a glass back and a sign panel.
  const stopGeo = mergeGeometries([
    boxAt(0.1, 2.5, 0.1, -1.4, 1.25, 0),
    boxAt(0.1, 2.5, 0.1, 1.4, 1.25, 0),
    boxAt(3.0, 0.12, 1.5, 0, 2.55, 0),
    boxAt(2.8, 1.9, 0.06, 0, 1.35, -0.7),
    boxAt(0.6, 1.4, 0.08, 2.0, 1.2, 0),
  ]);
  out.busStops = place(layout.busStops, stopGeo, new THREE.MeshStandardMaterial({ color: 0x2f8f8a, roughness: 0.5, metalness: 0.15 }));

  // Planter: a low box with a clipped hedge and a small palm already merged in
  // as a bush, keeping it cheap.
  const planterGeo = mergeGeometries([
    boxAt(4.2, 0.55, 4.2, 0, 0.27, 0),
    (() => { const g = new THREE.SphereGeometry(1.5, 7, 5); g.scale(1.2, 0.75, 1.2); g.translate(0, 1.1, 0); return g; })(),
  ]);
  out.planters = place(layout.planters, planterGeo, new THREE.MeshStandardMaterial({ color: 0xdcae8f, roughness: 0.9 }));

  return out;
}
