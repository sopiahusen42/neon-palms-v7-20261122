// Wanted level and the police response. Crimes raise the star count; the meter
// cools when the player hides out of sight of any cruiser. Cruisers spawn off
// the edges of the view and join the pursuit: they follow the player's lane,
// ram, and, when the player is on foot, pull up and fire from behind cover.

import * as THREE from '../../vendor/three.module.min.js';
import { CITY } from './config.js';
import { createCarMesh, createLightBar } from './vehicles.js';
import { Rng } from './rng.js';
import { clamp, distance2D, damp } from './util.js';

const CRUISER_PAINT = [0xf4f2e8, 0x1f3c66, 0xe8e6dc];

export class WantedSystem {
  constructor(economy) {
    this.economy = economy;
    this.stars = 0;
    this.heat = 0; // 0..1 within the current star
    this.sinceCrime = 0;
    this.hidden = 0;
    this.cruisers = [];
    this.rng = new Rng(0xba11);
    this.spawnTimer = 0;
    this.bustPrompt = 0;
  }

  addStars(n) {
    this.stars = clamp(this.stars + n, 0, 5);
    this.sinceCrime = 0;
    this.heat = 0;
  }

  crime(n = 1) {
    this.addStars(n);
    this.economy.onCrime?.();
  }

  /** Lower the meter while the player is unseen. */
  cool(dt, visible) {
    if (this.stars === 0) return;
    if (visible) {
      this.hidden = 0;
      this.sinceCrime = 0;
    } else {
      this.hidden += dt;
      if (this.hidden > 5) {
        this.heat += dt * 0.11;
        if (this.heat >= 1) {
          this.heat = 0;
          this.stars = Math.max(0, this.stars - 1);
        }
      }
    }
  }

  count() {
    return this.cruisers.filter((c) => !c.dead).length;
  }
}

