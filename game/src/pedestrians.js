// Pedestrians on the sidewalks. Each one walks the paving in front of a block,
// turning at the corners, and reacts to the world around it: a car passing too
// close, gunfire, or the player pushing through them sends them running for a
// moment with an arm raised.

import * as THREE from '../../vendor/three.module.min.js';
import { CITY } from './config.js';
import { mergeGeometries, boxAt, clamp } from './util.js';
import { Rng } from './rng.js';
import { groundHeightAt } from './roads.js';

const SKIN = [0xd8a077, 0xb87a52, 0x8d5a3b, 0xf0c4a0, 0x6b4630];
const SHIRT = [0xf4efe3, 0x2f8f9a, 0xe2604a, 0xf2c14e, 0x8079b8, 0x3b5a7a, 0xd98ba0];
const PANTS = [0x3d4a5c, 0x8a7a63, 0x2b2f36, 0xd7cdb6, 0x5a6b7d];

/** A pedestrian's body: head, torso, two arms, two legs, all merged by material. */
function buildPedBody() {
  return {
    torso: mergeGeometries([boxAt(0.42, 0.62, 0.24, 0, 1.24, 0), boxAt(0.46, 0.12, 0.26, 0, 0.94, 0)]),
    head: mergeGeometries([
      (() => { const g = new THREE.SphereGeometry(0.13, 10, 8); g.scale(1, 1.18, 1.06); g.translate(0, 1.68, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.055, 0.06, 0.12, 6); g.translate(0, 1.53, 0); return g; })(),
    ]),
    arm: mergeGeometries([boxAt(0.11, 0.56, 0.13, 0, -0.24, 0)]),
    leg: mergeGeometries([boxAt(0.15, 0.86, 0.17, 0, -0.42, 0)]),
  };
}

let pedAssets = null;

