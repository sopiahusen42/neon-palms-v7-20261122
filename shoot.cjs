#!/usr/bin/env node
// Captures the four hand-in screenshots from the game as it really renders.
// Serves game/ from a tiny static server, opens each ?shot= URL in headless
// Chrome at 1280x720, waits for document.title === 'SHOT_READY', and writes a
// JPEG under screenshots/. Also prints the exposure measurements the entry is
// judged on, so a dark frame cannot slip through.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('/home/administrator/.local/tools/shotter/node_modules/puppeteer');

const ROOT = path.join(__dirname, 'game');
const OUT = path.join(__dirname, 'screenshots');
const SHOTS = [
  { name: 'cover', file: '01-cover.jpg' },
  { name: 'chase', file: '02-chase.jpg' },
  { name: 'foot', file: '03-foot.jpg' },
  { name: 'title', file: '04-title.jpg' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let file = path.join(ROOT, decodeURIComponent(url.pathname));
      if (url.pathname === '/' || url.pathname === '') file = path.join(ROOT, 'index.html');
      // Keep the server inside game/.
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-lcd-text',
    ],
  });

  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(`${base}?shot=${shot.name}`, { waitUntil: 'load', timeout: 60000 });
      try {
        await page.waitForFunction(() => document.title === 'SHOT_READY', { timeout: 120000, polling: 120 });
      } catch (e) {
        const title = await page.title();
        console.error(`[${shot.name}] never became ready; title="${title}"`);
        if (errors.length) console.error(errors.slice(0, 12).join('\n'));
        throw e;
      }
      // Two raf ticks so the compositor has the final canvases.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
      fs.writeFileSync(path.join(OUT, shot.file), buf);
      console.log(`${shot.file}  ${(buf.length / 1024).toFixed(1)} KiB`);
      if (errors.length) console.log(`  page errors: ${errors.slice(0, 5).join(' | ')}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
