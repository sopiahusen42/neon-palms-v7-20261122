// The deterministic screenshot stages. Each named stage builds a fixed world
// state, advances the simulation by a fixed number of steps at a fixed dt with
// a scripted input, renders once, and only then sets document.title to
// SHOT_READY. There is no wall-clock time and no Math.random anywhere in here,
// so the same URL always produces the same pixels.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, CAMERA } from './config.js';
import { distance2D } from './util.js';
import { Cruiser } from './police.js';
import { createCarMesh } from './vehicles.js';

const STEP = 1 / 60;

function clearPolice(game) {
  for (const c of game.world.police.cruisers) c.remove();
  game.world.police.cruisers = [];
}

/** Place the player's car and settle the chase camera behind it. */
function stageCar(game, { x, z, yaw, speed = 0 }) {
  const w = game.world;
  const car = w.player.car;
  car.x = x;
  car.z = z;
  car.yaw = yaw;
  car.vx = -Math.sin(yaw) * speed;
  car.vz = -Math.cos(yaw) * speed;
  car.speed = speed;
  car.steer = 0;
  car.syncMesh(STEP);
  w.player.inCar = true;
  w.footPlayer.group.visible = false;
  w.cameraRig.mode = 'chase';
  w.cameraRig.yaw = yaw;
  w.cameraRig.jumpTo(car);
}

/** Spawn a cruiser at an exact spot, already in the pursuit state. */
function addCruiser(game, x, z, yaw, speed = 0) {
  const c = new Cruiser(game.world.scene, x, z, yaw, game.world.police.rng);
  c.speed = speed;
  c.vx = -Math.sin(yaw) * speed;
  c.vz = -Math.cos(yaw) * speed;
  c.mesh.position.set(x, 0, z);
  c.mesh.rotation.y = yaw;
  game.world.police.cruisers.push(c);
  return c;
}

/** Deterministic step function: runs the sim without reading the keyboard. */
function simulate(game, steps, input = {}) {
  const g = game;
  for (let i = 0; i < steps; i++) {
    g.input.throttle = input.throttle ?? 0;
    g.input.brake = input.brake ?? 0;
    g.input.steer = input.steer ?? 0;
    g.input.handbrake = false;
    g.input.fire = false;
    g.input.forward = input.forward ?? 0;
    g.input.right = input.right ?? 0;
    g.input.run = false;
    if (input.script) input.script(i, g);
    g.step(STEP);
  }
}

/**
 * cover — the hero frame. Marisol's coupe on the Sunset Verge boulevard, low
 * chase camera, palms throwing long shadows across the road, two cruisers with
 * lit bars closing in, traffic ahead, pedestrians on the kerb, full HUD.
 */
