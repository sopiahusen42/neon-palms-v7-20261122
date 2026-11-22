// The city's block and lot layout, generated once from a fixed seed: which lots
// hold buildings, how tall they are and in which palette, where the palms and
// street furniture stand, and where cars may park. Everything downstream reads
// this layout instead of inventing positions.

import { CITY, PALETTES } from './config.js';
import { Rng } from './rng.js';

export const DISTRICTS = [
  { id: 0, name: 'Coral Row', kind: 'lowrise' },
  { id: 1, name: 'Sunset Verge', kind: 'deco' },
  { id: 2, name: 'Marisol Heights', kind: 'tower' },
  { id: 3, name: 'Pelican Quay', kind: 'shopfront' },
  { id: 4, name: 'Verano Strip', kind: 'mixed' },
];

export const RADIO_STATIONS = [
  { name: 'SUNSET FM 98.4', tag: 'Coastal soul & slow jams' },
  { name: 'PALM WAVE 101.1', tag: 'Surf rock and neon synths' },
  { name: 'QUAY TALK 88.2', tag: 'Late-night call-in radio' },
  { name: 'VERANO BEAT 95.7', tag: 'Reggaeton and bass' },
  { name: 'KNEON 107.9', tag: 'Night-drive electronica' },
];

const FACADE_STYLES = [0, 1, 2];

export function roadPositions() {
  const out = [];
  const n = CITY.roadCount;
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * CITY.pitch);
  return out;
}

/**
 * Builds the whole static layout: the road grid, block plinths, building specs,
 * palm rows and street furniture anchors. Deterministic for the given seed.
 */
