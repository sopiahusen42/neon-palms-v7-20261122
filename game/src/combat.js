// Combat: the player's pistol, its magazine, tracers, muzzle flash, impact
// sparks, hit reactions and health. Bullets are hitscan rays checked against
// car and pedestrian capsules plus building boxes; nothing is simulated as a
// projectile, but each shot leaves a visible tracer for a few frames.

import * as THREE from '../vendor/three.module.min.js';
import { PLAYER } from './config.js';
import { Rng } from './rng.js';
import { clamp } from './util.js';

export class Weapon {
  constructor(scene) {
    this.scene = scene;
    this.name = 'Vega .45';
    this.magSize = PLAYER.magSize;
    this.ammo = PLAYER.ammo;
    this.mag = this.magSize;
    this.cooldown = 0;
    this.reloading = 0;
    this.spread = 0.012;
    this.damage = 26;
    this.tracers = [];
    this.flashes = [];
    this.rng = new Rng(0x51a7);

    // Tracer pool: thin additive quads re-used round-robin.
    this.tracerPool = [];
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xfff0b0,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracerPool.push({ mesh: m, life: 0 });
    }

    // Muzzle flash: two crossed additive quads at the barrel.
    this.flash = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd98a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.flashMat = flashMat;
    for (let i = 0; i < 2; i++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat);
      q.rotation.z = (i * Math.PI) / 2;
      this.flash.add(q);
    }
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.flash.add(glow);
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashLife = 0;
  }

  canFire() {
    return this.cooldown <= 0 && this.reloading <= 0 && this.mag > 0;
  }

  startReload() {
    if (this.reloading > 0 || this.mag === this.magSize || this.ammo <= 0) return false;
    this.reloading = 1.55;
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = this.magSize - this.mag;
        const take = Math.min(need, this.ammo);
        this.mag += take;
        this.ammo -= take;
        this.reloading = 0;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.visible = false;
    }
    for (const t of this.tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = clamp(t.life / 0.075, 0, 1) * 0.85;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
  }

  /**
   * Fires one round from `origin` toward `dir` (normalised). Returns the list of
   * hits: { kind:'car'|'ped'|'building'|'miss', point, target, damage }.
   */
  fire(origin, dir, world) {
    if (!this.canFire()) return [];
    this.cooldown = 0.13;
    this.mag--;
    const spread = this.rng.float(-this.spread, this.spread);
    const d = dir.clone().normalize();
    d.x += spread;
    d.y += spread * 0.4;
    d.z += spread;
    d.normalize();

    const hits = [];
    const maxDist = 120;
    let nearest = maxDist;
    let hitPoint = origin.clone().addScaledVector(d, maxDist);
    let hitKind = 'miss';
    let hitTarget = null;

    const rayCar = (car) => {
      // Cheap capsule test: closest approach to the car's centre line.
      const cx = car.x;
      const cz = car.z;
      const t = clamp((cx - origin.x) * d.x + (cz - origin.z) * d.z, 0, maxDist);
      const px = origin.x + d.x * t;
      const pz = origin.z + d.z * t;
      const dx = px - cx;
      const dz = pz - cz;
      const radius = (car.width ?? 1.9) * 0.62;
      if (dx * dx + dz * dz < radius * radius && t < nearest) {
        const y = origin.y + d.y * t;
        if (y > 0 && y < 1.9) {
          nearest = t;
          hitPoint = new THREE.Vector3(origin.x + d.x * t, y, origin.z + d.z * t);
          hitKind = 'car';
          hitTarget = car;
        }
      }
    };

    for (const car of world.trafficCars()) rayCar(car);
    for (const car of world.policeCars()) rayCar(car);
    if (world.playerCar) rayCar(world.playerCar);

    for (const ped of world.pedestrians()) {
      if (!ped.alive) continue;
      const t = clamp((ped.x - origin.x) * d.x + (ped.z - origin.z) * d.z, 0, maxDist);
      const px = origin.x + d.x * t;
      const pz = origin.z + d.z * t;
      const dx = px - ped.x;
      const dz = pz - ped.z;
      const r = 0.42;
      if (dx * dx + dz * dz < r * r && t < nearest) {
        const y = origin.y + d.y * t;
        if (y > 0.2 && y < 1.9) {
          nearest = t;
          hitPoint = new THREE.Vector3(origin.x + d.x * t, y, origin.z + d.z * t);
          hitKind = 'ped';
          hitTarget = ped;
        }
      }
    }

    // Building boxes, as an axis-aligned ray slab test.
    for (const b of world.layout.buildings) {
      const minY = 0;
      const maxY = b.floors * b.storey;
      const t = rayBox(origin, d, b.x - b.w / 2, minY, b.z - b.d / 2, b.x + b.w / 2, maxY, b.z + b.d / 2);
      if (t !== null && t < nearest) {
        nearest = t;
        hitPoint = new THREE.Vector3(origin.x + d.x * t, origin.y + d.y * t, origin.z + d.z * t);
        hitKind = 'building';
        hitTarget = null;
      }
    }

    // Ground plane.
    if (d.y < -0.001) {
      const t = -origin.y / d.y;
      if (t > 0 && t < nearest) {
        nearest = t;
        hitPoint = new THREE.Vector3(origin.x + d.x * t, 0.02, origin.z + d.z * t);
        hitKind = 'building';
        hitTarget = null;
      }
    }

    hits.push({ kind: hitKind, point: hitPoint, target: hitTarget, damage: this.damage });
    this.spawnTracer(origin, hitPoint);
    return hits;
  }

  spawnTracer(from, to) {
    const t = this.tracerPool.find((p) => p.life <= 0) ?? this.tracerPool[0];
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    t.mesh.position.copy(mid);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.material.opacity = 0.85;
    t.mesh.visible = true;
    t.life = 0.075;
  }

  showFlash(position) {
    this.flash.position.copy(position);
    this.flash.rotation.z = this.rng.float(0, Math.PI);
    this.flash.scale.setScalar(this.rng.float(0.85, 1.25));
    this.flash.visible = true;
    this.flashLife = 0.055;
  }
}

/** Slab test against an AABB; the entry distance or null. */
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = 1e9;
  for (const [oc, dc, lo, hi] of [
    [o.x, d.x, x0, x1],
    [o.y, d.y, y0, y1],
    [o.z, d.z, z0, z1],
  ]) {
    if (Math.abs(dc) < 1e-6) {
      if (oc < lo || oc > hi) return null;
      continue;
    }
    let t1 = (lo - oc) / dc;
    let t2 = (hi - oc) / dc;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0.1 ? tmin : null;
}

/** Small impact spark burst, pooled. */
export class ImpactSparks {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.06, 5, 4);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.cursor = 0;
    this.rng = new Rng(0x5a4b);
  }
  burst(point, colour = 0xffe0a0) {
    for (let i = 0; i < 5; i++) {
      const p = this.pool[this.cursor++ % this.pool.length];
      p.mesh.position.copy(point);
      p.mesh.material.color.setHex(colour);
      p.mesh.visible = true;
      p.life = 0.28;
      p.vx = this.rng.float(-2.4, 2.4);
      p.vy = this.rng.float(0.6, 3.2);
      p.vz = this.rng.float(-2.4, 2.4);
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 9 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = clamp(p.life * 3.6, 0, 1);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }
}
