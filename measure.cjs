#!/usr/bin/env node
// Measures the cover render: overall exposure, the road band, and the sky, so a
// dark frame cannot be handed in. Run after shoot.cjs.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'screenshots');

/** Minimal baseline JPEG decoder is not worth writing: use the browser-free
 * PNG route instead. We ask shoot.cjs for a PNG copy alongside the JPEG. */
async function decodeJpegViaPuppeteer(file) {
  const puppeteer = require('/home/administrator/.local/tools/shotter/node_modules/puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const b64 = fs.readFileSync(file).toString('base64');
    const data = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      return { w: c.width, h: c.height, data: Array.from(data) };
    }, b64);
    return data;
  } finally {
    await browser.close();
  }
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function main() {
  const target = process.argv[2] ?? path.join(ROOT, '01-cover.jpg');
  const { w, h, data } = await decodeJpegViaPuppeteer(target);

  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += luminance(data[i], data[i + 1], data[i + 2]);
    count++;
  }
  const mean = sum / count;

  // Road band: the lower-middle of the frame, avoiding the HUD corners.
  const bx0 = Math.round(w * 0.22);
  const bx1 = Math.round(w * 0.78);
  const by0 = Math.round(h * 0.62);
  const by1 = Math.round(h * 0.86);
  let roadSum = 0;
  let roadCount = 0;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = (y * w + x) * 4;
      roadSum += luminance(data[i], data[i + 1], data[i + 2]);
      roadCount++;
    }
  }
  const road = roadSum / roadCount;

  // Sky sample: top centre, a small patch.
  let skyR = 0;
  let skyG = 0;
  let skyB = 0;
  let skyN = 0;
  for (let y = Math.round(h * 0.04); y < Math.round(h * 0.10); y++) {
    for (let x = Math.round(w * 0.42); x < Math.round(w * 0.58); x++) {
      const i = (y * w + x) * 4;
      skyR += data[i];
      skyG += data[i + 1];
      skyB += data[i + 2];
      skyN++;
    }
  }
  skyR /= skyN;
  skyG /= skyN;
  skyB /= skyN;

  const fmt = (n) => n.toFixed(1);
  console.log(`file            ${path.basename(target)}`);
  console.log(`size            ${w} x ${h}`);
  console.log(`mean luminance  ${fmt(mean)}   (target 90-150)`);
  console.log(`road luminance  ${fmt(road)}   (target 60-110)`);
  console.log(`sky rgb         ${fmt(skyR)}, ${fmt(skyG)}, ${fmt(skyB)}   (blue > red required)`);
  console.log(`sky is blue     ${skyB > skyR ? 'yes' : 'NO'}`);
  const ok = mean >= 90 && mean <= 150 && road >= 60 && road <= 110 && skyB > skyR;
  console.log(`verdict         ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
