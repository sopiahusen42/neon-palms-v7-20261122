// Civilian traffic. Cars drive the grid on the right-hand lane, slow into
// junctions, choose to continue or turn from a seeded stream, and brake for
// whatever is in front of them. The same waypoint follower is reused by police
// patrols, so a cruiser between chases behaves like any other car.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, LANES } from './config.js';
import { createCarMesh, CAR_PAINT } from './vehicles.js';
import { Rng } from './rng.js';
import { clamp, distance2D } from './util.js';

const LANE = LANES[0];
const KINDS = ['coupe', 'saloon', 'coupe'];

/** Lane centre offset from a road's centreline for a given travel direction. */
export function laneOffset(axis, dir) {
  if (axis === 'z') return dir > 0 ? -LANE : LANE;
  return dir > 0 ? LANE : -LANE;
}

export class TrafficCar {
  constructor(scene, ax, az, axis, dir, kind, colour, rng) {
    this.rng = rng;
    this.axis = axis;
    this.dir = dir;
    this.mesh = createCarMesh(kind, colour);
    this.mesh.position.set(ax, 0, az);
    this.scene = scene;
    scene.add(this.mesh);
    this.x = ax;
    this.z = az;
    this.yaw = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.speed = rng ? rng.float(7, 12) : 8;
    this.cruise = this.speed;
    this.turn = null;
    this.pending = null;
    this.nextJunction = null;
    this.wheelSpin = 0;
    this.stopped = false;
    this.kind = kind;
    this.dead = false;
    this.honkTimer = 0;
    this.findNextJunction();
  }

  get axisPos() {
    return this.axis === 'z' ? this.z : this.x;
  }

  setAxisPos(v) {
    if (this.axis === 'z') this.z = v;
    else this.x = v;
  }

  get lat() {
    return this.axis === 'z' ? this.x : this.z;
  }

  setLat(v) {
    if (this.axis === 'z') this.x = v;
    else this.z = v;
  }

  findNextJunction() {
    const roads = this.scene.userData.roads ?? [];
    const here = this.axisPos;
    let best = null;
    for (const r of roads) {
      const d = (r - here) * this.dir;
      if (d > 1 && (best === null || d < best)) best = d;
    }
    this.nextJunction = best === null ? null : here + best * this.dir;
    this.pending = null;
  }

  /** Choose to continue or turn when approaching a junction. */
  decide() {
    const r = this.rng ? this.rng.next() : 0.5;
    if (r < 0.52) return null; // straight on
    return r < 0.78 ? 'right' : 'left';
  }

