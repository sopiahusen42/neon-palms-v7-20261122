// Road surfaces, kerbs, crosswalks and street paint. Every road is one long
// tiled plane with painted markings, so lane lines run continuously; the
// intersections get their own plain asphalt patch, and all the white paint
// (ladder crosswalks, stop bars) is merged into one mesh. A wide pale base
// plane sits under everything so the horizon never shows through.

import * as THREE from '../../vendor/three.module.min.js';
import { CITY } from './config.js';
import { roadTexture, sidewalkTexture } from './textures.js';
import { FlatQuads, tiledPlane, mergeGeometries, boxAt } from './util.js';

export function buildRoads(scene, layout) {
  const roads = layout.roads;
  const extent = CITY.extent;
  const roadLen = extent * 2 + 120;

  // Base: wide pale sand/concrete apron under the whole map.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(3600, 3600),
    new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.98, metalness: 0 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.06;
  base.receiveShadow = true;
  scene.add(base);

  const asphalt = new THREE.MeshStandardMaterial({
    map: roadTexture(),
    roughness: 0.93,
    metalness: 0,
    color: 0xffffff,
  });

  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 });
  const walkMat = new THREE.MeshStandardMaterial({
    map: sidewalkTexture(),
    roughness: 0.92,
    color: 0xffffff,
  });

  const roadGeoms = [];
  const walkGeoms = [];
  const kerbGeoms = [];

  const halfRoad = CITY.roadWidth / 2;
  const walkH = 0.15;

  const addStrip = (cx, cz, length, width, along) => {
    if (along === 'z') roadGeoms.push(tiledPlane(width, length, cx, 0, cz, 1, length / 20));
    else roadGeoms.push(tiledPlane(length, width, cx, 0, cz, length / 20, 1));
  };

  for (const x of roads) addStrip(x, 0, roadLen, CITY.roadWidth, 'z');
  for (const z of roads) addStrip(0, z, roadLen, CITY.roadWidth, 'x');

  const roadMesh = new THREE.Mesh(mergeGeometries(roadGeoms), asphalt);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  // Raised sidewalks: one paved slab per block, with a real 0.15 m kerb face
  // around it so the curb lip catches the low sun.
  for (const block of layout.blocks) {
    const size = block.half * 2;
    walkGeoms.push(tiledPlane(size, size, block.cx, walkH, block.cz, size / 12, size / 12));
    const lip = 0.2;
    kerbGeoms.push(boxAt(size + lip * 2, walkH, lip, block.cx, walkH / 2, block.cz - block.half - lip / 2));
    kerbGeoms.push(boxAt(size + lip * 2, walkH, lip, block.cx, walkH / 2, block.cz + block.half + lip / 2));
    kerbGeoms.push(boxAt(lip, walkH, size, block.cx - block.half - lip / 2, walkH / 2, block.cz));
    kerbGeoms.push(boxAt(lip, walkH, size, block.cx + block.half + lip / 2, walkH / 2, block.cz));
  }
  const walkMesh = new THREE.Mesh(mergeGeometries(walkGeoms), walkMat);
  walkMesh.receiveShadow = true;
  scene.add(walkMesh);

  const kerbMesh = new THREE.Mesh(mergeGeometries(kerbGeoms), kerbMat);
  kerbMesh.receiveShadow = true;
  kerbMesh.castShadow = true;
  scene.add(kerbMesh);

  // Painted white: a zebra ladder on all four approaches to every junction,
  // then a stop bar behind each, in the near lane only.
  const paint = new FlatQuads(0.023);
  const barLen = 3.2;
  const stripeGap = 1.15;
  for (const x of roads) {
    for (const z of roads) {
      const off = halfRoad + barLen / 2 + 1.0;
      for (const s of [-1, 1]) {
        // Across the north-south road (bars run along z, repeated along x).
        for (let i = -8; i <= 8; i++) {
          const bx = x + i * stripeGap;
          if (Math.abs(bx - x) > halfRoad - 1.0) continue;
          paint.rect(bx, z + s * off, 0.54, barLen);
        }
        // Across the east-west road (bars run along x, repeated along z).
        for (let i = -8; i <= 8; i++) {
          const bz = z + i * stripeGap;
          if (Math.abs(bz - z) > halfRoad - 1.0) continue;
          paint.rect(x + s * off, bz, barLen, 0.54);
        }
      }
      // Stop bars: halt line in the right-hand lane before each crosswalk.
      paint.rect(x + halfRoad / 2, z + off + barLen / 2 + 1.1, halfRoad - 1.4, 0.44);
      paint.rect(x - halfRoad / 2, z - off - barLen / 2 - 1.1, halfRoad - 1.4, 0.44);
      paint.rect(x - off - barLen / 2 - 1.1, z - halfRoad / 2, 0.44, halfRoad - 1.4);
      paint.rect(x + off + barLen / 2 + 1.1, z + halfRoad / 2, 0.44, halfRoad - 1.4);
    }
  }
  const paintMat = new THREE.MeshStandardMaterial({
    color: 0xf4f1e6,
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const paintMesh = new THREE.Mesh(paint.build(), paintMat);
  paintMesh.receiveShadow = true;
  scene.add(paintMesh);

  // Yellow centre bars carried across each junction so the double line reads
  // as continuous down the boulevard.
  const yellow = new FlatQuads(0.0215);
  for (const x of roads) {
    for (const z of roads) {
      yellow.rect(x - 0.44, z, 0.19, CITY.roadWidth + 6);
      yellow.rect(x + 0.44, z, 0.19, CITY.roadWidth + 6);
      yellow.rect(x, z - 0.44, CITY.roadWidth + 6, 0.19);
      yellow.rect(x, z + 0.44, CITY.roadWidth + 6, 0.19);
    }
  }
  const yellowMesh = new THREE.Mesh(
    yellow.build(),
    new THREE.MeshStandardMaterial({
      color: 0xe9c552,
      roughness: 0.76,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  yellowMesh.receiveShadow = true;
  scene.add(yellowMesh);

  // Lighter coping line where the sidewalk meets the kerb.
  const coping = new FlatQuads(walkH + 0.005);
  for (const block of layout.blocks) {
    const h = block.half;
    for (const s of [-1, 1]) {
      coping.rect(block.cx, block.cz + s * (h - 0.34), h * 2, 0.28);
      coping.rect(block.cx + s * (h - 0.34), block.cz, 0.28, h * 2);
    }
  }
  const copingMesh = new THREE.Mesh(
    coping.build(),
    new THREE.MeshStandardMaterial({ color: 0xe6dfcd, roughness: 0.9, side: THREE.DoubleSide }),
  );
  copingMesh.receiveShadow = true;
  scene.add(copingMesh);

  return { roadMesh, walkMesh, kerbMesh, paintMesh, walkH };
}

/** Surface height at a world position: 0.15 on a raised block, 0 on a road. */
export function groundHeightAt(layout, x, z) {
  for (const block of layout.blocks) {
    if (Math.abs(x - block.cx) < block.half && Math.abs(z - block.cz) < block.half) return 0.15;
  }
  return 0;
}