function stageCover(game) {
  const w = game.world;
  const roads = w.layout.roads;
  // The central north-south boulevard.
  const bx = roads[2];
  const yaw = 0; // heading -Z, sun raking from the left
  const carZ = -18;

  w.state = 'playing';
  stageCar(game, { x: bx + 2.4, z: carZ, yaw, speed: 13 });
  w.economy.cash = 1480;
  w.police.wanted.stars = 3;
  w.police.wanted.heat = 0.25;
  w.weapon.mag = 12;
  w.weapon.ammo = 72;

  // Two cruisers inside the frame: one ramming alongside on the left, three
  // quarter, one braking hard ahead on the right. Both bars lit.
  addCruiser(game, bx - 4.3, carZ - 7.5, Math.PI * 0.66, 8);
  addCruiser(game, bx + 6.5, carZ - 17.5, -0.34, 12);

  // Traffic ahead down the boulevard, in both directions.
  const ahead = [
    { x: bx + 6.4, z: carZ - 26, yaw: 0, kind: 'saloon', colour: 0xd9583f },
    { x: bx - 2.4, z: carZ - 52, yaw: Math.PI, kind: 'coupe', colour: 0x2f8f9a },
    { x: bx + 6.4, z: carZ - 74, yaw: 0, kind: 'coupe', colour: 0xe0a63c },
  ];
  for (const spec of ahead) {
    const mesh = createCarMesh(spec.kind, spec.colour);
    mesh.position.set(spec.x, 0, spec.z);
    mesh.rotation.y = spec.yaw;
    w.scene.add(mesh);
    const fake = { kind: spec.kind, mesh, x: spec.x, z: spec.z, yaw: spec.yaw };
    w.scene.userData.coverCars = w.scene.userData.coverCars ?? [];
    w.scene.userData.coverCars.push(mesh);
  }

  // Parked cars at the kerb on both sides.
  const parked = [
    { x: bx - 8.6, z: carZ - 4, yaw: Math.PI, colour: 0xf3f0e6 },
    { x: bx + 8.6, z: carZ - 12, yaw: 0, colour: 0x8c9c6a },
  ];
  for (const spec of parked) {
    const mesh = createCarMesh('saloon', spec.colour);
    mesh.position.set(spec.x, 0, spec.z);
    mesh.rotation.y = spec.yaw;
    w.scene.add(mesh);
    w.scene.userData.coverCars.push(mesh);
  }

  // Herd the pedestrians onto this stretch of kerb, facing the road.
  const walk = CITY.walkOuter;
  const pedSpots = [
    [bx - walk + 1.9, carZ - 9],
    [bx - walk + 2.4, carZ - 15],
    [bx + walk - 2.0, carZ - 6],
    [bx + walk - 2.8, carZ - 13],
    [bx + walk - 2.2, carZ - 24],
    [bx - walk + 2.2, carZ - 30],
  ];
  w.pedArr.forEach((p, i) => {
    const spot = pedSpots[i];
    if (!spot) return;
    p.x = spot[0];
    p.z = spot[1];
    p.block = { cx: bx + (spot[0] > bx ? 55 : -55), cz: carZ - 18, half: 38 };
    p.group.position.set(p.x, 0.15, p.z);
    p.group.rotation.y = spot[0] > bx ? Math.PI / 2 : -Math.PI / 2;
    p.alive = true;
    p.fear = i % 3 === 0 ? 0.5 : 0;
  });
  // Remaining pedestrians: scatter along the far sidewalk so the street is busy.
  w.pedArr.forEach((p, i) => {
    if (i < pedSpots.length) return;
    const side = i % 2 === 0 ? -1 : 1;
    p.x = bx + side * (walk - 1.5 - (i % 3) * 0.8);
    p.z = carZ - 40 - (i % 24) * 3.6;
    p.group.position.set(p.x, 0.15, p.z);
    p.alive = true;
  });

  // Traffic in the far distance is fine to leave where the generator put it.

  // Settle: a handful of steps with a slight throttle so the scene is live.
  simulate(game, 22, { throttle: 0.55, script: (i, g) => {
    const car = g.world.player.car;
    car.z = carZ - i * 0.18;
  } });

  // Pin the cruisers into their marks after the sim has run, so the pursuit AI
  // cannot drive them out of frame, and give the bars a mid-flash phase.
  const car = w.player.car;
  const [c1, c2] = w.police.cruisers;
  if (c1) {
    c1.x = bx - 4.3;
    c1.z = carZ - 7.5;
    c1.yaw = Math.PI * 0.64;
    c1.mesh.position.set(c1.x, 0, c1.z);
    c1.mesh.rotation.y = c1.yaw;
    c1.lightPhase = 0.75;
    c1.updateLights(0, 0);
  }
  if (c2) {
    c2.x = bx + 6.5;
    c2.z = carZ - 17.5;
    c2.yaw = -0.34;
    c2.mesh.position.set(c2.x, 0, c2.z);
    c2.mesh.rotation.y = c2.yaw;
    c2.lightPhase = 2.6;
    c2.updateLights(0, 0);
  }

  // Frame it: low and close behind the coupe, the boulevard running away to the
  // haze, cruisers flanking the nose.
  const cam = w.cameraRig;
  cam.yaw = yaw;
  cam.pos.set(car.x + 1.25, 2.72, car.z + 8.1);
  cam.look.set(car.x - 0.55, 1.34, car.z - 15);
  cam.fov = 57;
  cam.rollBias = 0.015;
  cam.apply();

  w.hud.showBanner('SUNSET VERGE', 'Wanted 3  ·  Dispatch is closing in', 0.1);
  w.hud.bannerTime = 0.0001;

  w.audio.siren(1);
}