/** One police cruiser: a wide saloon with a light bar, pursuit AI and a crew. */
export class Cruiser {
  constructor(scene, x, z, yaw, rng) {
    this.scene = scene;
    this.rng = rng;
    this.mesh = createCarMesh('cruiser', CRUISER_PAINT[0]);
    // Dark doors and a livery stripe.
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1f3c66, roughness: 0.4, metalness: 0.25 });
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 3.2), stripeMat);
      stripe.position.set(s * 1.0, 0.96, 0.1);
      this.mesh.add(stripe);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 1.5), stripeMat);
    door.position.set(0, 0.9, 2.0);
    this.mesh.add(door);

    this.bar = createLightBar();
    this.mesh.add(this.bar);

    // A cast light per lamp so the bar actually spills coloured light onto the
    // roof, bonnet and road: a painted emissive slab with no spill reads as a
    // decal rather than a flasher.
    this.redLight = new THREE.PointLight(0xff2a10, 0, 18, 2);
    this.redLight.position.set(-0.52, 1.95, 0.1);
    this.blueLight = new THREE.PointLight(0x1a5cff, 0, 18, 2);
    this.blueLight.position.set(0.52, 1.95, 0.1);
    this.bar.add(this.redLight, this.blueLight);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.isPolice = true;
    this.health = 100;
    this.occupied = true;
    this.dead = false;
    this.lightPhase = rng ? rng.float(0, Math.PI * 2) : 0;
    this.state = 'pursue'; // pursue | stop | shoot
    this.fireTimer = 1.4;
    this.crewAlive = true;
    this.crewYaw = 0;
    this.sirenTimer = 0;
    this.spec = this.mesh.userData.spec;
    this.width = this.spec.width;
    this.length = this.spec.len;
    // A tiny crew silhouette standing at the cruiser when the player is on foot.
    this.crew = buildOfficer();
    this.crew.visible = false;
    this.crew.position.set(x, 0, z);
    scene.add(this.crew);
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Pursue drift-style chase: aim for a point behind the player's car. */
  pursue(dt, target, traffic) {
    const fwd = target.forward ?? new THREE.Vector3(-Math.sin(target.yaw), 0, -Math.cos(target.yaw));
    const chasePoint = new THREE.Vector3(target.x, 0, target.z).addScaledVector(fwd, -6);
    const dx = chasePoint.x - this.x;
    const dz = chasePoint.z - this.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    let delta = desiredYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.steer = damp(this.steer, clamp(delta * 1.6, -1, 1), 8, dt);
    const targetSpeed = dist > 14 ? 30 : dist > 8 ? 17 : 9;
    this.speed += clamp(targetSpeed - this.speed, -26 * dt, 16 * dt);
    this.yaw += this.steer * 1.8 * clamp(this.speed / 10, 0, 1) * dt;
    this.vx = -Math.sin(this.yaw) * this.speed;
    this.vz = -Math.cos(this.yaw) * this.speed;
    this.integrate(dt);
    // Ram: a solid shove when the noses touch.
    if (dist < 4.2) {
      const push = (4.2 - dist) * 0.9;
      target.vx += (dx / (dist || 1)) * push * 2.2;
      target.vz += (dz / (dist || 1)) * push * 2.2;
      target.health = Math.max(0, target.health - dt * 9);
      this.speed *= 0.6;
    }
    this.state = 'pursue';
    this.crew.visible = false;
  }

  /** Pull up near a player on foot and shoot from beside the car. */
  engageOnFoot(dt, player, weaponish) {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    let delta = desiredYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    // Drive to within 14 m, then stop and dismount.
    if (dist > 15) {
      this.steer = damp(this.steer, clamp(delta * 1.6, -1, 1), 8, dt);
      this.speed += clamp(24 - this.speed, -26 * dt, 16 * dt);
      this.yaw += this.steer * 1.7 * clamp(this.speed / 10, 0, 1) * dt;
      this.vx = -Math.sin(this.yaw) * this.speed;
      this.vz = -Math.cos(this.yaw) * this.speed;
      this.integrate(dt);
      this.crew.visible = false;
      this.state = 'pursue';
    } else {
      this.speed = damp(this.speed, 0, 6, dt);
      this.vx = damp(this.vx, 0, 6, dt);
      this.vz = damp(this.vz, 0, 6, dt);
      this.integrate(dt);
      this.state = 'shoot';
      // The crew stands on the far side of the car and fires.
      this.crew.visible = true;
      const offYaw = this.yaw;
      this.crew.position.set(
        this.x + Math.cos(offYaw) * 1.9,
        0,
        this.z - Math.sin(offYaw) * 1.9,
      );
      this.crew.rotation.y = Math.atan2(-(player.x - this.crew.position.x), -(player.z - this.crew.position.z));
      this.crewYaw = this.crew.rotation.y;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && dist < 40) {
        this.fireTimer = this.rng.float(0.85, 1.9);
        return this.fireAt(player);
      }
    }
    return null;
  }

  fireAt(player) {
    // Accuracy falls with range; a hit does real damage.
    const origin = new THREE.Vector3(this.crew.position.x, 1.4, this.crew.position.z);
    const target = new THREE.Vector3(player.x, 1.25 + (this.rng.float(-0.1, 0.1)), player.z);
    const dir = target.sub(origin).normalize();
    const spread = 0.045;
    dir.x += this.rng.float(-spread, spread);
    dir.y += this.rng.float(-spread * 0.4, spread * 0.4);
    dir.z += this.rng.float(-spread, spread);
    return { origin, dir: dir.normalize(), from: 'police' };
  }

  integrate(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    this.wheelSpin -= (this.speed / 0.36) * dt;
    for (const w of this.mesh.userData.wheels) w.tyre.rotation.x = this.wheelSpin;
    for (const w of this.mesh.userData.frontWheels) w.pivot.rotation.y = this.steer * 0.45;
  }

  updateLights(dt, t) {
    this.lightPhase += dt * 7.5;
    const pulse = Math.sin(this.lightPhase) * 0.5 + 0.5;
    const red = this.bar.userData.red;
    const blue = this.bar.userData.blue;
    red.emissiveIntensity = 0.85 + pulse * 1.9;
    blue.emissiveIntensity = 0.85 + (1 - pulse) * 1.9;
    // Stay saturated: keep the darkest channel low so ACES cannot wash the hue
    // out to white, which is what made the bars read as unlit grey slabs.
    red.color.setHex(pulse > 0.5 ? 0xe80c02 : 0x940802);
    blue.color.setHex(pulse > 0.5 ? 0x0a44ff : 0x04229c);
    const rh = this.bar.userData.redHalo;
    const bh = this.bar.userData.blueHalo;
    if (rh) rh.material.opacity = 0.32 + pulse * 0.48;
    if (bh) bh.material.opacity = 0.32 + (1 - pulse) * 0.48;
    // Drive the cast lights so the flash lands on the car and the asphalt.
    if (this.redLight) this.redLight.intensity = 3.2 + pulse * 9.5;
    if (this.blueLight) this.blueLight.intensity = 3.2 + (1 - pulse) * 9.5;
  }

  remove() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.crew);
    this.dead = true;
  }
}

