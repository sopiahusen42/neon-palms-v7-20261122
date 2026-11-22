// The circular minimap: the real street grid drawn from the layout, rotated so
// the player's heading is up, with district tint, kerb lines, blips for police,
// traffic, mission markers and the player arrow, plus a north ticker on the rim.

import { CITY } from './config.js';

const RADIUS_SCALE = 0.115; // world metres per minimap pixel

export function drawMinimap(ctx, game, cx, cy, r) {
  const layout = game.layout;
  const player = game.minimapFocus();
  const heading = game.minimapHeading();

  ctx.save();
  // Disc clip.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Water/sand base, then a soft district wash.
  const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
  bg.addColorStop(0, '#f3e9ce');
  bg.addColorStop(1, '#d8c8a6');
  ctx.fillStyle = bg;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);

  const s = RADIUS_SCALE; // px per metre
  const per = CITY.pitch * s;

  // Blocks: paved rectangles in a clearly darker shade than the roads, so the
  // grid reads at a glance.
  ctx.fillStyle = 'rgba(122,108,86,0.78)';
  for (const b of layout.blocks) {
    const px = (b.cx - player.x) * s;
    const pz = (b.cz - player.z) * s;
    if (Math.abs(px) > r + per || Math.abs(pz) > r + per) continue;
    const half = b.half * s;
    ctx.fillRect(px - half, pz - half, half * 2, half * 2);
  }

  // Roads: draw wide pale strokes along every road line.
  ctx.strokeStyle = '#fffdf2';
  ctx.lineWidth = CITY.roadWidth * s;
  ctx.lineCap = 'butt';
  const reach = r * 2.6;
  for (const road of layout.roads) {
    const off = (road - player.x) * s;
    ctx.beginPath();
    ctx.moveTo(off, -reach);
    ctx.lineTo(off, reach);
    ctx.stroke();
  }
  for (const road of layout.roads) {
    const off = (road - player.z) * s;
    ctx.beginPath();
    ctx.moveTo(-reach, off);
    ctx.lineTo(reach, off);
    ctx.stroke();
  }

  // Centre lines, thin and dark warm.
  ctx.strokeStyle = 'rgba(186,140,44,0.8)';
  ctx.lineWidth = 1.3;
  for (const road of layout.roads) {
    const off = (road - player.x) * s;
    ctx.beginPath();
    ctx.moveTo(off, -reach);
    ctx.lineTo(off, reach);
    ctx.stroke();
  }
  for (const road of layout.roads) {
    const off = (road - player.z) * s;
    ctx.beginPath();
    ctx.moveTo(-reach, off);
    ctx.lineTo(reach, off);
    ctx.stroke();
  }

  // Blips.
  const blip = (wx, wz, colour, size, ring) => {
    const px = (wx - player.x) * s;
    const pz = (wz - player.z) * s;
    if (Math.hypot(px, pz) > r - 3) return;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-heading);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3;
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  };

  // Traffic: faint cream dots.
  for (const car of game.minimapTraffic()) blip(car.x, car.z, 'rgba(255,252,240,0.72)', 1.9, false);
  // Mission marker: a gold diamond.
  const marker = game.missions.activeMarker();
  if (marker) {
    const px = (marker.x - player.x) * s;
    const pz = (marker.z - player.z) * s;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-heading);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fillStyle = '#ffcf4a';
    ctx.shadowColor = 'rgba(120,80,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.strokeStyle = '#fff6de';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
  // Police: red/blue pulsing pips, clipped to the rim when out of range.
  for (const car of game.minimapPolice()) {
    let px = (car.x - player.x) * s;
    let pz = (car.z - player.z) * s;
    const d = Math.hypot(px, pz);
    if (d > r - 6) {
      px = (px / d) * (r - 6);
      pz = (pz / d) * (r - 6);
      blip(player.x + px / s, player.z + pz / s, '#e0413a', 2.6, false);
      continue;
    }
    blip(car.x, car.z, game.policePulse() ? '#4b7dff' : '#e0413a', 3.2, true);
  }

  ctx.restore();
  ctx.restore();

  // Player arrow at the centre, always pointing up.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4.5);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fillStyle = '#f8f3e2';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,48,60,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // Rim: a clean pale ring with a north tick that rotates with the world.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(24,38,48,0.5)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(250,244,228,0.92)';
  ctx.stroke();
  // North tick.
  const na = -heading - Math.PI / 2;
  const nx = cx + Math.cos(na) * (r - 4);
  const ny = cy + Math.sin(na) * (r - 4);
  ctx.save();
  ctx.translate(nx, ny);
  ctx.fillStyle = '#f8f3e2';
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.font = '700 9px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#1c2c38';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', nx, ny + 0.5);
  ctx.restore();
}
