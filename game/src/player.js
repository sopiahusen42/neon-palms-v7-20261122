// The player: a drivable car with weighted arcade handling (engine, brakes,
// grip that lets the tail step out, steering that needs speed), and Marisol on
// foot, walking on a camera-relative basis with a drawn pistol.

import * as THREE from '../../vendor/three.module.min.js';
import { CITY, PLAYER } from './config.js';
import { createCarMesh, CAR_PAINT } from './vehicles.js';
import { mergeGeometries, boxAt, clamp, damp, wrapAngle, lerpAngle } from './util.js';
import { groundHeightAt } from './roads.js';

const FORWARD = new THREE.Vector3();

/**
 * A car the game can drive. Physics is a two-axis velocity model: the forward
 * component is driven by throttle and brakes, the lateral component bleeds off
 * with grip, so hard cornering slides the tail wide before it hooks up.
 */
export class DrivableCar {
  constructor(scene, { kind = 'coupe', colour = 0xf2e7d2, x = 0, z = 0, yaw = 0 } = {}) {
    this.scene = scene;
    this.mesh = createCarMesh(kind, colour);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    scene.add(this.mesh);
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.health = 100;
    this.occupied = false;
    this.isPolice = false;
    this.stealable = true;
    this.spec = this.mesh.userData.spec;
    this.length = this.spec.len;
    this.width = this.spec.width;
  }

  get forward() {
    return FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Throttle -1..1, brake 0..1, steer -1..1. */
  drive(dt, throttle, brake, steerInput, handbrake = false) {
    const fwd = this.forward.clone();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let vf = this.vx * fwd.x + this.vz * fwd.z;
    let vr = this.vx * right.x + this.vz * right.z;

    const maxSpeed = 34;
    const accel = 15.5;
    const reverseMax = -9;

    if (throttle > 0) {
      const head = 1 - clamp(vf / maxSpeed, 0, 1) * 0.82;
      vf += throttle * accel * head * dt;
    } else if (throttle < 0) {
      if (vf > 0.4) vf += throttle * 26 * dt; // brake when rolling forward
      else vf += throttle * 7.5 * dt; // reverse
    }
    if (brake > 0) {
      const a = vf > 0 ? 22 : 8;
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), a * brake * dt);
    }
    // Rolling resistance and air drag.
    vf -= vf * 0.55 * dt;
    vf = clamp(vf, reverseMax, maxSpeed);

    // Grip: the lateral component decays, less so under handbrake or at speed.
    const grip = handbrake ? 1.6 : 7.5 - clamp(Math.abs(vf) / maxSpeed, 0, 1) * 2.6;
    vr *= Math.exp(-grip * dt);

    // Steering: needs motion, and the wheel angle eases in.
    const speedFactor = clamp(Math.abs(vf) / 9, 0, 1) * (1 - clamp(Math.abs(vf) / 52, 0, 0.45));
    this.steer = damp(this.steer, steerInput, 9, dt);
    const turnRate = 1.95 * speedFactor * (handbrake ? 1.45 : 1);
    this.yaw += this.steer * turnRate * dt * Math.sign(vf || 1);
    // A sliding car loses some speed and gains a little yaw from the slip.
    this.yaw += vr * 0.012 * dt * Math.sign(vf || 1);

    // Rebuild velocity from the new axes.
    const nf = this.forward.clone();
    const nr = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.vx = nf.x * vf + nr.x * vr;
    this.vz = nf.z * vf + nr.z * vr;
    this.speed = vf;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    const ground = groundHeightAt(this.scene.userData.layout, this.x, this.z);
    this.mesh.position.set(this.x, ground, this.z);
    this.mesh.rotation.y = this.yaw;
    this.wheelSpin -= (this.speed / 0.36) * dt;
    for (const w of this.mesh.userData.wheels) w.tyre.rotation.x = this.wheelSpin;
    for (const w of this.mesh.userData.frontWheels) w.pivot.rotation.y = this.steer * 0.45;
    // Body roll under cornering, and a little squat under throttle.
    const roll = -this.steer * clamp(Math.abs(this.speed) / 24, 0, 1) * 0.055;
    this.mesh.rotation.z = damp(this.mesh.rotation.z ?? 0, roll, 6, dt);
    this.mesh.rotation.x = damp(this.mesh.rotation.x ?? 0, clamp(-this.vx * 0.002, -0.02, 0.02), 5, dt);
  }

  /** Push out of building footprints and off the map. Returns true on impact. */
  collide(layout) {
    let hit = false;
    for (const b of layout.buildings) {
      const hw = b.w / 2 + 0.6;
      const hd = b.d / 2 + 0.6;
      if (this.x > b.x - hw && this.x < b.x + hw && this.z > b.z - hd && this.z < b.z + hd) {
        const dx = Math.min(this.x - (b.x - hw), b.x + hw - this.x);
        const dz = Math.min(this.z - (b.z - hd), b.z + hd - this.z);
        if (dx < dz) {
          this.x += this.x < b.x ? -dx : dx;
          this.vx *= -0.28;
        } else {
          this.z += this.z < b.z ? -dz : dz;
          this.vz *= -0.28;
        }
        this.speed *= 0.35;
        hit = true;
      }
    }
    const lim = CITY.extent + 30;
    if (Math.abs(this.x) > lim) {
      this.x = clamp(this.x, -lim, lim);
      this.vx *= -0.3;
      hit = true;
    }
    if (Math.abs(this.z) > lim) {
      this.z = clamp(this.z, -lim, lim);
      this.vz *= -0.3;
      hit = true;
    }
    return hit;
  }
}

