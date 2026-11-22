// Every surface in the game is painted at load time into an offscreen canvas and
// uploaded as a texture: asphalt with painted lane markings, pale sidewalk
// paving, stucco facades with window grids, awnings and shop fronts. Nothing is
// fetched, so the page runs offline from game/ alone.

import * as THREE from '../../vendor/three.module.min.js';
import { Rng } from './rng.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas, { repeat = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Fine grain over the whole canvas, so no surface is mathematically flat. */
function speckle(ctx, w, h, rng, strength = 16, count = 9000) {
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const v = rng.int(-strength, strength);
    ctx.fillStyle = v >= 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    ctx.fillRect(x, y, rng.float(1, 2.6), rng.float(1, 2.6));
  }
}

/**
 * One 20 m x 20 m section of boulevard: mid-grey asphalt, a double-yellow
 * centreline, dashed white lane dividers, solid white edge lines and faint
 * tyre polish in each lane. Tiled along every road.
 */
export function roadTexture() {
  const w = 1024;
  const h = 1024;
  const px = w / 20; // pixels per metre
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = new Rng(11);

  ctx.fillStyle = '#8f9195';
  ctx.fillRect(0, 0, w, h);

  // Broad tonal patches, as if resurfaced in strips.
  for (let i = 0; i < 42; i++) {
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const rw = rng.float(80, 380);
    const rh = rng.float(60, 300);
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? '222,218,208' : '104,106,110'},${rng.float(0.03, 0.09)})`;
    ctx.fillRect(x, y, rw, rh);
  }

  // Tyre-polish bands down each lane.
  for (const lane of [-6, -2.2, 2.2, 6]) {
    const cx = w / 2 + lane * px;
    const g = ctx.createLinearGradient(cx - 1.8 * px, 0, cx + 1.8 * px, 0);
    g.addColorStop(0, 'rgba(84,86,90,0)');
    g.addColorStop(0.5, 'rgba(84,86,90,0.13)');
    g.addColorStop(1, 'rgba(84,86,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 1.8 * px, 0, 3.6 * px, h);
  }

  speckle(ctx, w, h, rng, 18, 16000);

  const paint = (colour, alpha = 1) => {
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
  };
  // Double yellow centreline.
  paint('#e8c451');
  ctx.fillRect(w / 2 - 0.42 * px, 0, 0.2 * px, h);
  ctx.fillRect(w / 2 + 0.22 * px, 0, 0.2 * px, h);

  // Dashed white lane dividers: one 4 m dash in each 20 m tile, per side.
  paint('#f4f2ea');
  for (const side of [-1, 1]) {
    const x = w / 2 + side * 4 * px;
    ctx.fillRect(x - 0.09 * px, 0.1 * h, 0.18 * px, 0.22 * h);
  }
  // Solid edge lines just inside the kerb.
  for (const side of [-1, 1]) {
    const x = w / 2 + side * 9.35 * px;
    ctx.fillRect(x - 0.08 * px, 0, 0.16 * px, h);
  }
  // Sparse tar seams.
  ctx.globalAlpha = 0.35;
  paint('#6f7175');
  for (let i = 0; i < 4; i++) ctx.fillRect(0, rng.float(0, h), w, rng.float(1, 2));
  ctx.globalAlpha = 1;
  // Paint wear: chip a few pixels out of the markings.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = 'rgba(143,145,149,0.5)';
    ctx.fillRect(rng.float(0, w), rng.float(0, h), rng.float(1, 3), rng.float(1, 3));
  }
  return finish(c);
}

/** Pale concrete paving with joints, for the raised sidewalks. */
export function sidewalkTexture() {
  const w = 512;
  const h = 512;
  const px = w / 12; // 12 m tile
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = new Rng(23);
  ctx.fillStyle = '#bcb6a6';
  ctx.fillRect(0, 0, w, h);
  // Two tones of paving slab.
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const shade = rng.int(-9, 9);
      ctx.fillStyle = `rgb(${188 + shade},${182 + shade},${166 + shade})`;
      ctx.fillRect(x * (w / 6) + 1, y * (h / 6) + 1, w / 6 - 2, h / 6 - 2);
    }
  }
  ctx.strokeStyle = 'rgba(120,114,102,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * (w / 6), 0);
    ctx.lineTo(i * (w / 6), h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * (h / 6));
    ctx.lineTo(w, i * (h / 6));
    ctx.stroke();
  }
  speckle(ctx, w, h, rng, 14, 7000);
  // Curb-side staining.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(120,110,92,0.10)');
  g.addColorStop(1, 'rgba(120,110,92,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return finish(c);
}

/** A pale deco-stucco facade: window grid, sills, a floor band and a cornice. */
export function facadeTexture(baseColour, seed, style = 0) {
  const w = 512;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  const base = new THREE.Color(baseColour);
  const css = (col, alpha = 1) => {
    const r = Math.round(col.r * 255);
    const g = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);
    return `rgba(${r},${g},${b},${alpha})`;
  };
  const shade = (k) => {
    const col = base.clone();
    col.offsetHSL(0, 0, k);
    return col;
  };

  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, w, h);

  // Stucco grain and vertical weather streaks.
  speckle(ctx, w, h, rng, 10, 5000);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = css(shade(-0.05), rng.float(0.03, 0.12));
    ctx.fillRect(rng.float(0, w), rng.float(0, h), rng.float(3, 12), rng.float(30, 160));
  }

  // The texture holds 4 floors x 2 bays: 8 m wide, 16 m tall.
  const bayW = w / 2;
  const floorH = h / 4;
  const glassTop = new THREE.Color(0x2d4a5c);
  const glassBottom = new THREE.Color(0x9fc6d4);

  for (let f = 0; f < 4; f++) {
    const yTop = f * floorH;
    // Floor band / slab line under each row of windows.
    ctx.fillStyle = css(shade(0.06), 0.85);
    ctx.fillRect(0, yTop + floorH - 7, w, 7);
    for (let b = 0; b < 2; b++) {
      const x0 = b * bayW;
      const winW = bayW * (style === 1 ? 0.56 : 0.46);
      const winH = floorH * (style === 2 ? 0.62 : 0.52);
      const wx = x0 + (bayW - winW) / 2;
      const wy = yTop + floorH * 0.2;
      // Reveal / shadow around the opening.
      ctx.fillStyle = css(shade(-0.12), 0.9);
      ctx.fillRect(wx - 6, wy - 6, winW + 12, winH + 12);
      // Glass: vertical gradient, sky above, interior below.
      const g = ctx.createLinearGradient(0, wy, 0, wy + winH);
      g.addColorStop(0, css(glassBottom));
      g.addColorStop(0.55, css(new THREE.Color(0x5e8598)));
      g.addColorStop(1, css(glassTop));
      ctx.fillStyle = g;
      ctx.fillRect(wx, wy, winW, winH);
      // Reflection slash.
      ctx.fillStyle = 'rgba(240,250,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(wx, wy + winH);
      ctx.lineTo(wx + winW * 0.55, wy);
      ctx.lineTo(wx + winW * 0.78, wy);
      ctx.lineTo(wx + winW * 0.2, wy + winH);
      ctx.closePath();
      ctx.fill();
      // Muntin.
      ctx.fillStyle = css(shade(0.1), 0.95);
      if (style === 2) {
        ctx.fillRect(wx + winW / 2 - 2, wy, 4, winH);
        ctx.fillRect(wx, wy + winH * 0.45, winW, 3);
      } else {
        ctx.fillRect(wx + winW / 2 - 2, wy, 4, winH * 0.55);
      }
      // Sill.
      ctx.fillStyle = css(shade(0.12));
      ctx.fillRect(wx - 8, wy + winH + 2, winW + 16, 8);
      // Sunlit lintel.
      ctx.fillStyle = css(shade(0.16), 0.7);
      ctx.fillRect(wx - 8, wy - 10, winW + 16, 5);
      // Occasional balcony rail.
      if (style === 1 && f > 0 && b === 0) {
        ctx.strokeStyle = css(shade(-0.2), 0.8);
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const rx = wx - 4 + (i * (winW + 8)) / 8;
          ctx.beginPath();
          ctx.moveTo(rx, wy + winH + 8);
          ctx.lineTo(rx, wy + winH + 22);
          ctx.stroke();
        }
      }
    }
  }
  return finish(c);
}

/** Ground-floor shopfront strip: glazing, an awning shadow line, door frames. */
export function shopfrontTexture(baseColour, seed) {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = new Rng(seed);
  const base = new THREE.Color(baseColour);
  ctx.fillStyle = `rgb(${base.r * 255 | 0},${base.g * 255 | 0},${base.b * 255 | 0})`;
  ctx.fillRect(0, 0, w, h);
  // Dark glazing band.
  ctx.fillStyle = 'rgba(38,60,70,0.92)';
  ctx.fillRect(0, 34, w, h - 70);
  // Mullions.
  ctx.fillStyle = 'rgba(240,238,228,0.9)';
  for (let i = 0; i <= 4; i++) ctx.fillRect((i * w) / 4 - 3, 34, 6, h - 70);
  // Interior glow and shapes behind the glass.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(255,236,196,${rng.float(0.08, 0.3)})`;
    ctx.fillRect(rng.float(0, w), rng.float(40, h - 40), rng.float(10, 60), rng.float(8, 40));
  }
  // Reflection streak.
  ctx.fillStyle = 'rgba(220,244,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.45, 34);
  ctx.lineTo(w * 0.6, 34);
  ctx.lineTo(w * 0.15, h);
  ctx.closePath();
  ctx.fill();
  // Base plinth.
  ctx.fillStyle = 'rgba(90,84,74,0.9)';
  ctx.fillRect(0, h - 22, w, 22);
  speckle(ctx, w, h, rng, 12, 1800);
  return finish(c);
}

/** The trilobed deco crown painted on some rooftops, used as a small decal plane. */
export function awningTexture(colourA, colourB) {
  const w = 256;
  const h = 64;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const a = new THREE.Color(colourA);
  const b = new THREE.Color(colourB);
  for (let i = 0; i < 8; i++) {
    const col = i % 2 === 0 ? a : b;
    ctx.fillStyle = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`;
    ctx.fillRect((i * w) / 8, 0, w / 8, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, h - 10, w, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, w, 4);
  return finish(c);
}

/** A soft radial glow for the sun billboard, drawn once as an alpha texture. */
export function glowTexture() {
  const s = 256;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,252,235,1)');
  g.addColorStop(0.16, 'rgba(255,246,205,0.92)');
  g.addColorStop(0.42, 'rgba(255,226,164,0.34)');
  g.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft elliptical black blob with a dense core, for contact shadows. */
export function shadowBlobTexture() {
  const s = 128;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Distant coastline haze band, a soft horizontal gradient, used on a backdrop ring. */
export function hazeTexture() {
  const w = 16;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(223,230,223,0)');
  g.addColorStop(0.55, 'rgba(240,232,208,0.35)');
  g.addColorStop(1, 'rgba(250,238,212,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
