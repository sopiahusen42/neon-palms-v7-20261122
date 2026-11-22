// Boot, the fixed-step loop, mode switching and the deterministic screenshot
// stages. The world is assembled once from a fixed seed; from then on every
// frame is a pure function of the seeded state and the input script, which is
// what makes the shot URLs reproducible pixel for pixel.

import * as THREE from '../../vendor/three.module.min.js';
import { CITY, PLAYER, SUN, CAMERA } from './config.js';
import { generateCity, DISTRICTS, RADIO_STATIONS } from './citygen.js';
import { buildRoads, groundHeightAt } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildPalms, buildLamps, buildStreetFurniture } from './palms.js';
import { createTraffic } from './traffic.js';
import { createPedestrians, panicNearby } from './pedestrians.js';
import { createPlayerCar, OnFootPlayer, DrivableCar } from './player.js';
import { ChaseCamera } from './camera.js';
import { PoliceDirector } from './police.js';
import { Weapon, ImpactSparks } from './combat.js';
import { Hud } from './hud.js';
import { Missions } from './missions.js';
import { AudioEngine } from './audio.js';
import { SaveSystem } from './save.js';
import { createSky, createLights, followShadow } from './sky.js';
import { clamp, distance2D, damp, wrapAngle } from './util.js';
import { runShot, isShotMode } from './shots.js';

const SPAWN = { x: 2.2, z: -2, yaw: 0 };

class World {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.hudCanvas = document.getElementById('hud');

