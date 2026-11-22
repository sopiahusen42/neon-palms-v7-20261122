// The chase camera and the on-foot camera. The chase camera trails the car by
// position and yaw with spring damping, so it swings wide through corners and
// settles behind the tail; it also pulls back and lifts with speed, and shakes
// on impact. The cover frame is this camera, low, close, and raked by the sun.

import * as THREE from '../../vendor/three.module.min.js';
import { CAMERA } from './config.js';
import { clamp, damp, lerpAngle, wrapAngle } from './util.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pos = new THREE.Vector3(0, 6, 12);
    this.look = new THREE.Vector3();
    this.distance = CAMERA.chaseDistance;
    this.height = CAMERA.chaseHeight;
    this.shake = 0;
    this.mode = 'chase';
    this.footYaw = 0;
    this.footPitch = -0.06;
    this.footDistance = CAMERA.footDistance;
    this.fov = CAMERA.chaseFov;
    this.initialised = false;
    this.rollBias = 0;
  }

  /** Snap (used at boot and at shot staging) so the first frame is already framed. */
  jumpTo(car) {
    this.yaw = car.yaw;
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.set(car.x + back.x * this.distance, this.height, car.z + back.z * this.distance);
    this.look.set(car.x, 1.1, car.z);
    this.initialised = true;
    this.apply();
  }

  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  update(dt, target, speed) {
    if (this.mode === 'foot') {
      this.updateFoot(dt, target);
      return;
    }
    const spd = Math.abs(speed);
    const t = clamp(spd / 32, 0, 1);
    // Ease the yaw toward the car's heading, faster at higher speed so the car
    // does not run out of frame, slower at a crawl so it looks lazy.
    const rate = 2.4 + t * 3.2;
    this.yaw = lerpAngle(this.yaw, target.yaw, 1 - Math.exp(-rate * dt));

    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dist = this.distance + t * 2.6;
    const height = this.height + t * 0.8;
    const desired = new THREE.Vector3(target.x + back.x * dist, height, target.z + back.z * dist);
    this.pos.x = damp(this.pos.x, desired.x, 7.5, dt);
    this.pos.z = damp(this.pos.z, desired.z, 7.5, dt);
    this.pos.y = damp(this.pos.y, desired.y, 5.5, dt);

    // Look a little ahead of the car, using its heading.
    const fwd = new THREE.Vector3(-Math.sin(target.yaw), 0, -Math.cos(target.yaw));
    const lookTarget = new THREE.Vector3(target.x, 1.15, target.z).addScaledVector(fwd, CAMERA.chaseLookAhead * (0.4 + t * 0.6));
    this.look.x = damp(this.look.x, lookTarget.x, 9, dt);
    this.look.y = damp(this.look.y, lookTarget.y, 9, dt);
    this.look.z = damp(this.look.z, lookTarget.z, 9, dt);

    this.fov = damp(this.fov, CAMERA.chaseFov + t * 8, 3, dt);
    this.rollBias = damp(this.rollBias, -target.steer * t * 0.045, 4, dt);
    this.apply();
  }

  updateFoot(dt, target) {
    const yaw = this.footYaw;
    const dist = this.footDistance;
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    // Slightly over the right shoulder.
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const desired = new THREE.Vector3(
      target.x + back.x * dist + right.x * 0.55,
      CAMERA.footHeight + Math.sin(-this.footPitch) * 1.2,
      target.z + back.z * dist + right.z * 0.55,
    );
    this.pos.x = damp(this.pos.x, desired.x, 14, dt);
    this.pos.y = damp(this.pos.y, desired.y, 14, dt);
    this.pos.z = damp(this.pos.z, desired.z, 14, dt);
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const lookTarget = new THREE.Vector3(target.x, 1.35, target.z).addScaledVector(fwd, 5);
    lookTarget.y += Math.tan(this.footPitch) * 5;
    this.look.x = damp(this.look.x, lookTarget.x, 18, dt);
    this.look.y = damp(this.look.y, lookTarget.y, 18, dt);
    this.look.z = damp(this.look.z, lookTarget.z, 18, dt);
    this.fov = damp(this.fov, CAMERA.footFov, 6, dt);
    this.rollBias = damp(this.rollBias, 0, 4, dt);
    this.apply();
  }

  apply() {
    const shakeAmount = this.shake;
    let sx = 0;
    let sy = 0;
    if (shakeAmount > 0.001) {
      const tt = performance.now() * 0.001;
      sx = Math.sin(tt * 61.3) * shakeAmount * 0.11;
      sy = Math.cos(tt * 47.7) * shakeAmount * 0.09;
      this.shake = Math.max(0, this.shake - 0.045);
    }
    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.look.x, this.look.y, this.look.z);
    this.camera.rotation.z += this.rollBias;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Mouse look while on foot. (Named lookDelta: `this.look` is the look-at Vector3.) */
  lookDelta(dx, dy) {
    if (this.mode !== 'foot') return;
    this.footYaw = wrapAngle(this.footYaw - dx * 0.0026);
    this.footPitch = clamp(this.footPitch - dy * 0.0022, -0.75, 0.55);
  }
}