export function generateCity(seed = CITY.seed) {
  const rng = new Rng(seed);
  const roads = roadPositions();
  const blocks = [];
  const buildings = [];
  const palms = [];
  const lamps = [];
  const hydrants = [];
  const benches = [];
  const bins = [];
  const planters = [];
  const busStops = [];
  const parking = [];
  const billboardSpots = [];

  const n = CITY.roadCount;
  const walkOuter = CITY.walkOuter;
  const lotHalf = (CITY.pitch - 2 * walkOuter) / 2; // half the buildable block face
  const blockHalf = (CITY.pitch - CITY.roadWidth) / 2; // half the paved block, kerb to centre

  for (let bi = 0; bi < n - 1; bi++) {
    for (let bj = 0; bj < n - 1; bj++) {
      const cx = (roads[bi] + roads[bi + 1]) / 2;
      const cz = (roads[bj] + roads[bj + 1]) / 2;
      const district = DISTRICTS[Math.min(4, Math.abs(Math.round(cx / CITY.pitch)) + Math.abs(Math.round(cz / CITY.pitch)))];
      const block = { cx, cz, half: blockHalf, district, index: blocks.length };
      blocks.push(block);

      // Four building plots per block, one per quadrant, each facing two streets.
      const plotHalf = lotHalf - 2.5;
      const quads = [
        { x: cx - lotHalf / 2, z: cz - lotHalf / 2, sx: -1, sz: -1 },
        { x: cx + lotHalf / 2, z: cz - lotHalf / 2, sx: 1, sz: -1 },
        { x: cx - lotHalf / 2, z: cz + lotHalf / 2, sx: -1, sz: 1 },
        { x: cx + lotHalf / 2, z: cz + lotHalf / 2, sx: 1, sz: 1 },
      ];
      for (const q of quads) {
        // Every so often a plot is left open as a paved forecourt with palms.
        if (rng.chance(0.1)) {
          planters.push({ x: q.x, z: q.z, r: 3.2 });
          continue;
        }
        const tall = district.kind === 'tower' ? rng.chance(0.55) : rng.chance(0.16);
        const floors = tall ? rng.int(7, 13) : rng.int(3, 6);
        const w = rng.float(19, 27);
        const d = rng.float(19, 27);
        const paletteKey = rng.pick(
          district.kind === 'shopfront'
            ? ['stucco', 'coral', 'stucco', 'turquoise']
            : district.kind === 'deco'
              ? ['stucco', 'blush', 'sand', 'turquoise']
              : ['stucco', 'coral', 'sand', 'turquoise', 'blush'],
        );
        const palette = PALETTES[paletteKey];
        buildings.push({
          x: q.x + (rng.float(-2, 2)),
          z: q.z + (rng.float(-2, 2)),
          w,
          d,
          floors,
          storey: rng.float(3.0, 3.5),
          colour: rng.pick(palette),
          style: rng.pick(FACADE_STYLES),
          seed: rng.int(1, 99999),
          awning: rng.chance(0.7),
          awningColour: rng.pick([0xe2604a, 0x2f9e94, 0xf2a03c, 0x2b5f8a]),
          // The two sides that face the streets this plot sits against.
          faces: q,
          accent: rng.pick([0xf3e6cd, 0xffffff, 0xf6cdb6]),
          crown: rng.chance(0.35),
          setback: rng.chance(0.3) ? rng.float(1.5, 3.5) : 0,
        });
      }
    }
  }

  // Palms line every kerb, with an uneven rhythm so the rows never read as a
  // cloned picket fence.
  for (const rx of roadPositions()) {
    for (let k = 0; k < n - 1; k++) {
      const z0 = roads[k];
      const z1 = roads[k + 1];
      for (const side of [-1, 1]) {
        const x = rx + side * (CITY.halfRoad + 2.6);
        let z = z0 + rng.float(10, 17);
        while (z <= z1 - 11) {
          if (!rng.chance(0.14)) {
            palms.push({
              x: x + rng.float(-0.35, 0.35),
              z,
              height: rng.float(9.5, 18.5),
              lean: rng.float(-0.14, 0.14),
              yaw: rng.float(0, Math.PI * 2),
              scale: rng.float(0.82, 1.22),
            });
          }
          z += rng.float(11, 23);
        }
      }
    }
  }

  // Lamps on the opposite kerb from the palms, twice per block side.
  for (const rz of roadPositions()) {
    for (let k = 0; k < n - 1; k++) {
      const x0 = roads[k];
      const x1 = roads[k + 1];
      for (const side of [-1, 1]) {
        const z = rz + side * (CITY.halfRoad + 1.6);
        for (let x = x0 + 20; x <= x1 - 16; x += 34) {
          lamps.push({ x, z, yaw: side > 0 ? 0 : Math.PI });
        }
      }
    }
  }

  // Street furniture, sparse and deterministic.
  for (const p of palms) {
    if (rng.chance(0.1)) hydrants.push({ x: p.x + rng.float(-1.2, 1.2), z: p.z + rng.float(-1.2, 1.2) });
    if (rng.chance(0.12)) benches.push({ x: p.x + rng.sign() * 0.9, z: p.z + rng.float(-3, 3), yaw: rng.chance(0.5) ? 0 : Math.PI });
    if (rng.chance(0.09)) bins.push({ x: p.x - 1.1, z: p.z + rng.float(-2, 2) });
  }
  for (const block of blocks) {
    for (let i = 0; i < 2; i++) {
      const edge = rng.int(0, 3);
      const t = rng.float(-0.5, 0.5);
      const off = CITY.halfRoad + 3.4;
      const st = {
        x: block.cx + (edge === 0 ? -off : edge === 1 ? off : t * block.half),
        z: block.cz + (edge === 2 ? -off : edge === 3 ? off : t * block.half),
        yaw: edge === 0 ? Math.PI / 2 : edge === 1 ? -Math.PI / 2 : edge === 2 ? 0 : Math.PI,
      };
      if (i === 0) busStops.push(st);
      else billboardSpots.push(st);
    }
  }

  // Parking slots along the kerb, in the outer lane, on both sides of every road.
  for (const rx of roadPositions()) {
    for (let k = 0; k < n - 1; k++) {
      for (const side of [-1, 1]) {
        for (let s = 0; s < 4; s++) {
          if (rng.chance(0.45)) continue;
          parking.push({
            x: rx + side * (CITY.halfRoad + 1.9),
            z: roads[k] + 18 + s * 15 + rng.float(-1.5, 1.5),
            yaw: side > 0 ? 0 : Math.PI,
          });
        }
      }
    }
  }

  return {
    roads,
    blocks,
    buildings,
    palms,
    lamps,
    hydrants,
    benches,
    bins,
    planters,
    busStops,
    billboardSpots,
    parking,
    lotHalf,
    blockHalf,
    seed,
  };
}