/** chase — wider, faster, cruisers close, five stars. */
function stageChase(game) {
  const w = game.world;
  const roads = w.layout.roads;
  const bx = roads[3];
  const yaw = -0.06;
  const carZ = 26;

  w.state = 'playing';
  stageCar(game, { x: bx + 2.4, z: carZ, yaw, speed: 26 });
  w.police.wanted.stars = 5;
  w.police.wanted.heat = 0.6;
  w.economy.cash = 6420;
  w.weapon.mag = 9;

  // Cruisers flanking the player, all ahead of the lens: one ramming alongside
  // on the left, one cut off in the right lane, one angling in further up.
  addCruiser(game, bx - 3.9, carZ + 2.0, yaw + 0.26, 27);
  addCruiser(game, bx + 5.0, carZ - 4.5, yaw - 0.30, 25);
  addCruiser(game, bx - 4.6, carZ - 13.0, yaw + 0.16, 26);

  simulate(game, 26, { throttle: 1, steer: 0.12, script: (i, g) => {
    const car = g.world.player.car;
    car.x = bx + 2.4 + Math.sin(i * 0.09) * 1.8;
    car.z = carZ - i * 0.30;
  } });

  // Pin everything after the sim so pursuit AI cannot drive the cruisers out of
  // shot or slide one between the camera and the car.
  const car = w.player.car;
  const marks = [
    { x: car.x - 3.9, z: car.z + 2.0, yaw: yaw + 0.26, phase: 0.35 },
    { x: car.x + 2.6, z: car.z - 4.5, yaw: yaw - 0.30, phase: 2.35 },
    { x: car.x - 4.6, z: car.z - 13.0, yaw: yaw + 0.16, phase: 1.6 },
  ];
  for (const [k, c] of w.police.cruisers.entries()) {
    const m = marks[k];
    if (!m) continue;
    c.x = m.x;
    c.z = m.z;
    c.yaw = m.yaw;
    c.lightPhase = m.phase;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.yaw;
    c.updateLights(0, 0);
  }

  const cam = w.cameraRig;
  cam.yaw = yaw + 0.02;
  cam.pos.set(car.x + 1.2, 4.3, car.z + 14.2);
  cam.look.set(car.x - 0.5, 1.1, car.z - 18);
  cam.fov = 69;
  cam.apply();

  w.hud.showBanner('FIVE STARS', 'Every cruiser on the coast is on you', 0.0001);
  w.hud.bannerTime = 0.0001;
  w.audio.siren(1);
}