    // Renderer: antialiased, ACES tone mapped, sRGB output.
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.34;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.chaseFov, window.innerWidth / window.innerHeight, 0.3, 3000);

    this.layout = generateCity();
    this.scene.userData.layout = this.layout;

    this.sky = createSky(this.scene);
    this.lights = createLights(this.scene);

    this.roads = buildRoads(this.scene, this.layout);
    buildBuildings(this.scene, this.layout);
    buildPalms(this.scene, this.layout);
    buildLamps(this.scene, this.layout);
    buildStreetFurniture(this.scene, this.layout);

    // Player: on foot or in the coupe.
    this.footPlayer = new OnFootPlayer(this.scene);
    this.playerCar = createPlayerCar(this.scene, SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.player = { inCar: true, car: this.playerCar, foot: this.footPlayer };

    this.trafficCarsArr = createTraffic(this.scene, this.layout, 28);
    this.pedArr = createPedestrians(this.scene, this.layout, 74);

    this.weapon = new Weapon(this.scene);
    this.sparks = new ImpactSparks(this.scene);
    this.hud = new Hud(this.hudCanvas);
    this.audio = new AudioEngine();
    this.cameraRig = new ChaseCamera(this.camera);

    this.economy = {
      cash: PLAYER.cash,
      wanted: 0,
      onCrime: () => {},
      addCash(n) {
        this.cash += n;
      },
      recordStart: () => {},
    };
    this.police = new PoliceDirector(this.scene, this);
    this.missions = new Missions(this.scene, this);

    this.radio = { station: RADIO_STATIONS[0], index: 0 };
    this.save = SaveSystem;
    this.state = 'title';
    this.titleClock = 0;
    this.worldTime = 9 * 60 + 40; // 09:40, morning sun
    this.clockAccum = 0;
    this.lastCrashAudio = 0;
    this.pursuitSirenOn = false;
    this.stats = { shots: 0, hits: 0 };
    this.shotMode = null;
  }

  // ---------------------------------------------------------- world queries

  trafficCars() {
    return this.trafficCarsArr;
  }
  policeCars() {
    return this.police.policeCars();
  }
  pedestrians() {
    return this.pedArr;
  }
  playerPosition() {
    return this.player.inCar ? { x: this.player.car.x, z: this.player.car.z } : { x: this.footPlayer.x, z: this.footPlayer.z };
  }
  playerHeading() {
    return this.player.inCar ? this.player.car.yaw : this.footPlayer.yaw;
  }
  playerHealth() {
    return this.player.inCar ? this.player.car.health : this.footPlayer.health;
  }
  districtName() {
    const p = this.playerPosition();
    let best = DISTRICTS[0];
    let bestD = Infinity;
    for (const b of this.layout.blocks) {
      const d = distance2D(p.x, p.z, b.cx, b.cz);
      if (d < bestD) {
        bestD = d;
        best = b.district;
      }
    }
    return best.name;
  }
  worldClock() {
    const h = Math.floor(this.worldTime / 60) % 24;
    const m = Math.floor(this.worldTime % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  minimapFocus() {
    return this.playerPosition();
  }
  minimapHeading() {
    // Rotate the map so the player's heading is up.
    return this.playerHeading() + Math.PI;
  }
  minimapTraffic() {
    return this.trafficCarsArr.filter((c) => !c.dead);
  }
  minimapPolice() {
    return this.policeCars();
  }
  policePulse() {
    return Math.sin(this.lights.lampPhase ?? 0) > 0;
  }
  contextPrompt() {
    if (this.state !== 'playing') return null;
    if (this.player.inCar) {
      return { key: 'F', label: 'Exit vehicle' };
    }
    const car = this.nearestStealable();
    if (car) return { key: 'E', label: `Steal the ${car.label}` };
    const next = this.missions.nextAvailable();
    if (next) {
      const p = this.playerPosition();
      const marker = this.missions.marker.group.position;
      if (distance2D(p.x, p.z, marker.x, marker.z) < 40) return { key: 'T', label: `Start: ${next.title}` };
    }
    return null;
  }
  nearestStealable() {
    const p = this.playerPosition();
    let best = null;
    let bestD = 4.2;
    for (const car of this.trafficCarsArr) {
      if (car.dead) continue;
      const d = distance2D(p.x, p.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    for (const car of this.policeCars()) {
      const d = distance2D(p.x, p.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (best) {
      best.label = best.isPolice ? 'police cruiser' : 'car';
      return best;
    }
    return null;
  }
}

class Game {
  constructor() {
    this.world = new World();
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, down: false };
    this.stealTarget = null;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, fire: false, forward: 0, right: 0, run: false };
    this.accum = 0;
    this.lastTime = 0;
    this.fixedDt = 1 / 60;
    this.frame = 0;
    this.shotSettled = false;
    this.bindEvents();
    this.resize();
    this.world.cameraRig.jumpTo(this.world.playerCar);
    this.world.hud.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
    document.getElementById('boot').classList.add('gone');
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.keys.clear());
    const gl = this.world.canvas;
    gl.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.dx += e.movementX ?? 0;
      this.mouse.dy += e.movementY ?? 0;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.world.renderer.setSize(w, h, false);
    this.world.camera.aspect = w / h;
    this.world.camera.updateProjectionMatrix();
    this.world.hud.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  }

  onKeyDown(e) {
    const k = e.key.toLowerCase();
    this.world.audio.ensure();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);

    if (this.world.state === 'title') {
      if (k === 'enter') {
        this.startGame(e.shiftKey ? false : this.world.save.hasSave());
      }
      if (k === 'n') this.startGame(false);
      return;
    }

    if (k === 'escape') {
      this.world.state = this.world.state === 'paused' ? 'playing' : 'paused';
      return;
    }
    if (this.world.state === 'paused') {
      if (k === 'p') this.doSave();
      if (k === 'l') this.doLoad();
      return;
    }
    if (k === 'f') this.toggleVehicle();
    if (k === 'e') this.trySteal();
    if (k === 't') this.world.missions.tryStartNear();
    if (k === 'r') {
      if (this.world.weapon.startReload()) this.world.audio.blip(520, 0.06, 0.1);
    }
    if (k === 'p') this.doSave();
    if (k === 'l') this.doLoad();
    if (k === 'm') {
      this.world.audio.muted = !this.world.audio.muted;
      this.world.hud.showToast(this.world.audio.muted ? 'Audio muted' : 'Audio on');
    }
    if (k >= '1' && k <= '5') {
      const i = Number(k) - 1;
      if (RADIO_STATIONS[i]) {
        this.world.radio.index = i;
        this.world.radio.station = RADIO_STATIONS[i];
        this.world.hud.showToast(`Radio: ${RADIO_STATIONS[i].name}`);
        this.world.audio.blip(760, 0.05, 0.1);
      }
    }
  }

  onKeyUp(e) {
    this.keys.delete(e.key.toLowerCase());
  }

  startGame(loadSave) {
    const w = this.world;
    if (loadSave) this.doLoad(true);
    w.state = 'playing';
    w.hud.showBanner('NEON PALMS', 'Coral Row  ·  Saturday, 09:40', 4.5);
    w.hud.showToast('Press F to get out  ·  T starts the nearby job', 5);
    w.audio.ensure();
    w.audio.blip(660, 0.08, 0.12);
    if (!loadSave) {
      w.missions.restore([]);
      w.economy.cash = PLAYER.cash;
    }
  }

  doSave() {
    const w = this.world;
    const p = w.playerPosition();
    const ok = w.save.write({
      cash: w.economy.cash,
      wanted: w.police.stars,
      health: w.playerHealth(),
      ammo: w.weapon.ammo + w.weapon.mag,
      missions: w.missions.completedList(),
      radio: w.radio.index,
      x: p.x,
      z: p.z,
      inCar: w.player.inCar,
    });
    w.hud.showToast(ok ? 'Progress saved' : 'Save unavailable');
  }

  doLoad(silent = false) {
    const w = this.world;
    const data = w.save.read();
    if (!data) {
      if (!silent) w.hud.showToast('No save found');
      return false;
    }
    w.economy.cash = data.cash ?? PLAYER.cash;
    w.police.wanted.stars = clamp(data.wanted ?? 0, 0, 5);
    w.police.wanted.heat = 0;
    w.weapon.ammo = Math.max(0, (data.ammo ?? 84) - w.weapon.magSize);
    w.weapon.mag = Math.min(w.weapon.magSize, data.ammo ?? 84);
    w.missions.restore(data.missions ?? []);
    if (RADIO_STATIONS[data.radio ?? 0]) {
      w.radio.index = data.radio;
      w.radio.station = RADIO_STATIONS[data.radio];
    }
    w.player.car.x = data.x ?? SPAWN.x;
    w.player.car.z = data.z ?? SPAWN.z;
    w.player.car.vx = 0;
    w.player.car.vz = 0;
    w.player.car.health = Math.max(20, data.health ?? 100);
    if (!silent) w.hud.showToast('Progress loaded');
    return true;
  }

  toggleVehicle() {
    const w = this.world;
    if (w.player.inCar) {
      const car = w.player.car;
      const side = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
      w.footPlayer.spawn(car.x + side.x * 1.9, car.z + side.z * 1.9, car.yaw);
      w.footPlayer.health = Math.max(18, w.footPlayer.health);
      w.player.inCar = false;
      car.vx = 0;
      car.vz = 0;
      car.speed = 0;
      w.cameraRig.mode = 'foot';
      w.cameraRig.footYaw = car.yaw;
      w.hud.showToast('On foot', 1.6);
    } else {
      const car = w.player.car;
      if (distance2D(w.footPlayer.x, w.footPlayer.z, car.x, car.z) > 4.5) {
        w.hud.showToast('Too far from your car', 1.8);
        return;
      }
      this.enterCar(car);
    }
  }

  enterCar(car) {
    const w = this.world;
    w.player.inCar = true;
    w.footPlayer.group.visible = false;
    w.cameraRig.mode = 'chase';
    w.cameraRig.jumpTo(car);
    w.hud.showToast('Vehicle stolen', 1.6);
  }

  trySteal() {
    const w = this.world;
    if (w.player.inCar) return;
    const target = w.nearestStealable();
    if (!target) return;
    const wasPolice = !!target.isPolice;
    const kind = wasPolice ? 'cruiser' : target.kind ?? 'coupe';
    const colour = wasPolice ? 0xf4f2e8 : target.mesh.userData.paint.color.getHex();
    const stolen = new DrivableCar(w.scene, { kind, colour, x: target.x, z: target.z, yaw: target.yaw });
    stolen.kind = kind;
    stolen.isPolice = wasPolice;
    stolen.scene = w.scene;

    // Retire the AI car and drop it from whichever list owns it.
    target.remove();
    const ti = w.trafficCarsArr.indexOf(target);
    if (ti >= 0) w.trafficCarsArr.splice(ti, 1);
    const pi = w.police.cruisers.indexOf(target);
    if (pi >= 0) w.police.cruisers.splice(pi, 1);

    w.player.car = stolen;
    this.enterCar(stolen);
    if (wasPolice) {
      w.hud.showToast('Police cruiser stolen — they saw you', 2.4);
      w.police.reportCrime(2);
    } else {
      w.hud.showToast('Car stolen', 1.6);
      w.police.reportCrime(1);
    }
  }

  /** Turn keys and mouse into this step's intent. */
  readInput() {
    const k = this.keys;
    const w = this.world;
    const up = k.has('w') || k.has('arrowup');
    const down = k.has('s') || k.has('arrowdown');
    const left = k.has('a') || k.has('arrowleft');
    const right = k.has('d') || k.has('arrowright');
    const input = this.input;
    input.throttle = up ? 1 : down ? -1 : 0;
    input.brake = k.has(' ') ? 1 : 0;
    input.handbrake = k.has(' ');
    input.steer = (left ? 1 : 0) - (right ? 1 : 0);
    input.fire = this.mouse.down;
    input.forward = (up ? 1 : 0) - (down ? 1 : 0);
    input.right = (right ? 1 : 0) - (left ? 1 : 0);
    input.run = k.has('shift');
    w.cameraRig.lookDelta(this.mouse.dx, this.mouse.dy);
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  step(dt) {
    const w = this.world;
    const input = this.input;

    if (w.state === 'title') {
      w.titleClock += dt;
      // A slow orbit over the boulevard for the title backdrop.
      const t = w.titleClock * 0.09;
      const r = 46;
      w.camera.position.set(Math.sin(t) * r, 17 + Math.sin(t * 0.7) * 3, 24 + Math.cos(t) * r * 0.6);
      w.camera.lookAt(0, 2, -40);
      w.camera.fov = 58;
      w.camera.updateProjectionMatrix();
      w.cameraRig.footYaw = 0;
      w.sky.sky.position.copy(w.camera.position);
      followShadow(w.lights.sun, { x: 0, z: -30 }, null);
      w.clockAccum += dt;
      if (w.clockAccum > 0.05) {
        w.clockAccum = 0;
        w.weapon.update(dt);
        w.sparks.update(dt);
        for (const car of w.trafficCarsArr) car.update(0.05, null);
        for (const ped of w.pedArr) ped.update(0.05, null, false);
        w.worldTime += 0.05 * 0.5;
      }
      return;
    }

    if (w.state === 'paused') return;

    // ---- driving / walking
    if (w.player.inCar) {
      const car = w.player.car;
      car.drive(dt, input.throttle, input.brake, input.steer, input.handbrake);
      const hit = car.collide(w.layout);
      if (hit && Math.abs(car.speed) > 6) {
        w.cameraRig.addShake(Math.min(0.9, Math.abs(car.speed) * 0.04));
        if (w.clockAccum > 0.35) {
          w.audio.crash(Math.abs(car.speed) / 20);
          w.clockAccum = 0;
        }
        // Hitting anything is a crime in this city.
        if (Math.abs(car.speed) > 12) w.police.reportCrime(1);
      }
      // Plough into traffic and pedestrians.
      for (const other of w.trafficCarsArr) {
        const d = distance2D(car.x, car.z, other.x, other.z);
        if (d < (car.width + other.mesh.userData.spec.width) * 0.48) {
          const dx = other.x - car.x;
          const dz = other.z - car.z;
          const n = Math.hypot(dx, dz) || 1;
          other.x += (dx / n) * 0.6;
          other.z += (dz / n) * 0.6;
          other.speed *= 0.4;
          car.vx *= 0.86;
          car.vz *= 0.86;
          w.cameraRig.addShake(0.16);
        }
      }
      for (const ped of w.pedArr) {
        if (!ped.alive) continue;
        if (distance2D(car.x, car.z, ped.x, ped.z) < 1.5 && Math.abs(car.speed) > 7) {
          ped.kill();
          w.police.reportCrime(2);
          w.cameraRig.addShake(0.22);
          panicNearby(w.pedArr, ped.x, ped.z, 22, 1.1);
        } else if (distance2D(car.x, car.z, ped.x, ped.z) < 9) {
          ped.startle(0.25);
        }
      }
      w.weapon.update(dt);
      if (input.fire && w.weapon.canFire()) this.fireWeapon();
    } else {
      // On foot: camera-relative movement.
      const foot = w.footPlayer;
      const camYaw = w.cameraRig.footYaw;
      const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
      const move = new THREE.Vector3()
        .addScaledVector(fwd, input.forward)
        .addScaledVector(right, input.right);
      foot.update(dt, move, input.run, camYaw, w.cameraRig.footPitch);
      // Keep the walker out of buildings.
      for (const b of w.layout.buildings) {
        const hw = b.w / 2 + 0.4;
        const hd = b.d / 2 + 0.4;
        if (foot.x > b.x - hw && foot.x < b.x + hw && foot.z > b.z - hd && foot.z < b.z + hd) {
          const dx = Math.min(foot.x - (b.x - hw), b.x + hw - foot.x);
          const dz = Math.min(foot.z - (b.z - hd), b.z + hd - foot.z);
          if (dx < dz) foot.x += foot.x < b.x ? -dx : dx;
          else foot.z += foot.z < b.z ? -dz : dz;
        }
      }
      w.weapon.update(dt);
      if (input.fire && w.weapon.canFire()) this.fireWeapon();
    }

    // ---- police
    const shots = w.police.update(dt, w.player, w.player.inCar);
    for (const shot of shots) this.resolvePoliceShot(shot);
    w.pursuitSirenOn = w.police.stars > 0;
    w.audio.siren(w.pursuitSirenOn ? 1 : 0);

    // ---- traffic and pedestrians
    for (const car of w.trafficCarsArr) {
      const p = w.playerPosition();
      car.update(dt, p);
    }
    for (const ped of w.pedArr) ped.update(dt, w.playerPosition(), w.player.inCar);

    w.sparks.update(dt);
    w.missions.update(dt);
    w.missions.chatter(dt);
    w.worldTime += dt * 0.5;
    w.lights.lampPhase = (w.lights.lampPhase ?? 0) + dt * 7.5;

    // ---- camera and engine note
    const speed = w.player.inCar ? w.player.car.speed : 0;
    const focus = w.player.inCar ? w.player.car : { x: w.footPlayer.x, z: w.footPlayer.z, yaw: w.footPlayer.yaw, steer: 0 };
    w.cameraRig.update(dt, focus, speed);
    w.audio.engine(speed, w.player.inCar ? input.throttle : 0, w.player.inCar);
    const fwdDir = new THREE.Vector3(-Math.sin(w.playerHeading()), 0, -Math.cos(w.playerHeading()));
    followShadow(w.lights.sun, w.playerPosition(), fwdDir);
    w.sky.sky.position.copy(w.camera.position);
    w.sky.glow.position.copy(w.camera.position).addScaledVector(w.sky.sunDir, 1600);

    if (w.player.inCar && w.player.car.health <= 0) {
      w.player.car.health = 12;
      w.hud.flashHurt();
      w.hud.showToast('The car is wrecked', 2.2);
    }
    if (!w.player.inCar && w.footPlayer.health <= 0) {
      this.respawn();
    }
  }

  resolvePoliceShot(shot) {
    const w = this.world;
    // Police shoot with their own ray, not the weapon's, so ammo is untouched.
    const dir = shot.dir;
    const origin = shot.origin;
    let blocked = false;
    for (const b of w.layout.buildings) {
      if (rayHitsBox(origin, dir, b)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      const foot = w.footPlayer;
      const t = (foot.x - origin.x) * dir.x + (foot.z - origin.z) * dir.z;
      const px = origin.x + dir.x * t;
      const pz = origin.z + dir.z * t;
      const d = Math.hypot(px - foot.x, pz - foot.z);
      if (d < 0.9 && t > 0 && t < 90) {
        const dead = foot.damage(11);
        w.hud.flashHurt();
        w.cameraRig.addShake(0.3);
        w.audio.shot();
        if (dead) this.respawn();
        return;
      }
    }
    // Tracer for the miss.
    w.weapon.spawnTracer(origin, origin.clone().addScaledVector(dir, 60));
    w.weapon.showFlash(origin);
    w.audio.shot();
    w.cameraRig.addShake(0.08);
  }

  fireWeapon() {
    const w = this.world;
    const foot = w.footPlayer;
    const yaw = w.player.inCar ? w.player.car.yaw : w.cameraRig.footYaw;
    const pitch = w.player.inCar ? 0 : w.cameraRig.footPitch;
    const origin = new THREE.Vector3(
      (w.player.inCar ? w.player.car.x : foot.x) - Math.sin(yaw) * 0.7,
      (w.player.inCar ? 1.2 : 1.4) + Math.sin(pitch) * 0.2,
      (w.player.inCar ? w.player.car.z : foot.z) - Math.cos(yaw) * 0.7,
    );
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const hits = w.weapon.fire(origin, dir, w);
    w.weapon.showFlash(origin);
    w.audio.shot();
    w.cameraRig.addShake(0.12);
    w.stats.shots++;

    for (const hit of hits) {
      if (hit.kind === 'ped' && hit.target) {
        hit.target.kill();
        w.sparks.burst(hit.point, 0xffc0a0);
        panicNearby(w.pedArr, hit.point.x, hit.point.z, 30, 1.2);
        w.police.reportCrime(2);
        w.stats.hits++;
      } else if (hit.kind === 'car' && hit.target) {
        hit.target.health = (hit.target.health ?? 100) - hit.damage;
        w.sparks.burst(hit.point, 0xfff0c0);
        w.police.reportCrime(1);
        if (hit.target.isPolice) w.police.reportCrime(1);
        if (hit.target.health <= 0 && hit.target.remove) hit.target.remove();
      } else if (hit.kind === 'building') {
        w.sparks.burst(hit.point, 0xfff4d0);
        w.police.reportCrime(1);
      }
      // Peds nearby hear it whatever happens.
      panicNearby(w.pedArr, origin.x, origin.z, 34, 0.8);
    }
    // Firing in public is always a crime.
    if (hits.length === 0) w.police.reportCrime(1);
  }

  respawn() {
    const w = this.world;
    const fee = Math.min(500, Math.round(w.economy.cash * 0.1));
    w.economy.cash = Math.max(0, w.economy.cash - fee);
    w.police.wanted.stars = Math.max(0, w.police.wanted.stars - 2);
    w.footPlayer.health = PLAYER.health;
    w.player.car.health = 100;
    w.player.car.x = SPAWN.x;
    w.player.car.z = SPAWN.z;
    w.player.car.yaw = SPAWN.yaw;
    w.player.car.vx = 0;
    w.player.car.vz = 0;
    w.player.inCar = true;
    w.footPlayer.group.visible = false;
    w.cameraRig.mode = 'chase';
    w.cameraRig.jumpTo(w.player.car);
    for (const c of w.police.cruisers) c.remove();
    w.police.cruisers = [];
    w.hud.showBanner('HOSPITAL', `Patched up at Coral Row  ·  $${fee}`, 4);
    w.hud.showToast('Wanted level reduced', 3);
  }

  render() {
    const w = this.world;
    // HUD first so the WebGL frame is the last thing queued this tick.
    w.renderer.render(w.scene, w.camera);
    w.hud.draw(w, w.lastDt ?? this.fixedDt);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
    this.lastTime = now;
    this.world.lastDt = dt;
    this.accum += dt;
    let steps = 0;
    this.readInput();
    while (this.accum >= this.fixedDt && steps < 5) {
      this.step(this.fixedDt);
      this.accum -= this.fixedDt;
      steps++;
      this.frame++;
    }
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}

function rayHitsBox(origin, dir, b) {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2;
  const z1 = b.z + b.d / 2;
  const y1 = b.floors * b.storey;
  let tmin = 0;
  let tmax = 200;
  for (const [oc, dc, lo, hi] of [
    [origin.x, dir.x, x0, x1],
    [origin.y, dir.y, 0, y1],
    [origin.z, dir.z, z0, z1],
  ]) {
    if (Math.abs(dc) < 1e-6) {
      if (oc < lo || oc > hi) return false;
      continue;
    }
    let t1 = (lo - oc) / dc;
    let t2 = (hi - oc) / dc;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return tmin > 0.1 && tmin < 200;
}

// ------------------------------------------------------------------ boot

const game = new Game();
window.__neonPalms = game;

const shotName = new URLSearchParams(window.location.search).get('shot');
if (shotName) {
  game.world.shotMode = shotName;
  runShot(game, shotName);
} else {
  game.lastTime = performance.now();
  requestAnimationFrame((t) => game.loop(t));
}
