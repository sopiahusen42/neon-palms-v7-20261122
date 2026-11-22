// The five story jobs and their objectives. Each mission is a small state
// machine keyed off world events (arrive somewhere, deliver a car, take out a
// crew, survive a chase, reach the boat), with a real briefing, dialogue lines
// spoken by the cast as radio chatter, and a completion reward.

import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';
import { distance2D } from './util.js';

export const CAST = {
  marisol: { name: 'Marisol Vega', colour: '#ffd08a' },
  reyes: { name: 'Tomas Reyes', colour: '#9fd8e8' },
  june: { name: 'June Okafor', colour: '#f2a6b8' },
  kilo: { name: 'Kilo Brandt', colour: '#c4b0f0' },
  warden: { name: 'Warden Tessa Cho', colour: '#ffb08a' },
};

/** A marker ring drawn on the road at a mission point. */
export function createMarker(scene) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffcf4a,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xffd45e,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.15, 32), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  g.add(disc);
  // A soft shaft of light rising from the marker.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe6a8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.6, 26, 20, 1, true), beamMat);
  beam.position.y = 13;
  g.add(beam);
  g.visible = false;
  scene.add(g);
  return { group: g, ring, beam };
}

function markerPosition(seed) {
  const s = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  const t = Math.abs(Math.sin(seed * 78.233) * 12345.6789) % 1;
  const roads = [-192, -96, 0, 96, 192];
  const x = roads[Math.floor(s * roads.length)];
  const z = roads[Math.floor(t * roads.length)];
  // Offset into the near lane so the marker sits on the road, not the junction.
  return { x: x + 3.2, z: z - 30 };
}

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Palm Grease',
    brief: 'REYES',
    lines: [
      ['reyes', 'Marisol. The white coupe on Sunset Verge is yours for the night.'],
      ['reyes', 'Bring it to the Coral Row lockup before the sun drops. No scratches.'],
      ['marisol', 'And if it already has scratches?'],
      ['reyes', 'Then you polish them out, chica. Drive.'],
    ],
    reward: 900,
    kind: 'deliver',
  },
  {
    id: 'ledger',
    title: 'The Ledger Job',
    brief: 'JUNE',
    lines: [
      ['june', 'Kilo keeps his book in a blue saloon on Marisol Heights.'],
      ['june', 'Take the car. The book goes with it. Do not open it, do not read it.'],
      ['marisol', 'A book. In a car. In this heat.'],
      ['june', 'Welcome to Neon Palms.'],
    ],
    reward: 1400,
    kind: 'steal',
  },
  {
    id: 'witness',
    title: 'Witness at the Quay',
    brief: 'KILO',
    lines: [
      ['kilo', 'Someone at Pelican Quay saw the ledger move.'],
      ['kilo', 'I need them quiet. Not dead, Vega. Quiet.'],
      ['marisol', "I don't take that job."],
      ['kilo', 'Then take the money and stay out of my quay.'],
    ],
    reward: 2000,
    kind: 'survive',
  },
  {
    id: 'heat',
    title: 'Five Stars Over Verano',
    brief: 'REYES',
    lines: [
      ['reyes', 'They put you on the wire, Marisol. Every cruiser on the coast.'],
      ['reyes', 'Lose them on the Strip. There is a garage at the north end.'],
      ['marisol', "If I lose them, I'm gone."],
      ['reyes', 'If you lose them, you are free. Go.'],
    ],
    reward: 3200,
    kind: 'escape',
  },
  {
    id: 'boat',
    title: 'Last Boat Out',
    brief: 'MARISOL',
    lines: [
      ['marisol', 'One car, one dock, one boat. That is the whole plan.'],
      ['june', 'The Warden is already at the marina, Marisol.'],
      ['marisol', 'Then she can watch me leave.'],
      ['warden', 'Marisol Vega. Step out of the vehicle.'],
    ],
    reward: 6000,
    kind: 'finale',
  },
];

