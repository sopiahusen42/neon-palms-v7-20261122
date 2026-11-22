// NEON PALMS — the gta6-01 hand-in program (Node 22, standard library only).
//
// The game is this directory's game/ folder: game/index.html and 24 ES modules plus three.js r180
// vendored under game/vendor/, plain static files a desktop browser loads offline with no network
// request. This program checks the entry against the bounty's caps BEFORE it copies anything, copies
// game/ and screenshots/ to the output directory, writes dossier.json with the vendored
// make.fun library, and prints what it wrote. It exits 0 only when the whole entry is on disk.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output. The scorer runs the same
// buildDossier over what is handed in and requires dossier.json to equal what this writes, so the
// caps below are passed through unchanged from the gate: only text_max_bytes shapes the bytes, the
// rest only refuse an entry the scorer would refuse.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DossierError, buildDossier, readGameTree } from './vendor/makefun-game.ts';
import type { GameFile, GameTree } from './vendor/makefun-game.ts';

/** The gate's caps (reference/gate.json). */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** game/index.html may be at most this many bytes (INDEX_HTML_MAX_BYTES). */
const INDEX_HTML_MAX_BYTES = 1024 * 1024;
/** The platform's cap on /output's entries: game/, screenshots/ and dossier.json all count. */
const OUTPUT_MAX_ENTRIES = 1000;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

/** Refuse the entry with a message naming what is wrong, and no stack trace. */
function refuse(message: string): never {
  console.error(`\nNEON PALMS: refusing to hand in — ${message}\n`);
  process.exit(1);
  // Unreachable: process.exit ends the program. This keeps the return type honest for a type checker.
  throw new Error(message);
}

/** Thousands separated, for the byte totals in the summary. */
function thousands(n: number): string {
  return n.toLocaleString('en-US');
}

/** Bytes as KiB or MiB, whichever reads better. */
function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** A percent of a cap, for the summary's usage figures. */
function usage(used: number, cap: number): string {
  return `${Math.round((used / cap) * 100)}%`;
}

/** Whether bytes open with a PNG or JPEG signature, the only two the dossier accepts. */
function imageKind(bytes: Buffer): 'PNG' | 'JPEG' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  return null;
}

/** Every file and directory under dir, counted the way the platform counts an output tree. */
function countEntries(dir: string): { files: number; dirs: number; bytes: number } {
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs++;
        walk(join(path, entry.name));
      } else {
        files++;
        bytes += statSync(join(path, entry.name)).size;
      }
    }
  };
  walk(dir);
  return { files, dirs, bytes };
}

// ------------------------------------------------------------------ 1. preflight: nothing is copied yet

// game/: read the tree once with the gate's caps. readGameTree refuses a missing game/, more entries
// than game_max_files, more bytes than game_max_bytes and a path longer than game_path_max_bytes; its
// error's `limit` names the cap, so the message can say which one the entry is over.
let tree: GameTree;
try {
  tree = readGameTree(gameDir, {
    game_max_files: CAPS.game_max_files,
    game_max_bytes: CAPS.game_max_bytes,
    game_path_max_bytes: CAPS.game_path_max_bytes,
  });
} catch (err) {
  if (err instanceof DossierError) refuse(`${err.limit ?? 'game/'} cap: ${err.message}`);
  throw err;
}

// index.html: the one file game/ must hold. buildDossier would refuse without it; catch it here so the
// message arrives before anything is copied.
const index: GameFile | undefined = tree.files.find((f) => f.path === 'index.html');
if (index === undefined) refuse('game/index.html is missing: a game is a directory of static files with its page at the root');
if (index.bytes > INDEX_HTML_MAX_BYTES) {
  refuse(`game/index.html is ${thousands(index.bytes)} bytes, over the ${thousands(INDEX_HTML_MAX_BYTES)} a page may be`);
}

