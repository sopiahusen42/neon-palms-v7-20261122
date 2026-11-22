// Building massing and facades. Each lot gets a stucco block whose frontage is
// a canvas facade (window grid, sills, floor bands) tiled by the metre, plus a
// deco cornice, occasional rooftop crown, ground-floor shopfront and a striped
// awning. One material per palette keeps the draw count low.

import * as THREE from '../vendor/three.module.min.js';
import { facadeTexture, shopfrontTexture, awningTexture } from './textures.js';
import { facadeBox, boxAt, mergeGeometries } from './util.js';

const FACADE_RANGE = { u: 1 / 8, v: 1 / 16 }; // texture covers 8 m x 16 m

export function buildBuildings(scene, layout) {
  // Cache one facade material per (palette colour, style) so 200 buildings use
  // maybe 20 materials.
  const facadeCache = new Map();
  const shopCache = new Map();
  const awningCache = new Map();
  const groups = new Map(); // material key -> geometry list

  const facadeMaterial = (colour, style, seed) => {
    const key = `${colour}-${style}`;
    let mat = facadeCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: facadeTexture(colour, seed + style * 977, style),
        roughness: 0.82,
        metalness: 0.02,
        color: 0xffffff,
      });
      facadeCache.set(key, mat);
    }
    return mat;
  };
  const shopMaterial = (colour, seed) => {
    const key = `${colour}`;
    let mat = shopCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: shopfrontTexture(colour, seed),
        roughness: 0.55,
        metalness: 0.1,
        color: 0xffffff,
      });
      shopCache.set(key, mat);
    }
    return mat;
  };
  const awningMaterial = (a, b) => {
    const key = `${a}-${b}`;
    let mat = awningCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: awningTexture(a, b),
        roughness: 0.8,
        side: THREE.DoubleSide,
        color: 0xffffff,
      });
      awningCache.set(key, mat);
    }
    return mat;
  };

  const push = (mat, geom) => {
    const key = mat.uuid;
    if (!groups.has(key)) groups.set(key, { mat, geoms: [] });
    groups.get(key).geoms.push(geom);
  };

  const trimMat = new THREE.MeshStandardMaterial({ color: 0xfbf4e2, roughness: 0.78 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.95 });
  const stuccoTrim = new THREE.MeshStandardMaterial({ color: 0xf3e8d2, roughness: 0.86 });

  for (const b of layout.buildings) {
    const h = b.floors * b.storey;
    const baseY = 0.15;
    const facadeMat = facadeMaterial(b.colour, b.style, b.seed);

    // Main mass, facade UVs scaled by the metre so windows stay square.
    const main = facadeBox(b.w, h, b.d, b.x, baseY + h / 2, b.z, FACADE_RANGE.u, FACADE_RANGE.v);
    push(facadeMat, main);

    // Cornice cap: a slightly wider slab at the roofline, plus a thin shadow
    // reveal under it. The two together give the skyline its art-deco lip.
    const cornice = boxAt(b.w + 0.9, 0.55, b.d + 0.9, b.x, baseY + h + 0.28, b.z);
    push(trimMat, cornice);
    const reveal = boxAt(b.w + 0.35, 0.32, b.d + 0.35, b.x, baseY + h - 0.18, b.z);
    push(stuccoTrim, reveal);

    // Parapet and roof slab.
    const roof = boxAt(b.w - 0.4, 0.3, b.d - 0.4, b.x, baseY + h + 0.6, b.z);
    push(roofMat, roof);

    // A set-back upper storey on the taller deco blocks, for silhouette.
    if (b.setback > 0 && b.floors >= 6) {
      const upH = b.storey * 2;
      const up = facadeBox(b.w * 0.66, upH, b.d * 0.66, b.x, baseY + h + 0.7 + upH / 2, b.z, FACADE_RANGE.u, FACADE_RANGE.v);
      push(facadeMat, up);
      push(trimMat, boxAt(b.w * 0.72, 0.5, b.d * 0.72, b.x, baseY + h + upH + 0.9, b.z));
      if (b.crown) {
        // Deco trilobe crown: three slabs stepping up in the middle.
        const cy = baseY + h + upH + 1.2;
        push(trimMat, boxAt(b.w * 0.4, 1.4, b.d * 0.4, b.x, cy + 0.7, b.z));
        push(trimMat, boxAt(b.w * 0.22, 1.3, b.d * 0.22, b.x, cy + 2.0, b.z));
      }
    }

    // Ground floor: glass shopfront strip on the two street-facing sides.
    const shopH = 3.6;
    const f = b.faces;
    const shopMat = shopMaterial(b.colour, b.seed + 31);
    if (f.sx < 0) push(shopMat, facadeBox(0.1, shopH, Math.min(b.d - 2, 28), b.x - b.w / 2 - 0.06, baseY + shopH / 2, b.z, 1 / 6, 1 / 4));
    if (f.sx > 0) push(shopMat, facadeBox(0.1, shopH, Math.min(b.d - 2, 28), b.x + b.w / 2 + 0.06, baseY + shopH / 2, b.z, 1 / 6, 1 / 4));
    if (f.sz < 0) push(shopMat, facadeBox(Math.min(b.w - 2, 28), shopH, 0.1, b.x, baseY + shopH / 2, b.z - b.d / 2 - 0.06, 1 / 6, 1 / 4));
    if (f.sz > 0) push(shopMat, facadeBox(Math.min(b.w - 2, 28), shopH, 0.1, b.x, baseY + shopH / 2, b.z + b.d / 2 + 0.06, 1 / 6, 1 / 4));

    // Striped awning over the street frontage, sloping down and out.
    if (b.awning) {
      const awnMat = awningMaterial(b.awningColour, 0xf7efdc);
      const depth = 2.2;
      const makeAwning = (w, x, z, rotY) => {
        const g = new THREE.BoxGeometry(w, 0.14, depth);
        g.rotateX(0.2);
        g.rotateY(rotY);
        g.translate(x, baseY + shopH + 0.35, z);
        push(awnMat, g);
      };
      const len = Math.min(b.d - 4, 26);
      const lenW = Math.min(b.w - 4, 26);
      if (f.sx < 0) makeAwning(len, b.x - b.w / 2 - depth / 2 + 0.1, b.z, Math.PI / 2);
      if (f.sx > 0) makeAwning(len, b.x + b.w / 2 + depth / 2 - 0.1, b.z, Math.PI / 2);
      if (f.sz < 0) makeAwning(lenW, b.x, b.z - b.d / 2 - depth / 2 + 0.1, 0);
      if (f.sz > 0) makeAwning(lenW, b.x, b.z + b.d / 2 + depth / 2 - 0.1, 0);
    }

    // Rooftop clutter: a low parapet box and an AC unit, sparse.
    if (b.seed % 3 === 0) {
      push(roofMat, boxAt(2.4, 1.1, 1.8, b.x + b.w * 0.2, baseY + h + 1.2, b.z - b.d * 0.2));
    }
  }

  const meshes = [];
  for (const { mat, geoms } of groups.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geoms), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}
