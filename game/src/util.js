// Small shared helpers: maths, geometry merging and flat quad building.
// three.js ships no addons here, so merging is done by hand over non-indexed
// geometries with position, normal and uv attributes.

import * as THREE from '../../vendor/three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function angleDamp(current, target, rate, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

// Direction a mesh with its nose toward -Z faces when rotated by `yaw` about Y.
export function headingVector(yaw) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---------------------------------------------------------------- geometry

/** Merge non-indexed clones of `geoms` (each already transformed) into one BufferGeometry. */
export function mergeGeometries(geoms) {
  const flat = geoms.map((g) => (g.index ? g.toNonIndexed() : g));
  let vertexCount = 0;
  for (const g of flat) vertexCount += g.attributes.position.count;
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  let po = 0;
  let uo = 0;
  for (const g of flat) {
    const p = g.attributes.position.array;
    position.set(p, po);
    po += p.length;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    if (n) normal.set(n, po - p.length);
    const t = g.attributes.uv ? g.attributes.uv.array : null;
    if (t) {
      uv.set(t, uo);
    }
    uo += g.attributes.position.count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** A translated, optionally rotated box, ready to merge. */
export function boxAt(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** A box whose side faces get UVs scaled to `uPerMeter`/`vPerMeter`, so one facade texture tiles correctly. */
export function facadeBox(w, h, d, x, y, z, uPerMetre, vPerMetre) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Box face order: +X, -X, +Y, -Y, +Z, -Z. Each face is 4 vertices.
  const faceSizes = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [uw, vh] = faceSizes[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * uw * uPerMetre, uv.getY(i) * vh * vPerMetre);
    }
  }
  g.translate(x, y, z);
  return g;
}

/**
 * Collects upward-facing quads (road paint, crosswalks, plazas) and emits one
 * BufferGeometry, so every white line in the city is a single draw call.
 */
export class FlatQuads {
  constructor(y = 0.021) {
    this.y = y;
    this.pos = [];
    this.uvs = [];
    this.normals = [];
  }
  rect(cx, cz, w, d, y = this.y, uScale = 1) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const p = this.pos;
    const n = this.normals;
    p.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let i = 0; i < 6; i++) n.push(0, 1, 0);
    const us = uScale;
    this.uvs.push(0, 0, 0, d * us, w * us, d * us, 0, 0, w * us, d * us, w * us, 0);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** A flat XZ plane centred at (x,z) with tiled UVs, for road and sidewalk surfaces. */
export function tiledPlane(w, d, x, y, z, uRepeat, vRepeat) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uRepeat, uv.getY(i) * vRepeat);
  g.translate(x, y, z);
  return g;
}