/** foot — Marisol on foot, weapon drawn, police firing back. */
function stageFoot(game) {
  const w = game.world;
  const roads = w.layout.roads;
  const bx = roads[2];
  const carZ = -34;

  w.state = 'playing';
  // Park the coupe and put Marisol out on the road behind it.
  stageCar(game, { x: bx + 5.6, z: carZ + 3, yaw: 0.5, speed: 0 });
  w.player.inCar = false;
  const foot = w.footPlayer;
  foot.spawn(bx - 1.2, carZ, 0.25);
  foot.health = 74;
  w.cameraRig.mode = 'foot';
  w.cameraRig.footYaw = 0.08;
  w.cameraRig.footPitch = -0.02;
  w.cameraRig.pos.set(foot.x + 1.4, 2.05, foot.z + 4.2);
  w.cameraRig.look.set(foot.x - 0.4, 1.3, foot.z - 8);

  w.police.wanted.stars = 2;
  w.weapon.mag = 7;
  w.weapon.ammo = 44;
  w.economy.cash = 2310;

  // Two officers dismounted and standing in the road ahead of Marisol, pistols
  // up. Placed explicitly below so they are guaranteed inside the frame.
  const c1 = addCruiser(game, bx + 4.2, carZ - 13.5, 2.35, 0);
  c1.state = 'shoot';
  const c2 = addCruiser(game, bx - 8.6, carZ - 12.0, 1.9, 0);
  c2.state = 'shoot';

  // Some pedestrians scattering up the sidewalk.
  w.pedArr.forEach((p, i) => {
    if (i > 10) return;
    const side = i % 2 === 0 ? -1 : 1;
    p.x = bx + side * (CITY.walkOuter - 2.2);
    p.z = carZ - 6 - i * 3.1;
    p.group.position.set(p.x, 0.15, p.z);
    p.fear = 1.1;
    p.alive = true;
  });

  // Fire a shot so the muzzle flash and a tracer are in frame.
  simulate(game, 8, { script: (i, g) => {
    if (i === 6) {
      g.world.weapon.fire(
        new THREE.Vector3(foot.x - Math.sin(0.25) * 0.6, 1.4, foot.z - Math.cos(0.25) * 0.6),
        new THREE.Vector3(-Math.sin(0.25), -0.02, -Math.cos(0.25)),
        g.world,
      );
      g.world.weapon.showFlash(new THREE.Vector3(foot.x - Math.sin(0.25) * 0.7, 1.4, foot.z - Math.cos(0.25) * 0.7));
      g.world.weapon.flashLife = 0.4;
    }
  } });

  // Third-person three-quarter view from behind Marisol's right shoulder, so the
  // extended arm, the pistol and its muzzle flash are all clear of her silhouette
  // and the officers ahead are unobstructed.
  const cam = w.cameraRig;
  cam.mode = 'foot';
  const camYaw = 0.25;
  cam.footYaw = camYaw;
  cam.pos.set(
    foot.x + Math.sin(camYaw) * 4.2 + Math.cos(camYaw) * 1.3,
    2.05,
    foot.z + Math.cos(camYaw) * 4.2 - Math.sin(camYaw) * 1.3,
  );
  cam.look.set(foot.x - Math.sin(camYaw) * 10.5, 1.34, foot.z - Math.cos(camYaw) * 10.5);
  cam.fov = 62;
  cam.rollBias = 0;
  cam.apply();

  foot.group.position.set(foot.x, 0.15, foot.z);
  foot.group.rotation.y = foot.yaw;
  // Right arm out, pistol level, sighting down the road.
  foot.group.userData.arms[1].rotation.x = -1.55;
  foot.group.userData.arms[1].rotation.z = -0.1;

  // Two officers dismounted in plain view, just ahead and to either side, so the
  // frame unambiguously shows police on foot returning fire.
  const crewMarks = [
    { car: c1, x: bx - 0.6, z: carZ - 8.4 },
    { car: c2, x: bx - 5.4, z: carZ - 7.2 },
  ];

  // Officer muzzle flashes at the end of each raised pistol, so the return fire
  // is legible and not just a lone tracer.
  for (let i = 0; i < crewMarks.length; i++) {
    const m = crewMarks[i];
    const dirToPlayer = new THREE.Vector3(foot.x - m.x, 0, foot.z - m.z).normalize();
    const flashPos = new THREE.Vector3(m.x + dirToPlayer.x * 0.85, 1.32, m.z + dirToPlayer.z * 0.85);
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffe6a8,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    spr.position.copy(flashPos);
    spr.scale.setScalar(0.85 + i * 0.1);
    w.scene.add(spr);
  }

  const crewPositions = [];
  for (const m of crewMarks) {
    const cr = m.car.crew;
    cr.visible = true;
    cr.position.set(m.x, 0, m.z);
    const aimYaw = Math.atan2(-(foot.x - m.x), -(foot.z - m.z));
    cr.rotation.y = aimYaw;
    m.car.crewYaw = aimYaw;
    crewPositions.push(new THREE.Vector3(m.x, 1.32, m.z));
  }

  // Re-arm the muzzle flash and the tracers right before the capture: they decay
  // in a few milliseconds of sim time and the whole point of this stage is to
  // show a firefight in progress.
  const w2 = w.weapon;
  const mz = new THREE.Vector3(
    foot.x - Math.sin(foot.yaw) * 0.72,
    1.42,
    foot.z - Math.cos(foot.yaw) * 0.72,
  );
  w2.showFlash(mz);
  w2.flashLife = 1;
  w2.flash.visible = true;
  w2.flash.scale.setScalar(0.8);
  // Player's tracer running out toward the officer on the right.
  w2.spawnTracer(mz, crewPositions[0].clone());
  // Return fire from both officers.
  for (const cp of crewPositions) {
    const to = new THREE.Vector3(foot.x, 1.4, foot.z);
    w2.spawnTracer(cp.clone(), cp.clone().addScaledVector(to.clone().sub(cp).normalize(), cp.distanceTo(to) * 0.85));
  }
  for (const t of w2.tracerPool) {
    if (t.life > 0) {
      t.life = 1;
      t.mesh.material.opacity = 0.95;
      t.mesh.visible = true;
    }
  }

  w.hud.showBanner('PELICAN QUAY', 'Officer down — units are engaging', 0.0001);
  w.hud.bannerTime = 0.0001;
}