  beginTurn(turnDir) {
    const jn = this.nextJunction;
    const oldAxis = this.axis;
    const oldDir = this.dir;
    const entry = jn - oldDir * (CITY.halfRoad + 0.4);
    // Snap the car to the junction entry point before starting the arc.
    this.setAxisPos(entry);
    const p0 = new THREE.Vector2(this.x, this.z);

    const newAxis = oldAxis === 'z' ? 'x' : 'z';
    const newDir = oldDir * (turnDir === 'right' ? -1 : 1);
    const newLat = jn + laneOffset(newAxis, newDir);
    const exitAlong = jn + newDir * (CITY.halfRoad + 2.6);
    const p1x = newAxis === 'x' ? exitAlong : newLat;
    const p1z = newAxis === 'x' ? newLat : exitAlong;
    const p1 = new THREE.Vector2(p1x, p1z);
    const control = newAxis === 'x' ? new THREE.Vector2(p0.x, p1.y) : new THREE.Vector2(p1.x, p0.y);

    const points = [];
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      points.push({
        x: a * p0.x + b * control.x + c * p1.x,
        z: a * p0.y + b * control.y + c * p1.y,
      });
    }
    this.turn = { points, i: 0, newAxis, newDir, newLat };
    this.pending = null;
  }

  advanceTurn(dt) {
    const turn = this.turn;
    let remain = this.speed * dt;
    while (remain > 0 && turn.i < turn.points.length) {
      const target = turn.points[turn.i];
      const d = distance2D(this.x, this.z, target.x, target.z);
      if (d <= remain) {
        this.x = target.x;
        this.z = target.z;
        remain -= d;
        turn.i++;
      } else {
        const k = remain / d;
        const nx = this.x + (target.x - this.x) * k;
        const nz = this.z + (target.z - this.z) * k;
        this.yaw = Math.atan2(-(target.x - this.x), -(target.z - this.z));
        this.x = nx;
        this.z = nz;
        remain = 0;
      }
    }
    if (turn.i >= turn.points.length) {
      this.axis = turn.newAxis;
      this.dir = turn.newDir;
      this.setLat(turn.newLat);
      this.yaw = this.axis === 'z' ? (this.dir > 0 ? 0 : Math.PI) : this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.turn = null;
      this.findNextJunction();
    }
  }

  /** Speed control: slow into junctions, brake for anything close ahead. */
  updateSpeed(dt, playerPos) {
    let target = this.cruise;
    if (this.turn) target = Math.min(target, 8.5);
    else if (this.nextJunction !== null) {
      const d = (this.nextJunction - this.axisPos) * this.dir;
      if (d > 0 && d < 26) target = Math.min(target, 7.5 + d * 0.18);
    }
    if (playerPos) {
      const ahead = this.forwardDistanceTo(playerPos.x, playerPos.z);
      if (ahead > 0 && ahead < 9) target = Math.min(target, Math.max(0, (ahead - 3.2) * 2.2));
    }
    this.speed += clamp(target - this.speed, -14 * dt, 6 * dt);
    this.speed = Math.max(0, this.speed);
  }

  forwardDistanceTo(px, pz) {
    const dx = px - this.x;
    const dz = pz - this.z;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const along = dx * fx + dz * fz;
    const lateral = Math.abs(dx * -fz + dz * fx);
    return lateral < 2.6 ? along : -1;
  }

  update(dt, playerPos) {
    this.updateSpeed(dt, playerPos);
    const along = this.axisPos;
    if (!this.turn) {
      this.setAxisPos(along + this.dir * this.speed * dt);
      if (this.nextJunction !== null) {
        const d = (this.nextJunction - this.axisPos) * this.dir;
        if (d < 30 && this.pending === undefined) this.pending = this.decide();
        if (d <= CITY.halfRoad + 0.4) {
          if (this.pending) this.beginTurn(this.pending);
          else {
            if (d <= 0.5) this.findNextJunction();
          }
        }
        if (d < -2 && this.pending === null) this.findNextJunction();
      }
    } else {
      this.advanceTurn(dt);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    this.wheelSpin -= (this.speed / 0.36) * dt;
    for (const w of this.mesh.userData.wheels) w.tyre.rotation.x = this.wheelSpin;
    if (this.turn) {
      const steer = clamp((this.turn.i - 8) * 0.06, -0.5, 0.5);
      for (const w of this.mesh.userData.frontWheels) w.pivot.rotation.y = steer;
    } else {
      for (const w of this.mesh.userData.frontWheels) w.pivot.rotation.y = 0;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.dead = true;
  }
}

/** Populates the boulevards with civilian cars. */
export function createTraffic(scene, layout, count = 26) {
  const rng = new Rng(0x7170a1);
  scene.userData.roads = layout.roads;
  const roads = layout.roads;
  const cars = [];

  for (let i = 0; i < count; i++) {
    const axis = rng.chance(0.55) ? 'z' : 'x';
    const dir = rng.chance(0.5) ? 1 : -1;
    const road = rng.pick(roads);
    const along = rng.float(-CITY.pitch * 1.9, CITY.pitch * 1.9);
    const lat = road + laneOffset(axis, dir);
    const kind = rng.pick(KINDS);
    const colour = rng.pick(CAR_PAINT);
    const x = axis === 'z' ? lat : along;
    const z = axis === 'z' ? along : lat;
    const car = new TrafficCar(scene, x, z, axis, dir, kind, colour, rng);
    car.cruise = rng.float(9.5, 14);
    car.speed = car.cruise;
    cars.push(car);
  }
  // Two cars parked at the hero kerb so the cover frame has life at both edges.
  return cars;
}

/** Soft separation so traffic does not drive through the player or each other. */
export function resolveTrafficContact(cars, player) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.0 && d > 0.01) {
        const push = ((4.0 - d) / d) * 0.5;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
    if (player && !player.inCar) {
      const d = distance2D(a.x, a.z, player.x, player.z);
      if (d < 1.4 && d > 0.01) {
        a.speed *= 0.5;
      }
    }
  }
}