function buildOfficer() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x27384f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc28b64, roughness: 0.8 });
  const torso = new THREE.Mesh(
    (() => {
      const geo = new THREE.BoxGeometry(0.46, 0.66, 0.26);
      geo.translate(0, 1.24, 0);
      return geo;
    })(),
    navy,
  );
  torso.castShadow = true;
  const head = new THREE.Mesh((() => { const g2 = new THREE.SphereGeometry(0.13, 10, 8); g2.translate(0, 1.7, 0); return g2; })(), skin);
  head.castShadow = true;
  const cap = new THREE.Mesh((() => { const g2 = new THREE.CylinderGeometry(0.15, 0.15, 0.09, 8); g2.translate(0, 1.83, 0); return g2; })(), navy);
  const legs = new THREE.Mesh((() => { const g2 = new THREE.BoxGeometry(0.34, 0.88, 0.2); g2.translate(0, 0.45, 0); return g2; })(), navy);
  legs.castShadow = true;
  // Arms out, pistol raised.
  const armR = new THREE.Mesh((() => { const g2 = new THREE.BoxGeometry(0.12, 0.12, 0.62); g2.translate(0, 1.3, -0.3); return g2; })(), navy);
  const gun = new THREE.Mesh((() => { const g2 = new THREE.BoxGeometry(0.08, 0.12, 0.3); g2.translate(0, 1.3, -0.72); return g2; })(), new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.4 }));
  g.add(torso, head, cap, legs, armR, gun);
  return g;
}

export class PoliceDirector {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = new WantedSystem(world.economy);
    this.cruisers = [];
    this.rng = new Rng(0xc0f5);
    this.spawnCooldown = 0;
    this.bulletHits = [];
    this.lastCrewFire = 0;
  }

  get stars() {
    return this.wanted.stars;
  }

  reportCrime(n = 1) {
    this.wanted.crime(n);
    this.world.economy.wanted = this.wanted.stars;
  }

  /** Column of the city grid nearest the player, for spawning out of sight. */
  spawnPointNear(px, pz) {
    const roads = this.world.layout.roads;
    const axis = this.rng.chance(0.5) ? 'z' : 'x';
    const road = this.rng.pick(roads);
    const dir = this.rng.chance(0.5) ? 1 : -1;
    const along = dir * (this.world.layout.blockHalf + CITY.pitch * 1.05);
    const far = (axis === 'z' ? pz : px) + along;
    const x = axis === 'z' ? road + dir * 2.4 : far;
    const z = axis === 'z' ? far : road - dir * 2.4;
    return { x, z, yaw: axis === 'z' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }

  update(dt, player, playerInCar) {
    this.wanted.cool(dt, this.playerVisible(player, playerInCar));
    this.world.economy.wanted = this.wanted.stars;

    const targetCount = this.wanted.stars === 0 ? 0 : Math.min(5, 1 + Math.floor(this.wanted.stars * 0.9));
    const alive = this.cruisers.filter((c) => !c.dead);
    this.spawnCooldown -= dt;
    if (alive.length < targetCount && this.spawnCooldown <= 0) {
      this.spawnCooldown = 1.6;
      const sp = this.spawnPointNear(player.x, player.z);
      const c = new Cruiser(this.scene, sp.x, sp.z, sp.yaw, this.rng);
      this.cruisers.push(c);
      this.world.audio?.siren();
    }

    const shots = [];
    for (const c of alive) {
      if (playerInCar) {
        c.pursue(dt, player.car, this.world.traffic);
      } else {
        const shot = c.engageOnFoot(dt, player.foot, this.world);
        if (shot) shots.push(shot);
        // If the player gets in a car, the crew hops back in.
        if (distance2D(c.x, c.z, player.car?.x ?? 1e9, player.car?.z ?? 1e9) < 40) c.crew.visible = c.state === 'shoot';
      }
      c.updateLights(dt);
      // Keep them in the world.
      c.x = clamp(c.x, -CITY.extent - 10, CITY.extent + 10);
      c.z = clamp(c.z, -CITY.extent - 10, CITY.extent + 10);
      if (!playerInCar && c.state === 'shoot') c.crew.visible = true;
      else if (playerInCar) c.crew.visible = false;
    }
    // Cruisers that have been left far behind despawn at low wanted levels.
    if (this.wanted.stars <= 2 && playerInCar) {
      for (const c of alive) {
        if (distance2D(c.x, c.z, player.car.x, player.car.z) > 260) c.remove();
      }
    }
    return shots;
  }

  playerVisible(player, playerInCar) {
    const px = playerInCar ? player.car.x : player.foot.x;
    const pz = playerInCar ? player.car.z : player.foot.z;
    for (const c of this.cruisers) {
      if (c.dead) continue;
      if (distance2D(c.x, c.z, px, pz) < 120) return true;
    }
    return false;
  }

  policeCars() {
    return this.cruisers.filter((c) => !c.dead);
  }
}