/** title — the start screen over the live boulevard. */
function stageTitle(game) {
  const w = game.world;
  w.state = 'title';
  w.titleClock = 1.72;

  // Park the coupe on the boulevard and orbit the camera above it.
  const roads = w.layout.roads;
  const bx = roads[2];
  stageCar(game, { x: bx + 2.4, z: -30, yaw: 0, speed: 0 });
  w.player.car.mesh.position.set(bx + 2.4, 0, -30);
  w.player.car.mesh.rotation.y = 0;

  w.pedArr.forEach((p, i) => {
    if (i > 22) return;
    const side = i % 2 === 0 ? -1 : 1;
    p.x = bx + side * (CITY.walkOuter - 2.4 - (i % 3) * 0.7);
    p.z = -18 - (i % 14) * 4.0;
    p.group.position.set(p.x, 0.15, p.z);
    p.alive = true;
  });

  const t = w.titleClock * 0.09;
  const r = 44;
  w.camera.position.set(Math.sin(t) * r + bx * 0.55, 15 + Math.sin(t * 0.7) * 3, 18 + Math.cos(t) * r * 0.55);
  w.camera.lookAt(bx * 0.4, 2.4, -46);
  w.camera.fov = 58;
  w.camera.updateProjectionMatrix();

  w.lights.sun.target.position.set(bx, 0, -40);
  w.lights.sun.target.updateMatrixWorld();
  const dir = new THREE.Vector3(-0.62, 0.46, -0.55).normalize();
  w.lights.sun.position.set(bx, 0, -40).addScaledVector(dir, 150);
  w.sky.sky.position.copy(w.camera.position);

  // Step a little so the traffic is mid-stride, not at t=0.
  for (let i = 0; i < 40; i++) {
    for (const car of w.trafficCarsArr) car.update(STEP, null);
    for (const ped of w.pedArr) ped.update(STEP, null, false);
  }
}

/**
 * Runs a named stage, renders one settled frame, and only then announces
 * SHOT_READY. A couple of extra frames flush the texture uploads and the first
 * shadow-map pass, which would otherwise appear on the captured still.
 */
export function runShot(game, name) {
  const w = game.world;
  const stages = { cover: stageCover, chase: stageChase, foot: stageFoot, title: stageTitle };
  const stage = stages[name];
  if (!stage) {
    document.title = `SHOT_UNKNOWN_${name}`;
    return;
  }

  // Settle the HUD's cash roll so the dollar figure is exact on capture.
  stage(game);
  if (name !== 'title') {
    w.hud.cashShown = w.economy.cash;
  }
  // Deterministic renders: these are pure state, not time.
  for (let i = 0; i < 6; i++) {
    w.renderer.render(w.scene, w.camera);
  }
  // Draw the HUD (with dt 0 so no timers move) and compose the final frame.
  w.hud.draw(w, 0);
  w.renderer.render(w.scene, w.camera);

  // One more render+HUD pair after the shadow map has been built, then signal.
  requestAnimationFrame(() => {
    w.renderer.render(w.scene, w.camera);
    w.hud.draw(w, 0);
    w.renderer.render(w.scene, w.camera);
    // Force the compositor to have presented both canvases.
    requestAnimationFrame(() => {
      w.renderer.render(w.scene, w.camera);
      w.hud.draw(w, 0);
      document.title = 'SHOT_READY';
    });
  });
}

export function isShotMode() {
  return new URLSearchParams(window.location.search).has('shot');
}