/** Marisol's on-foot avatar: taller than a pedestrian, with a pistol in hand. */
function buildPlayerAvatar() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a077, roughness: 0.78 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.72 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x39475a, roughness: 0.86 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd9583f, roughness: 0.7 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.35, metalness: 0.7 });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    mergeGeometries([boxAt(0.44, 0.6, 0.26, 0, 1.25, 0), boxAt(0.48, 0.13, 0.28, 0, 0.95, 0), boxAt(0.4, 0.16, 0.24, 0, 1.5, 0)]),
    jacket,
  );
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const belt = new THREE.Mesh(boxAt(0.47, 0.1, 0.28, 0, 1.0, 0), accent);
  group.add(belt);

  const head = new THREE.Mesh(
    mergeGeometries([
      (() => { const g = new THREE.SphereGeometry(0.135, 12, 10); g.scale(1, 1.2, 1.06); g.translate(0, 1.72, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.06, 0.07, 0.13, 8); g.translate(0, 1.56, 0); return g; })(),
    ]),
    skin,
  );
  head.castShadow = true;
  group.add(head);

  // Hair: a dark cap over the crown and a ponytail down the back.
  const hair = new THREE.Mesh(
    mergeGeometries([
      (() => { const g = new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62); g.scale(1, 1.1, 1.05); g.translate(0, 1.75, 0.01); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.055, 0.035, 0.34, 6); g.rotateX(0.28); g.translate(0, 1.58, 0.17); return g; })(),
    ]),
    new THREE.MeshStandardMaterial({ color: 0x2b201c, roughness: 0.85 }),
  );
  hair.castShadow = true;
  group.add(hair);

  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.285, 1.45, 0);
    const arm = new THREE.Mesh(boxAt(0.115, 0.56, 0.14, 0, -0.25, 0), jacket);
    arm.castShadow = true;
    pivot.add(arm);
    // Forearm and hand.
    const hand = new THREE.Mesh(boxAt(0.1, 0.11, 0.12, 0, -0.56, 0), skin);
    pivot.add(hand);
    group.add(pivot);
    arms.push(pivot);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.125, 0.87, 0);
    const leg = new THREE.Mesh(boxAt(0.16, 0.86, 0.18, 0, -0.43, 0), pants);
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(boxAt(0.17, 0.1, 0.26, 0, -0.85, -0.03), new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.8 }));
    pivot.add(shoe);
    group.add(pivot);
    legs.push(pivot);
  }

  // The pistol, in the right hand, pointing forward (-Z).
  const gun = new THREE.Mesh(
    mergeGeometries([
      boxAt(0.075, 0.1, 0.34, 0, 0, -0.1),
      boxAt(0.06, 0.17, 0.09, 0, -0.11, 0.02),
      boxAt(0.05, 0.05, 0.1, 0, 0.05, 0.05),
    ]),
    gunMat,
  );
  gun.position.set(0, -0.5, -0.06);
  gun.castShadow = true;
  arms[1].add(gun);

  group.userData = { torso, head, hair, arms, legs, gun };
  return group;
}

export class OnFootPlayer {
  constructor(scene) {
    this.scene = scene;
    this.group = buildPlayerAvatar();
    this.group.visible = false;
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.walkPhase = 0;
    this.health = PLAYER.health;
    this.alive = true;
    this.shooting = false;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.hurtFlash = 0;
  }

  spawn(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
  }

  /** move: {x,z} in world space, running flag, aiming yaw from the camera. */
  update(dt, move, running, camYaw, aimPitch) {
    const len = Math.hypot(move.x, move.z);
    const speed = running ? 6.4 : 3.4;
    const tx = len > 0.05 ? (move.x / len) * speed : 0;
    const tz = len > 0.05 ? (move.z / len) * speed : 0;
    this.vx = damp(this.vx, tx, 12, dt);
    this.vz = damp(this.vz, tz, 12, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yaw = lerpAngle(this.yaw, camYaw, 1 - Math.exp(-11 * dt));

    const ground = groundHeightAt(this.scene.userData.layout, this.x, this.z);
    this.group.position.set(this.x, ground, this.z);
    this.group.rotation.y = this.yaw;

    const moving = Math.hypot(this.vx, this.vz);
    this.walkPhase += dt * (3 + moving * 1.6);
    const swing = Math.sin(this.walkPhase) * clamp(moving / 5, 0, 1) * 0.62;
    const { legs, arms } = this.group.userData;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    // Right arm holds the pistol up and forward; left arm swings.
    arms[0].rotation.x = -swing * 0.7;
    arms[1].rotation.x = -1.42 + clamp(aimPitch, -0.5, 0.5) * 0.6;
    arms[1].rotation.z = -0.06;
    this.group.position.y = ground + Math.abs(Math.sin(this.walkPhase)) * 0.035;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
  }

  aim(yaw, pitch) {
    this.aimYaw = yaw;
    this.aimPitch = pitch;
  }

  /** World position of the muzzle, for tracers and muzzle flash. */
  muzzle(out = new THREE.Vector3()) {
    const yaw = this.yaw;
    return out.set(this.x - Math.sin(yaw) * 0.55, 1.4, this.z - Math.cos(yaw) * 0.55);
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 1;
    if (this.health <= 0) this.alive = false;
    return this.health <= 0;
  }
}

/** The player's own car: a coupe in cream with a coral stripe, parked at the spawn. */
export function createPlayerCar(scene, x, z, yaw) {
  const car = new DrivableCar(scene, { kind: 'coupe', colour: 0xf2e7d2, x, z, yaw });
  // A coral stripe along each flank so the hero car reads as ours.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2604a, roughness: 0.4, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 3.5), stripeMat);
    stripe.position.set(s * 0.93, 0.84, 0.05);
    car.mesh.add(stripe);
  }
  return car;
}
