// The 2D HUD canvas, layered over the WebGL canvas. Everything the games of
// this genre put on screen: a circular minimap with the real street grid, a
// wanted star row, cash with the GTA-style comma roll, the weapon block with
// ammo, a health bar, the mission card, the radio readout and a dispatch banner.
// No full-frame vignette: only small drop shadows under each element.

import { CITY } from './config.js';
import { drawMinimap } from './minimap.js';

const FONT = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const INK = '#f6f1e2';
const SHADOW = 'rgba(20,32,40,0.55)';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { size = 16, weight = 700, colour = INK, align = 'left', shadow = 4, spacing = 0, font = FONT } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (spacing !== 0 && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  if (shadow) {
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = shadow;
    ctx.shadowOffsetY = 1;
  }
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function star(ctx, x, y, r, filled, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.44;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.shadowColor = 'rgba(20,30,40,0.7)';
  ctx.shadowBlur = 5;
  if (filled) {
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.5, '#ffd45e');
    g.addColorStop(1, '#e8a021');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(90,64,10,0.75)';
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(246,241,226,0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 1280;
    this.height = 720;
    this.cashShown = 0;
    this.bannerTime = 0;
    this.banner = null;
    this.toast = null;
    this.toastTime = 0;
    this.hurt = 0;
    this.dpr = 1;
  }

  resize(w, h, dpr = 1) {
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  showBanner(title, subtitle, seconds = 4.5) {
    this.banner = { title, subtitle };
    this.bannerTime = seconds;
  }

  showToast(message, seconds = 2.6) {
    this.toast = message;
    this.toastTime = seconds;
  }

  flashHurt() {
    this.hurt = 1;
  }

  draw(game, dt) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);

    if (game.state === 'title') {
      this.drawTitle(game, dt);
      return;
    }

    const scale = Math.min(W / 1280, H / 720);
    ctx.save();
    ctx.scale(scale, scale);
    const VW = W / scale;
    const VH = H / scale;

    this.drawMinimapPanel(ctx, game, VW, VH);
    this.drawWanted(ctx, game, VW);
    this.drawCash(ctx, game, VW, VH, dt);
    this.drawWeapon(ctx, game, VW, VH);
    this.drawHealth(ctx, game, VW, VH);
    this.drawRadio(ctx, game, VW, VH);
    this.drawMission(ctx, game, VW, VH);
    this.drawBanner(ctx, VW, VH);
    this.drawPrompts(ctx, game, VW, VH);
    if (game.state === 'paused') this.drawPause(ctx, VW, VH);
    if (this.hurt > 0.01) {
      const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.28, VW / 2, VH / 2, VH * 0.85);
      g.addColorStop(0, 'rgba(180,30,20,0)');
      g.addColorStop(1, `rgba(180,30,20,${0.42 * this.hurt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ panels

  drawMinimapPanel(ctx, game, VW, VH) {
    const r = 92;
    const cx = 24 + r;
    const cy = 24 + r;
    drawMinimap(ctx, game, cx, cy, r);
    // Compass ticks and the district name under the disc.
    text(ctx, game.districtName().toUpperCase(), cx, cy + r + 22, { size: 13, weight: 700, align: 'center', spacing: 1.5 });
    const clock = game.worldClock();
    text(ctx, clock, cx, cy + r + 40, { size: 12, weight: 600, align: 'center', colour: 'rgba(246,241,226,0.86)' });
  }

  drawWanted(ctx, game, VW) {
    const stars = game.police.stars;
    const x0 = VW - 26 - 5 * 34;
    for (let i = 0; i < 5; i++) {
      star(ctx, x0 + i * 34 + 15, 44, 13.5, i < stars, i < stars ? 1 : 0.55);
    }
    if (stars > 0) {
      const heat = game.police.wanted.heat;
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(20,32,40,0.4)';
      roundRect(ctx, x0 + 4, 62, 5 * 34 - 8, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#ffcf5a';
      roundRect(ctx, x0 + 4, 62, (5 * 34 - 8) * (1 - heat), 4, 2);
      ctx.fill();
      ctx.restore();
      text(ctx, 'WANTED', x0 - 14, 50, { size: 13, weight: 700, align: 'right', colour: '#ffd98a', spacing: 2 });
    }
  }

  drawCash(ctx, game, VW, VH, dt) {
    const target = game.economy.cash;
    this.cashShown += (target - this.cashShown) * Math.min(1, dt * 8);
    if (Math.abs(target - this.cashShown) < 1) this.cashShown = target;
    const value = Math.round(this.cashShown).toLocaleString('en-US');
    const x = VW - 26;
    text(ctx, `$${value}`, x, VH - 66, { size: 34, weight: 800, align: 'right', colour: '#b9f0c4', shadow: 6 });
    ctx.save();
    ctx.font = `800 34px ${FONT}`;
    const valueW = ctx.measureText(`$${value}`).width;
    ctx.restore();
    text(ctx, 'CASH', x - valueW - 10, VH - 68, {
      size: 12,
      weight: 700,
      align: 'right',
      colour: 'rgba(246,241,226,0.7)',
      spacing: 1.6,
    });
  }

  drawWeapon(ctx, game, VW, VH) {
    const w = game.weapon;
    const x = VW - 26;
    const y = VH - 132;
    text(ctx, w.name.toUpperCase(), x, y, { size: 13, weight: 700, align: 'right', colour: 'rgba(246,241,226,0.8)', spacing: 1.4 });

    const mag = String(w.mag).padStart(2, '0');
    const reserve = `/ ${w.ammo}`;
    ctx.save();
    ctx.font = `800 40px ${FONT}`;
    const magW = ctx.measureText(mag).width;
    ctx.restore();

    text(ctx, mag, x, y + 36, { size: 40, weight: 800, align: 'right', colour: w.mag === 0 ? '#ff8a72' : INK, shadow: 6 });
    text(ctx, reserve, x - magW - 6, y + 36, { size: 17, weight: 700, align: 'right', colour: 'rgba(246,241,226,0.72)' });

    // Pistol glyph beside the numerals.
    ctx.save();
    ctx.translate(x - magW - 6 - 46, y + 14);
    ctx.fillStyle = 'rgba(246,241,226,0.9)';
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 4;
    ctx.fillRect(0, 0, 26, 7);
    ctx.fillRect(2, 7, 8, 13);
    ctx.fillRect(22, 4, 6, 4);
    ctx.restore();

    if (w.reloading > 0) {
      const p = 1 - w.reloading / 1.55;
      ctx.save();
      ctx.fillStyle = 'rgba(20,32,40,0.45)';
      roundRect(ctx, x - 132, y + 46, 132, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#ffd45e';
      roundRect(ctx, x - 132, y + 46, 132 * p, 5, 2.5);
      ctx.fill();
      ctx.restore();
      text(ctx, 'RELOADING', x, y + 44, { size: 11, weight: 700, align: 'right', colour: '#ffd45e', spacing: 2 });
    } else if (w.mag === 0) {
      text(ctx, 'PRESS R', x, y + 50, { size: 12, weight: 700, align: 'right', colour: '#ff8a72', spacing: 2 });
    }
  }

  drawHealth(ctx, game, VW, VH) {
    const hp = Math.max(0, game.playerHealth());
    const x = 26;
    const y = VH - 58;
    const w = 210;
    const h = 13;
    ctx.save();
    // Health bar with a segmented fill.
    ctx.fillStyle = 'rgba(18,30,38,0.46)';
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 3);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, hp > 40 ? '#69d68a' : '#e8603f');
    g.addColorStop(1, hp > 40 ? '#b6f0b0' : '#ffb08a');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, (w * hp) / 100, h, 2);
    ctx.fill();
    // Segment ticks.
    ctx.fillStyle = 'rgba(18,30,38,0.4)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + (w * i) / 10, y, 1.5, h);
    ctx.restore();
    text(ctx, 'HEALTH', x, y - 10, { size: 11, weight: 700, colour: 'rgba(246,241,226,0.78)', spacing: 2 });
    // Armour pips as a decorative second bar, since the armour system is stubbed.
    text(ctx, `${Math.round(hp)}`, x + w + 10, y + h, { size: 13, weight: 700, colour: 'rgba(246,241,226,0.8)' });
  }

  drawRadio(ctx, game, VW, VH) {
    const station = game.radio.station;
    const w = 268;
    const x = VW / 2 - w / 2 + 90;
    const y = VH - 44;
    ctx.save();
    ctx.fillStyle = 'rgba(18,30,38,0.34)';
    roundRect(ctx, x, y - 22, w, 34, 4);
    ctx.fill();
    ctx.restore();
    text(ctx, 'RADIO', x + 12, y - 2, { size: 10, weight: 700, colour: 'rgba(246,241,226,0.65)', spacing: 2 });
    text(ctx, station.name, x + 62, y - 1, { size: 15, weight: 800, colour: '#ffe1a8', spacing: 1 });
    text(ctx, station.tag, x + 62, y + 10, { size: 10, weight: 600, colour: 'rgba(246,241,226,0.72)' });
    // Signal bars.
    for (let i = 0; i < 4; i++) {
      const bh = 4 + i * 2.6;
      ctx.fillStyle = 'rgba(255,225,168,0.85)';
      ctx.fillRect(x + w - 22 + i * 5, y + 2 - bh, 3, bh);
    }
  }

  drawMission(ctx, game, VW, VH) {
    const mission = game.missions.active;
    if (!mission) {
      const next = game.missions.nextAvailable();
      if (next) {
        text(ctx, `NEXT JOB: ${next.title.toUpperCase()}`, 26, VH - 110, { size: 12, weight: 700, colour: 'rgba(246,241,226,0.72)', spacing: 1.2 });
      }
      return;
    }
    const x = 26;
    const y = VH - 118;
    const w = 300;
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(18,30,38,0.52)');
    g.addColorStop(1, 'rgba(18,30,38,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 8, y - 26, w + 20, 62);
    ctx.restore();
    text(ctx, 'MISSION', x, y - 12, { size: 10, weight: 700, colour: '#ffd45e', spacing: 2.4 });
    text(ctx, mission.title.toUpperCase(), x, y + 8, { size: 19, weight: 800, colour: INK, spacing: 0.6 });
    text(ctx, mission.objective, x, y + 28, { size: 13, weight: 600, colour: 'rgba(246,241,226,0.9)' });
    if (mission.progressText) {
      text(ctx, mission.progressText, x + w - 4, y - 12, { size: 11, weight: 700, align: 'right', colour: 'rgba(246,241,226,0.7)' });
    }
  }

  drawBanner(ctx, VW, VH) {
    if (this.bannerTime <= 0 || !this.banner) return;
    const t = this.bannerTime;
    const appear = Math.min(1, (5 - t) * 2.4);
    const fade = Math.min(1, t * 1.6);
    const alpha = Math.min(appear, fade);
    const y = 132;
    ctx.save();
    ctx.globalAlpha = alpha;
    const w = 520;
    const x = VW / 2 - w / 2;
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, 'rgba(18,30,38,0)');
    g.addColorStop(0.18, 'rgba(18,30,38,0.55)');
    g.addColorStop(0.82, 'rgba(18,30,38,0.55)');
    g.addColorStop(1, 'rgba(18,30,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y - 34, w, 76);
    ctx.fillStyle = 'rgba(255,212,94,0.9)';
    ctx.fillRect(VW / 2 - 120, y - 40, 240, 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    text(ctx, this.banner.title.toUpperCase(), VW / 2, y - 2, { size: 24, weight: 800, align: 'center', colour: '#fff6de', spacing: 4, shadow: 8 });
    text(ctx, this.banner.subtitle, VW / 2, y + 22, { size: 13, weight: 600, align: 'center', colour: 'rgba(246,241,226,0.88)', spacing: 0.6 });
    ctx.restore();
  }

  drawPrompts(ctx, game, VW, VH) {
    if (this.toastTime > 0 && this.toast) {
      const alpha = Math.min(1, this.toastTime * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(18,30,38,0.55)';
      roundRect(ctx, VW / 2 - 150, VH - 168, 300, 30, 4);
      ctx.fill();
      text(ctx, this.toast, VW / 2, VH - 148, { size: 14, weight: 700, align: 'center', colour: '#fff6de' });
      ctx.restore();
    }
    const prompt = game.contextPrompt();
    if (prompt) {
      // Anchored to the left column above the health bar, the way these prompts
      // sit in the games the bounty models: never across the player's car.
      const w = 300;
      const x = 26;
      const y = VH - 150;
      ctx.save();
      ctx.fillStyle = 'rgba(18,30,38,0.58)';
      roundRect(ctx, x, y, w, 32, 4);
      ctx.fill();
      ctx.restore();
      // Key cap.
      ctx.save();
      ctx.fillStyle = '#f6f1e2';
      roundRect(ctx, x + 9, y + 5, 24, 22, 3);
      ctx.fill();
      ctx.restore();
      text(ctx, prompt.key, x + 21, y + 21, { size: 13, weight: 800, align: 'center', colour: '#182a34' });
      text(ctx, prompt.label, x + 42, y + 21, { size: 13, weight: 700, colour: INK });
    }
  }

  drawPause(ctx, VW, VH) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,22,28,0.62)';
    ctx.fillRect(0, 0, VW, VH);
    text(ctx, 'PAUSED', VW / 2, VH / 2 - 10, { size: 44, weight: 800, align: 'center', colour: '#fff6de', spacing: 6, shadow: 10 });
    text(ctx, 'ESC resume  ·  P save  ·  L load', VW / 2, VH / 2 + 28, { size: 15, weight: 600, align: 'center', colour: 'rgba(246,241,226,0.82)', spacing: 1 });
    ctx.restore();
  }

  // ------------------------------------------------------------ title

  drawTitle(game, dt) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const scale = Math.min(W / 1280, H / 720);
    ctx.save();
    ctx.scale(scale, scale);
    const VW = W / scale;
    const VH = H / scale;

    // A warm band across the lower third for the title to sit on, no vignette.
    const g = ctx.createLinearGradient(0, VH * 0.52, 0, VH);
    g.addColorStop(0, 'rgba(14,32,44,0)');
    g.addColorStop(0.45, 'rgba(14,32,44,0.42)');
    g.addColorStop(1, 'rgba(10,24,34,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, VH * 0.52, VW, VH * 0.48);

    // Title lockup: NEON over PALMS, with a sunset rule between.
    const cx = VW / 2;
    const ty = VH * 0.30;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(30,20,10,0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 4;
    ctx.font = `800 96px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
    ctx.fillStyle = '#fff6de';
    ctx.fillText('NEON', cx, ty);
    ctx.fillStyle = '#ffd06a';
    ctx.fillText('PALMS', cx, ty + 88);
    ctx.restore();

    ctx.save();
    const ruleW = 300;
    ctx.fillStyle = 'rgba(255,208,106,0.85)';
    ctx.fillRect(cx - ruleW / 2, ty + 112, ruleW, 2);
    // Little palm silhouettes flanking the rule.
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + s * (ruleW / 2 + 22), ty + 113);
      ctx.strokeStyle = 'rgba(255,240,214,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 4, -10, s * 8, -22);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.9 + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(s * 8, -22);
        ctx.quadraticCurveTo(s * 8 + Math.cos(a) * 9, -26 + Math.sin(a) * 5, s * 8 + Math.cos(a) * 16, -20 + Math.sin(a) * 8);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    text(ctx, 'A SUN-SOAKED CRIME STORY ON THE VERANO COAST', cx, ty + 146, {
      size: 15,
      weight: 700,
      align: 'center',
      colour: 'rgba(255,246,222,0.9)',
      spacing: 3.4,
    });

    // The city's name, then the prompt.
    text(ctx, 'NEON PALMS, FLORIDA  ·  EST. 1987', cx, ty + 176, { size: 12, weight: 600, align: 'center', colour: 'rgba(255,246,222,0.66)', spacing: 2.4 });

    const blink = 0.55 + 0.45 * Math.sin(game.titleClock * 3.4);
    ctx.save();
    ctx.globalAlpha = blink;
    text(ctx, 'PRESS ENTER', cx, VH * 0.76, { size: 26, weight: 800, align: 'center', colour: '#fff6de', spacing: 6, shadow: 10 });
    ctx.restore();

    text(ctx, 'WASD DRIVE  ·  F ENTER/EXIT  ·  CLICK FIRE  ·  R RELOAD  ·  ESC PAUSE', cx, VH * 0.86, {
      size: 12,
      weight: 600,
      align: 'center',
      colour: 'rgba(255,246,222,0.72)',
      spacing: 1.4,
    });

    if (game.save.hasSave()) {
      text(ctx, 'ENTER CONTINUES YOUR SAVE  ·  N STARTS A NEW GAME', cx, VH * 0.91, {
        size: 11,
        weight: 600,
        align: 'center',
        colour: 'rgba(255,246,222,0.55)',
        spacing: 1.2,
      });
    }

    // Corner credits, small.
    text(ctx, 'MARISOL VEGA', 26, VH - 26, { size: 11, weight: 700, colour: 'rgba(255,246,222,0.5)', spacing: 2 });
    text(ctx, 'AN ORIGINAL WORK', VW - 26, VH - 26, { size: 11, weight: 700, align: 'right', colour: 'rgba(255,246,222,0.5)', spacing: 2 });
    ctx.restore();
  }
}