const RADIO_CHATTER = {
  pickup: [
    'REYES: The coupe is on Sunset Verge, near the palms. Bring it home clean.',
    'MARISOL: Copy. Coral Row lockup, before sundown.',
  ],
  ledger: [
    'JUNE: Blue saloon, Marisol Heights. The book is under the passenger seat.',
    'MARISOL: And if Kilo sees me?',
    'JUNE: Then drive faster than his boys.',
  ],
  witness: [
    'KILO: Pelican Quay. Witness is in a cream saloon. Keep them moving.',
    'MARISOL: I am not hurting anyone, Kilo.',
    'KILO: Then keep the police busy instead.',
  ],
  heat: [
    'REYES: You are hot, chica. Five stars and climbing.',
    'MARISOL: Tell me something I cannot hear from the sirens.',
    'REYES: North garage. Go.',
  ],
  boat: [
    'WARDEN: Vega, this is your last warning.',
    'MARISOL: Last warning. Sounds like a plan.',
    'JUNE: Boat is at the east marina. I left the keys in it.',
  ],
};

export class Missions {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.marker = createMarker(scene);
    this.active = null;
    this.completed = new Set();
    this.index = 0;
    this.dialogTimer = 0;
    this.dialogQueue = [];
    this.dialogLine = null;
    this.chatterCooldown = 0;
    this.killCount = 0;
    this.startTimer = 0;
  }

  completedList() {
    return [...this.completed];
  }

  restore(list) {
    this.completed = new Set(list ?? []);
    this.index = MISSIONS.findIndex((m) => !this.completed.has(m.id));
    if (this.index < 0) this.index = MISSIONS.length;
  }

  nextAvailable() {
    return MISSIONS.find((m) => !this.completed.has(m.id)) ?? null;
  }

  activeMarker() {
    return this.active?.marker ?? null;
  }

  /** Start the next uncompleted mission if the player is near its marker. */
  tryStartNear() {
    if (this.active) return false;
    const next = this.nextAvailable();
    if (!next) return false;
    const p = this.world.playerPosition();
    const pos = markerPosition(MISSIONS.indexOf(next) + 3);
    if (distance2D(p.x, p.z, pos.x, pos.z) > 9) return false;
    this.start(next);
    return true;
  }

  start(mission) {
    const pos = markerPosition(MISSIONS.indexOf(mission) + 3);
    this.active = {
      ...mission,
      marker: pos,
      objective: '',
      progressText: '',
      stage: 0,
      timer: 0,
      kills: 0,
      started: true,
    };
    this.marker.group.position.set(pos.x, 0, pos.z);
    this.marker.group.visible = true;
    this.world.economy.recordStart?.(mission.title);
    this.world.hud.showBanner(mission.title, mission.brief === 'MARISOL' ? 'Final job' : `Job from ${CAST[mission.brief.toLowerCase()]?.name ?? mission.brief}`, 5);
    this.say(mission.lines[0]);
    this.dialogQueue = mission.lines.slice(1);
    this.dialogTimer = 0;
    this.setObjectiveFor(mission);
    this.world.audio?.blip(880, 0.09, 0.14);
    return true;
  }

  setObjectiveFor(mission) {
    const a = this.active;
    if (!a) return;
    switch (mission.kind) {
      case 'deliver':
        a.objective = 'Steal the white coupe and deliver it to the Coral Row lockup.';
        a.progressText = '0 / 1 DELIVERED';
        break;
      case 'steal':
        a.objective = 'Take the blue saloon from Marisol Heights and get clear.';
        a.progressText = 'WANTED: LOSE THEM';
        break;
      case 'witness':
        a.objective = 'Keep the witness moving — survive three minutes of pursuit.';
        a.progressText = 'SURVIVE';
        break;
      case 'escape':
        a.objective = 'Shake the five-star pursuit and reach the north garage.';
        a.progressText = 'LOSE THE COPS';
        break;
      case 'finale':
        a.objective = 'Reach the east marina and get to the boat.';
        a.progressText = 'FINAL JOB';
        break;
    }
  }

  say(line) {
    if (!line) return;
    const [who, text] = line;
    const speaker = CAST[who] ?? CAST.marisol;
    this.dialogLine = { who: speaker.name, text, colour: speaker.colour, age: 0 };
  }

  /** Advance the mission on world events. */
  update(dt) {
    if (this.dialogLine) {
      this.dialogLine.age += dt;
      if (this.dialogLine.age > 1.2 && this.dialogQueue.length > 0) {
        this.dialogTimer -= dt;
        if (this.dialogTimer <= 0) {
          this.say(this.dialogQueue.shift());
          this.dialogTimer = 0;
        }
      } else if (this.dialogLine.age > 7 && this.dialogQueue.length === 0) {
        this.dialogLine = null;
      }
    }
    const a = this.active;
    if (!a) return;
    a.timer += dt;

    const p = this.world.playerPosition();
    const inCar = this.world.player.inCar;
    const stars = this.world.police.stars;

    if (a.kind === 'deliver') {
      const car = this.world.player.car;
      const mine = this.world.player.inCar && car.kind === 'coupe';
      const d = distance2D(p.x, p.z, a.marker.x, a.marker.z);
      a.progressText = mine ? (d < 22 ? 'ALMOST THERE' : 'DELIVER THE COUPE') : 'STEAL A COUPE';
      if (mine && d < 7) this.complete('The white coupe is in the lockup. Reyes pays without a word.');
    } else if (a.kind === 'steal') {
      a.progressText = stars > 0 ? `WANTED ${'★'.repeat(stars)}` : 'GET CLEAR';
      if (this.world.player.inCar && this.world.player.car.kind === 'saloon' && a.timer > 12 && stars === 0) {
        this.complete('The ledger is in the boot. June will want it tonight.');
      }
    } else if (a.kind === 'survive') {
      const remain = Math.max(0, 180 - a.timer);
      a.progressText = `SURVIVE ${Math.floor(remain / 60)}:${String(Math.floor(remain % 60)).padStart(2, '0')}`;
      if (a.timer >= 180) this.complete('The witness is gone over the causeway. Kilo never learns your name.');
    } else if (a.kind === 'escape') {
      a.progressText = stars > 0 ? `WANTED ${stars} · ${distance2D(p.x, p.z, a.marker.x, a.marker.z).toFixed(0)} m` : 'REACH THE GARAGE';
      if (stars === 0) a.stage = 1;
      if (a.stage === 1 && distance2D(p.x, p.z, a.marker.x, a.marker.z) < 12) {
        this.complete('The garage door rolls down behind you. For one night, you do not exist.');
      }
    } else if (a.kind === 'finale') {
      a.progressText = `${distance2D(p.x, p.z, a.marker.x, a.marker.z).toFixed(0)} m TO THE BOAT`;
      if (distance2D(p.x, p.z, a.marker.x, a.marker.z) < 12) {
        this.complete('The engine catches. Neon Palms gets smaller in the mirror.');
      }
    }
  }

  complete(summary) {
    const a = this.active;
    if (!a) return;
    this.completed.add(a.id);
    this.world.economy.addCash(a.reward);
    this.world.hud.showBanner('MISSION PASSED', `${a.title}  ·  $${a.reward.toLocaleString('en-US')}`, 5);
    this.world.hud.showToast(summary, 5);
    this.active = null;
    this.marker.group.visible = false;
    this.dialogQueue = [];
    this.dialogLine = null;
    this.world.audio?.blip(1180, 0.12, 0.14);
    this.world.onMissionComplete?.(a.id);
  }

  /** Police chatter while a job is live. */
  chatter(dt) {
    this.chatterCooldown = Math.max(0, this.chatterCooldown - dt);
    if (!this.active || this.chatterCooldown > 0) return;
    this.chatterCooldown = 26;
    const lines = RADIO_CHATTER[this.active.id];
    if (lines) this.world.hud.showToast(lines[this.killCount % lines.length], 4.5);
    this.killCount++;
  }
}