// screenshots/: an entry hands in 3 or 4 renders of the game, the first by name the cover. Checked here
// for count, size and signature so a bad render fails by name instead of halfway through a copy.
if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) {
  refuse('screenshots/ is missing: an entry hands in 3 or 4 PNG or JPEG renders of its game, the first by name the cover');
}
const shots = readdirSync(shotsDir, { withFileTypes: true })
  .filter((e) => e.isFile() && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();
if (shots.length === 0) refuse('screenshots/ holds no image: an entry hands in 3 or 4 renders, the first by name the cover');
if (shots.length > CAPS.screenshots.max) {
  refuse(`screenshots.max cap: screenshots/ holds ${shots.length} files, over the ${CAPS.screenshots.max} allowed`);
}
let shotBytes = 0;
for (const name of shots) {
  const path = join(shotsDir, name);
  const size = statSync(path).size;
  if (size > CAPS.screenshots.max_bytes) {
    refuse(`screenshots.max_bytes cap: screenshots/${name} is ${thousands(size)} bytes, over the ${thousands(CAPS.screenshots.max_bytes)} allowed`);
  }
  const kind = imageKind(readFileSync(path));
  if (kind === null) refuse(`screenshots/${name} is neither a PNG nor a JPEG`);
  shotBytes += size;
}

/** game/ split by the dossier's classes, for the summary. */
const byClass = { source: 0, vendored: 0, asset: 0 };
for (const f of tree.files) byClass[f.cls]++;

// The scorer caps /output itself at 1000 entries, files and directories counted alike: game/ counts
// alongside screenshots/ and its images and dossier.json.
const plannedEntries = tree.count + 1 + shots.length + 1;
if (plannedEntries > OUTPUT_MAX_ENTRIES) {
  refuse(`the hand-in would hold ${plannedEntries} entries in /output, over the ${OUTPUT_MAX_ENTRIES} the platform allows`);
}

console.log('NEON PALMS — checked, nothing copied yet');
console.log(`  game/        ${tree.files.length} files, ${tree.directories.length} directories, ${human(tree.totalBytes)}`);
console.log(`               source ${byClass.source}, vendored ${byClass.vendored}, assets ${byClass.asset}`);
console.log(`               ${tree.count}/${CAPS.game_max_files} entries (${usage(tree.count, CAPS.game_max_files)}), ${human(tree.totalBytes)}/${human(CAPS.game_max_bytes)} (${usage(tree.totalBytes, CAPS.game_max_bytes)})`);
console.log(`  screenshots/ ${shots.length}/${CAPS.screenshots.max} images, ${human(shotBytes)}`);

// ------------------------------------------------------------------ 2. copy

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true, force: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true, force: true });

// ------------------------------------------------------------------ 3. dossier

let dossier: Uint8Array;
try {
  dossier = buildDossier(out, CAPS);
} catch (err) {
  if (err instanceof DossierError) refuse(`${err.limit ?? 'dossier'}: ${err.message}`);
  throw err;
}
writeFileSync(join(out, 'dossier.json'), dossier);

// ------------------------------------------------------------------ 4. report

// Read the page count back off the dossier instead of trusting the build: the scorer parses this JSON.
const written = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')) as { text?: string; images?: { name: string }[] };
const images = written.images ?? [];
const entries = countEntries(out);

console.log('\nwritten to ' + out);
console.log(`  game/         ${tree.files.length} files, ${human(tree.totalBytes)}`);
console.log(`  screenshots/  ${images.length} images, ${human(shotBytes)}  (cover ${images[0]?.name ?? 'none'})`);
console.log(`  dossier.json  ${human(dossier.length)}, text ${human(Buffer.byteLength(written.text ?? '', 'utf8'))}/${human(CAPS.text_max_bytes)} (${usage(Buffer.byteLength(written.text ?? '', 'utf8'), CAPS.text_max_bytes)})`);
console.log(`  output        ${entries.files + entries.dirs} entries (${entries.files} files, ${entries.dirs} directories), ${human(entries.bytes)}`);
if (images.length < 3) console.log('  note: the bounty asks for 3 or 4 screenshots');
console.log(`\nNEON PALMS handed in: open ${join(out, 'game', 'index.html')} in a desktop browser, or serve ${join(out, 'game')} and open index.html.`);
