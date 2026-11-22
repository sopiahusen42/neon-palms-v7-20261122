[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sopiahusen42/neon-palms-v7-20261122/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sopiahusen42/neon-palms-v7-20261122/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# NEON PALMS

A 3D third-person open-world crime game for the make.fun "Make GTA 6" bounty
(gta6-01). One city, one car, one pistol, five jobs, and a five-star wanted
ladder. It runs in a desktop browser from static files with no build step, no
package install and no network request: three.js r180 is vendored under
`game/vendor/` and every texture is painted into a canvas at load.

You play Marisol Vega. The game opens on a title screen over a slow orbit of the
Sunset Verge boulevard; press Enter to drop into the driver's seat of a cream
coupe with a coral stripe at 09:40 on a Saturday morning.

## The city

The whole map is generated once from a fixed seed (`0x4e454f4e`, the bytes of
"NEON") and never re-rolled, so every load produces the same streets, the same
buildings and the same palm spacing.

- A 5x5 road grid at -192, -96, 0, 96 and 192 metres on both axes: 20 m of
  asphalt, 6 m of sidewalk, 96 m between parallel centrelines.
- 16 city blocks, each split into four building lots. Ten per cent of lots are
  left as paved forecourts with palms instead of a building; the other 54 hold
  stucco blocks of 3 to 6 storeys, or 7 to 13 in the tower district. Facades are
  a repeating canvas texture (window grid, sills, floor bands) tiled by the
  metre, with cornices, awnings, shopfronts and occasional rooftop crowns.
- 160 palms line the kerbs on an uneven rhythm, drawn as two instanced meshes
  (tapered trunk, merged crown of fronds) so the whole avenue costs four draw
  calls. 80 street lamps, 86 kerbside parking slots, 16 bus stops, 16 billboards,
  10 planters, plus 17 hydrants, 17 benches and 9 bins.
- The sun sits low (about 30 degrees of elevation), ahead and to the left, so
  every trunk and lamp throws a long shadow diagonally across the asphalt. Fog
  shares the sky gradient's horizon colour, so the boulevard dissolves into haze
  instead of ending on a hard edge.

### Districts

Districts are rings: a block's index is `|cx|/96 + |cz|/96` from the centre
junction, and each ring has its own building kind, height mix and palette. The
map is deliberately lopsided in character — the centre is one quiet block and the
corners are the loud ones.

| District         | Blocks | Kind      | What it looks like                                        |
| ---------------- | ------ | --------- | --------------------------------------------------------- |
| Coral Row        | 1      | lowrise   | The single centre block: short stucco walk-ups, the start line |
| Sunset Verge     | 4      | deco      | The four blocks around it: blush and turquoise deco frontage |
| Marisol Heights  | 6      | tower     | The next ring and the corners: over half the lots go to 7-13 storeys |
| Pelican Quay     | 4      | shopfront | Stucco and coral shopfronts with awnings, the quay         |
| Verano Strip     | 1      | mixed     | The far corner block: mixed height, the long escape run    |

The HUD names the district of the nearest block every frame, so the label under
the minimap can step from one ring to the next as you cross the ring boundary.

## Systems

### Driving

`game/src/player.js` models a car as two velocity components rather than a rigid
body: an engine that pushes along the heading and a lateral component that bleeds
off with grip. Throttle accelerates to a 34 m/s ceiling with the pull tapering
off near the top end; holding the opposite direction brakes hard while rolling
forward and reverses below walking pace. Grip decays exponentially, 7.5/s at a
crawl down to 4.9/s at top speed, and drops to 1.6/s on the handbrake, so a
hard corner slides the tail wide before it hooks up. Steering needs speed and
eases in over about a tenth of a second, body roll leans with the wheel, the
front wheels visibly turn, and all four spin with road speed. Buildings are
solid boxes: hitting one pushes the car out along its shallower axis and bleeds
82% of the impact velocity, with a camera shake and a crash sound above 6 m/s
and a crime report above 12 m/s.

### On foot

F exits the car and spawns Marisol beside it. On foot, F climbs back into her own
car if she is within 4.5 m of it, and E steals whatever traffic car or police
cruiser is within 4.2 m — the AI car is retired and replaced with a drivable
copy, and a cruiser theft is worth two stars because they saw you. She walks at
3.4 m/s and runs at 6.4 m/s, moves relative to where the camera is facing, and
turns to face her heading. Her avatar is built from merged boxes with a swinging
left arm and a right arm held out with a drawn pistol. Mouse movement turns the
on-foot camera: yaw is free, pitch is clamped between -0.75 and 0.55 radians.

### Camera

`game/src/camera.js` holds two cameras in one rig. The chase camera trails the
car by 9.6 m and 4.4 m up, springs toward its heading faster the quicker you
drive, pulls back a further 2.6 m and lifts 0.8 m at speed, widens the field of
view from 62 to 70 degrees, leans the frame into the steering, and looks a
little ahead of the nose so the car never runs out of picture. The on-foot
camera sits 3.4 m back and 1.9 m up over Marisol's right shoulder at 66 degrees.
Both shake on impact, the amplitude decaying over about half a second.

### Police pursuit

`game/src/police.js` runs a five-star wanted system. Crimes add stars; the heat
within the current star fills at 0.11/s once you have been out of sight of every
cruiser for five seconds, then drops a star. The number of cruisers on you is
`min(5, 1 + floor(stars * 0.9))`, spawned one every 1.6 s from a road junction
off the edge of your view, with a siren cue. In a car they aim for a point 6 m
behind your tail, ram when the noses are within 4.2 m, and hammer your health.
On foot they drive to within 15 m, stop, put an officer on the far side of the
cruiser, and fire every 0.85 to 1.9 s; each hit costs 11 health and a building
between you and the muzzle blocks the shot. Below three stars, cruisers more
than 260 m behind you despawn.

### Traffic

28 civilian cars follow the grid in the right-hand lane, offset 2.2 m from each
centreline, cruising at 9.5 to 14 m/s. Each picks its next junction from a seeded
stream and, 30 m out, decides to continue or turn; a turn is a 16-segment
quadratic Bezier arc onto the crossing road, with the front wheels steering into
it. They slow into junctions, brake for anything more than 3.2 m ahead in their
lane, and a pairwise separation pass keeps them from overlapping. Hitting one
shoves it, cuts its speed and scrubs yours.

### Pedestrians

74 pedestrians walk the paving in front of the blocks, turning at the corners.
They sidestep the player when she gets within 1.6 m, and they react to the world:
gunfire, a car passing too close, or a body in the road sends everyone within
20 to 30 m running with their arms up and their stride lengthening. A pedestrian
hit by a car above 7 m/s, or by a bullet, drops.

### Combat

The pistol is a "Vega .45" with a 17-round magazine and 84 rounds in reserve.
Each shot is a hitscan ray with a small spread, checked against car capsules,
pedestrian capsules and building boxes, and stopped by the ground plane if it
points down. A shot costs 26 damage, fires every 0.13 s, and R reloads in 1.55 s.
Every shot leaves a tracer from a pool of 14 additive quads, a crossed muzzle
flash, and an impact burst from a pool of 40 sparks. Killing a pedestrian is two
stars; hitting a car or a wall is one; firing and hitting nothing at all is
still one, because this is that kind of city.

### Missions

Five jobs, in order, each with a briefing, three or four lines of dialogue spoken
by the cast as on-screen radio chatter, a marker ring on the road, and a cash
reward.

| Job                  | From     | Kind       | Objective                                          | Reward |
| -------------------- | -------- | ---------- | -------------------------------------------------- | ------ |
| Palm Grease          | Reyes    | deliver    | Steal the white coupe, deliver it to the lockup      | $900   |
| The Ledger Job       | June     | steal      | Take the blue saloon and get clear of the pursuit    | $1,400 |
| Witness at the Quay  | Kilo     | survive    | Stay alive for three minutes of pursuit              | $2,000 |
| Five Stars Over Verano | Reyes  | escape     | Shake a five-star pursuit, then reach the garage     | $3,200 |
| Last Boat Out        | Marisol  | finale     | Reach the east marina and the boat                   | $6,000 |

Markers sit on fixed road junctions. Walk or drive within 9 m and press T to
start the next uncompleted job. A job completes on a world condition — the right
car kind inside the marker radius, the clock running out, the wanted level
falling to zero — and the "MISSION PASSED" banner pays out.

### HUD

The HUD is a second canvas layered over the WebGL one, redrawn every frame at
device pixel ratio and scaled from a 1280x720 layout.

- A 92 px circular minimap top-left, drawn from the real grid and rotated so
  your heading is up, with the district name and the world clock beneath it.
- Five wanted stars top-right, plus a heat bar under them while you are wanted.
- Cash bottom-right in green, rolling toward its target instead of snapping.
- The weapon block: magazine, reserve, a pistol glyph and a reload bar.
- A segmented health bar bottom-left, going from green to red under 40.
- The radio readout along the bottom centre, with the station name, its tag line
  and a four-bar signal meter.
- The mission card bottom-left: title, objective and live progress, or the name
  of the next job when nothing is active.
- Centre-screen banners for the title card and mission results, a toast line for
  short messages, and a context prompt with a key cap for the action available
  right now (exit, steal, start job).
- A red hurt vignette on damage, and a pause overlay.

### Minimap

`game/src/minimap.js` draws at 0.115 px per metre inside a circular clip: paved
blocks in dark stone, roads as wide pale strokes with thin gold centre lines,
cream dots for traffic, a gold diamond for the mission marker, red and blue
pulsing pips for police (pinned to the rim when they are out of range), a white
arrow for the player at the centre, and an "N" tick riding the rim as the map
rotates.

### Radio and audio

Five stations are listed in `game/src/citygen.js` — SUNSET FM 98.4 (coastal
soul), PALM WAVE 101.1 (surf rock and neon synths), QUAY TALK 88.2 (late-night
call-in), VERANO BEAT 95.7 (reggaeton and bass) and KNEON 107.9 (night-drive
electronica). Keys 1 to 5 switch station and the HUD readout follows. Audio is
synthesised in WebAudio rather than loaded: a two-oscillator engine through a
low-pass whose pitch and cutoff track road speed, a band-passed noise loop for
tyres, a wailing siren, a noise-and-thump pistol crack, a crash, and short
square blips for UI. M mutes. Browsers require a gesture, so the audio context is
created on the first keypress.

### Save

Progress goes to `localStorage` under `neon-palms-save-v1` as a versioned JSON
blob: cash, wanted stars, health, ammo, completed missions, radio station and
position. P saves, L loads, and a missing or corrupt save is simply no save.
Enter on the title screen continues an existing save; N starts a new game.

## Controls

| Key                | Action                                                     |
| ------------------ | ---------------------------------------------------------- |
| W A S D / arrows   | Drive; walk on foot (Shift to run)                          |
| Space              | Brake, and handbrake while held                             |
| Mouse              | Look around on foot; move to aim                            |
| Left click         | Fire                                                        |
| R                  | Reload                                                      |
| F                  | Enter or exit the vehicle                                   |
| E                  | Steal the car you are standing next to (or a cruiser)        |
| T                  | Start the job whose marker you are standing in              |
| 1 - 5              | Radio station                                               |
| P / L              | Save / load                                                 |
| M                  | Mute                                                        |
| Esc                | Pause                                                       |

## Run it

Serve `game/` over HTTP — ES modules will not load from a `file://` page — and
open the page in a desktop browser:

    cd game
    python3 -m http.server 8080
    # open http://localhost:8080/index.html

Any static server works; there is no server-side code and nothing is fetched at
runtime. Add `?shot=cover`, `?shot=chase`, `?shot=foot` or `?shot=title` to load
one of the deterministic screenshot stages instead of the interactive game.

To produce the bounty hand-in instead (this copies `game/` and `screenshots/` to
the output directory, checks them against the gate's caps first, and writes
`dossier.json`):

    mkdir -p out
    MAKEFUN_OUTPUT_DIR=out node main.ts

`main.ts` needs Node 22 and nothing else — no npm install, no build. It reads
`game/` with the vendored `make.fun` library, refuses the entry with a message
naming any cap it would breach (game file count and byte total, path length,
screenshot count and size, output entry count), and only then copies. Outside
the grader's container `MAKEFUN_OUTPUT_DIR` stands in for `/output`; it defaults
to `/output`.

## Repository layout

    main.ts                  hand-in program: preflight, copy, dossier, summary
    vendor/makefun-game.ts   make.fun's dossier library, vendored unchanged
    game/index.html          the page: WebGL canvas, HUD canvas, boot overlay
    game/src/main.js         boot, fixed-step loop (1/60), input, mode switching
    game/src/config.js       city dimensions, sun, fog, player and camera tuning
    game/src/rng.js          seeded mulberry32; nothing calls Math.random
    game/src/citygen.js      districts, block/lot layout, palms, furniture, radio
    game/src/textures.js     every surface, painted to canvas at load
    game/src/roads.js        asphalt, kerbs, crosswalks, lane paint, ground height
    game/src/buildings.js    massing, facades, cornices, awnings, shopfronts
    game/src/palms.js        instanced palms, lamps and street furniture
    game/src/vehicles.js     coupe, saloon and cruiser bodies, wheels, light bar
    game/src/player.js       drivable car physics and Marisol's avatar
    game/src/camera.js       chase camera, on-foot camera, shake
    game/src/traffic.js      lane following, junction turns, separation
    game/src/pedestrians.js  sidewalk walkers, fear, panic
    game/src/police.js       wanted system, cruiser pursuit, crew fire
    game/src/combat.js       pistol, hitscan rays, tracers, sparks
    game/src/missions.js     five jobs, dialogue, markers, rewards
    game/src/hud.js          the 2D overlay, panels, title screen
    game/src/minimap.js      the rotating circular map
    game/src/audio.js        synthesised engine, tyres, siren, gunfire, blips
    game/src/save.js         versioned localStorage save
    game/src/shots.js        the four deterministic screenshot stages
    game/src/sky.js          gradient sky, sun disc, fog, shadow-following light
    game/src/util.js         maths, geometry merging, tiled quads
    game/vendor/             three.js r180 (module + core), vendored, untouched
    screenshots/             the four hand-in renders
    shoot.cjs                headless capture that produced screenshots/
    measure.cjs              exposure check on the cover render
    LICENSE                  MIT

23 ES modules under `game/src/`, loaded from the page's single
`<script type="module">`, plus the two vendored three.js files under `game/vendor/`.

## How the screenshots are produced

The screenshots are not posed by hand: they are frames of the game rendered by
the game. `game/src/shots.js` exposes four named stages — `cover`, `chase`,
`foot` and `title`. Loading `index.html?shot=<name>` builds the world, then the
stage places the car, the cruisers, the pedestrians and the camera at fixed
coordinates, runs the simulation forward by a fixed number of steps at a fixed
1/60 s timestep with a scripted input, renders six frames to flush texture and
shadow-map uploads, draws the HUD with `dt = 0` so no timer moves, and only then
sets `document.title = 'SHOT_READY'`. There is no wall-clock time and no
`Math.random` on those paths — every decision comes from a seeded stream — so a
URL always produces the same pixels.

`shoot.cjs` is the harness: it serves `game/` from a throwaway static server,
opens each `?shot=` URL in headless Chrome at 1280x720 with software WebGL, waits
for `SHOT_READY`, waits two animation frames for the compositor, and writes a
JPEG at quality 82 into `screenshots/`. `measure.cjs` then decodes the cover and
reports overall, road-band and sky exposure so a dark frame cannot slip through.

The four images:

- `01-cover.jpg` — the cover: the coupe at speed on the main boulevard, three
  stars, two cruisers with their bars lit, traffic ahead.
- `02-chase.jpg` — five stars, three cruisers flanking the car on the Verano
  boulevard.
- `03-foot.jpg` — Marisol out on the road on foot, two dismounted officers with
  pistols up, pedestrians scattering up the sidewalk.
- `04-title.jpg` — the title stage: the parked coupe under the palms with the
  camera orbiting above the boulevard.

## License

MIT — see [LICENSE](LICENSE).

Made for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).