export class Pedestrian {
  constructor(scene, layout, rng, blockIndex) {
    if (!pedAssets) {
      const geo = buildPedBody();
      pedAssets = {
        geo,
        skinMats: SKIN.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
        shirtMats: SHIRT.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
        pantMats: PANTS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
      };
    }
    const A = pedAssets;
    this.scene = scene;
    this.rng = rng;
    this.layout = layout;

    this.group = new THREE.Group();
    this.torso = new THREE.Mesh(A.geo.torso, rng.pick(A.shirtMats));
    this.head = new THREE.Mesh(A.geo.head, rng.pick(A.skinMats));
    this.torso.castShadow = true;
    this.head.castShadow = true;
    for (const m of [this.torso, this.head]) {
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.arms = [];
    this.legs = [];
    for (const s of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(s * 0.27, 1.44, 0);
      const arm = new THREE.Mesh(A.geo.arm, this.torso.material);
      arm.castShadow = true;
      armPivot.add(arm);
      this.group.add(armPivot);
      this.arms.push(armPivot);

      const legPivot = new THREE.Group();
      legPivot.position.set(s * 0.12, 0.86, 0);
      const leg = new THREE.Mesh(A.geo.leg, rng.pick(A.pantMats));
      leg.castShadow = true;
      legPivot.add(leg);
      this.group.add(legPivot);
      this.legs.push(legPivot);
    }
    this.scale = rng.float(0.92, 1.06);
    this.group.scale.setScalar(this.scale);

    const block = layout.blocks[blockIndex % layout.blocks.length];
    this.block = block;
    const inset = rng.float(1.8, CITY.sidewalk - 1.2);
    this.pathInset = inset;
    // Walk the perimeter of the block's sidewalk, anticlockwise or clockwise.
    this.cw = rng.chance(0.5);
    this.corner = rng.int(0, 3);
    this.walkPhase = rng.float(0, Math.PI * 2);
    this.speed = rng.float(1.0, 1.6);
    this.baseSpeed = this.speed;
    this.fear = 0;
    this.alarmYaw = 0;
    this.armRaise = 0;
    this.alive = true;
    this.life = rng.float(0, 1000);

    this.placeAtCorner(this.corner);
  }

  cornerPos(i) {
    const b = this.block;
    const o = b.half + CITY.sidewalk * 0.55;
    const pts = [
      { x: b.cx - o, z: b.cz - o },
      { x: b.cx + o, z: b.cz - o },
      { x: b.cx + o, z: b.cz + o },
      { x: b.cx - o, z: b.cz + o },
    ];
    return pts[i % 4];
  }

  placeAtCorner(i) {
    const b = this.block;
    const off = b.half + this.pathInset;
    // Sit on the edge for corner i, heading toward the next.
    const edges = [
      { x: b.cx + (this.cw ? -off : off), z: b.cz - off },
      { x: b.cx + off, z: b.cz + (this.cw ? -off : off) },
      { x: b.cx + (this.cw ? off : -off), z: b.cz + off },
      { x: b.cx - off, z: b.cz + (this.cw ? off : -off) },
    ];
    const e = edges[i % 4];
    this.x = e.x + this.rng.float(-0.4, 0.4);
    this.z = e.z + this.rng.float(-0.4, 0.4);
  }

  targetCorner() {
    const b = this.block;
    const off = b.half + this.pathInset;
    // Target the far end of the current edge, so the walker hugs the kerb.
    const edges = [
      { x: b.cx + (this.cw ? -off : off), z: b.cz + off },
      { x: b.cx - off, z: b.cz + (this.cw ? -off : off) },
      { x: b.cx + (this.cw ? off : -off), z: b.cz - off },
      { x: b.cx + off, z: b.cz + (this.cw ? off : -off) },
    ];
    return edges[this.corner % 4];
  }

  startle(amount, yaw) {
    this.fear = Math.min(1.6, this.fear + amount);
    if (yaw !== undefined) this.alarmYaw = yaw;
  }

  update(dt, playerPos, playerInCar) {
    this.life += dt;
    this.fear = Math.max(0, this.fear - dt * 0.55);
    if (!this.alive) {
      this.group.rotation.z = Math.PI / 2 * Math.min(1, (this.deadFor = (this.deadFor ?? 0) + dt) * 2);
      this.group.position.y = Math.max(0, 0.15 - (this.deadFor ?? 0) * 0.15);
      return;
    }

    const t = this.targetCorner();
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const d = Math.hypot(dx, dz);
    const speed = this.speed * (1 + this.fear * 2.4);
    if (d < 0.6) {
      this.corner = (this.corner + (this.cw ? 1 : -1) + 4) % 4;
    } else {
      const yaw = Math.atan2(-dx, -dz);
      const cur = this.group.rotation.y;
      let delta = yaw - cur;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.group.rotation.y = cur + delta * Math.min(1, dt * 8);
      this.x += (dx / d) * speed * dt;
      this.z += (dz / d) * speed * dt;
    }

    // Sidestep the player when they get close on foot.
    if (playerPos && !playerInCar) {
      const pd = Math.hypot(playerPos.x - this.x, playerPos.z - this.z);
      if (pd < 1.6 && pd > 0.01) {
        this.x += ((this.x - playerPos.x) / pd) * dt * 1.6;
        this.z += ((this.z - playerPos.z) / pd) * dt * 1.6;
        this.startle(0.2);
      }
    }

    const ground = groundHeightAt(this.layout, this.x, this.z);
    this.group.position.set(this.x, ground, this.z);

    this.walkPhase += dt * (2.2 + speed * 2.6);
    const swing = Math.sin(this.walkPhase) * (this.fear > 0.15 ? 0.55 : 0.42) * clamp(speed, 0.2, 2);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    // Arms up and flailing while frightened.
    this.armRaise += ((this.fear > 0.25 ? 2.4 : 0) - this.armRaise) * Math.min(1, dt * 6);
    this.arms[0].rotation.z = this.armRaise;
    this.arms[1].rotation.z = -this.armRaise;
    // Slight bob.
    this.group.position.y = ground + Math.abs(Math.sin(this.walkPhase)) * 0.03;
  }

  kill() {
    this.alive = false;
    this.deadFor = 0;
  }

  remove() {
    this.scene.remove(this.group);
    this.dead = true;
  }
}

export function createPedestrians(scene, layout, count = 70) {
  const rng = new Rng(0x9ed5);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = new Pedestrian(scene, layout, rng, i);
    scene.add(p.group);
    peds.push(p);
  }
  return peds;
}

/** Startle every pedestrian within radius, e.g. from gunfire. */
export function panicNearby(peds, x, z, radius, strength = 0.9) {
  for (const p of peds) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) p.startle(strength * (1 - d / radius) + 0.2);
  }
}
