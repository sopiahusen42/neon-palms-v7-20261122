// The city's dimensions and the game's tuning constants in one place: every
// other module reads the grid from here instead of hard-coding numbers.

export const CITY = {
  seed: 0x4e454f4e, // "NEON"
  pitch: 96, // metres between parallel road centrelines
  roadWidth: 20,
  sidewalk: 6,
  blockDepth: 76,
  lotInset: 3,
  roadCount: 5, // roads per axis, at -2..+2 pitch
  get halfRoad() {
    return this.roadWidth / 2;
  },
  get kerb() {
    return this.roadWidth / 2;
  },
  get walkOuter() {
    return this.roadWidth / 2 + this.sidewalk;
  },
  get extent() {
    return (this.roadCount - 1) * 0.5 * this.pitch + this.roadWidth / 2 + 40;
  },
};

export const LANES = [2.2, 6.0]; // driving-lane centre offsets from a road's centreline
export const PARKING_OFFSET = 8.4;

export const SUN = {
  // ~28 degrees above the horizon, ahead and to the left of a car heading -Z:
  // the sun rakes across the boulevard from the left, so every palm and lamp
  // throws a long shadow diagonally over the asphalt toward the camera.
  direction: { x: -0.62, y: 0.45, z: -0.46 },
  color: 0xfff0d8,
  intensity: 2.35,
  hemiSky: 0x9dc4ee,
  hemiGround: 0x8a7c62,
  hemiIntensity: 0.95,
};

export const SKY = {
  zenith: 0x1a5fb4,
  mid: 0x6fb0e2,
  horizon: 0xc6d6d4,
};

export const FOG = { color: 0xc6d6d4, near: 150, far: 700 };

export const PLAYER = {
  cash: 1480,
  health: 100,
  maxHealth: 100,
  ammo: 84,
  magSize: 17,
};

export const CAMERA = {
  chaseDistance: 9.6,
  chaseHeight: 4.4,
  chaseLookAhead: 6.5,
  chaseFov: 62,
  footDistance: 3.4,
  footHeight: 1.9,
  footFov: 66,
};

export const PALETTES = {
  stucco: [0xf2e2c8, 0xf7ebd6, 0xeadcc4, 0xf6f0e4, 0xe8d9bd],
  coral: [0xe98f77, 0xf0a58c, 0xd97c66, 0xf2b49b],
  turquoise: [0x6fc8c0, 0x8ad3c9, 0x59b6b0, 0xa9ded3],
  sand: [0xd8c49c, 0xe3d2ae, 0xcbb48c],
  blush: [0xf0c8c0, 0xe7b3ab],
};
