// "The Keyhole in the Sky" — ai-excited-01 entry.
//
// A tiny lone robot stands on a dark ridge and looks up at a colossal stone
// door floating in a teal dusk sky. The door's keyhole has cracked open, and
// a torrent of amber light pours out of it diagonally down onto the figure.
// One bold moment: impossible scale, one diagonal of light, one small
// watcher. Drawn entirely in code — no image assets, no randomness, no
// clock, no network — so every run writes the same bytes.
//
// Node 22, standard library only. Run it with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- canvas --

const W = 1024;
const H = 1024;
const img = new Uint8ClampedArray(W * H * 3);

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Seeded generator (mulberry32). Deterministic by construction; the image
// never changes between runs.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// Blend one pixel toward a colour (alpha 0..1).
function px(x: number, y: number, r: number, g: number, b: number, a = 1): void {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = (iy * W + ix) * 3;
  if (a >= 1) {
    img[i] = r;
    img[i + 1] = g;
    img[i + 2] = b;
  } else {
    img[i] = img[i] + (r - img[i]) * a;
    img[i + 1] = img[i + 1] + (g - img[i + 1]) * a;
    img[i + 2] = img[i + 2] + (b - img[i + 2]) * a;
  }
}

// Add light to one pixel (additive glow), clamped.
function addPx(x: number, y: number, r: number, g: number, b: number, a = 1): void {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = (iy * W + ix) * 3;
  img[i] = clamp(img[i] + r * a, 0, 255);
  img[i + 1] = clamp(img[i + 1] + g * a, 0, 255);
  img[i + 2] = clamp(img[i + 2] + b * a, 0, 255);
}

// ---------------------------------------------------------------- shapes --

type RGB = [number, number, number];

// Filled disc with a half-pixel soft edge.
function disc(
  cx: number,
  cy: number,
  rad: number,
  c: RGB,
  a = 1,
  additive = false,
): void {
  const x0 = Math.max(0, Math.floor(cx - rad - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + 1));
  const y0 = Math.max(0, Math.floor(cy - rad - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const edge = clamp(rad + 0.5 - d, 0, 1) * a;
      if (edge <= 0) continue;
      if (additive) addPx(x, y, c[0], c[1], c[2], edge);
      else px(x, y, c[0], c[1], c[2], edge);
    }
  }
}

// Additive radial glow: colour fades with the square of the distance.
function glow(cx: number, cy: number, rad: number, c: RGB, strength = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad;
      if (d >= 1) continue;
      const fall = (1 - d) * (1 - d);
      addPx(x, y, c[0], c[1], c[2], fall * strength);
    }
  }
}

// Even-odd scanline fill for any polygon.
function fillPoly(pts: [number, number][], c: RGB, a = 1, additive = false): void {
  let minX = W;
  let maxX = -1;
  let minY = H;
  let maxY = -1;
  for (const [x, y] of pts) {
    minX = Math.min(minX, Math.floor(x));
    maxX = Math.max(maxX, Math.ceil(x));
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  minX = clamp(minX, 0, W - 1);
  maxX = clamp(maxX, 0, W - 1);
  minY = clamp(minY, 0, H - 1);
  maxY = clamp(maxY, 0, H - 1);
  const n = pts.length;
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
        xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(minX, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(maxX, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        if (additive) addPx(x, y, c[0], c[1], c[2], a);
        else px(x, y, c[0], c[1], c[2], a);
      }
    }
  }
}

// Thick line with soft round caps, from the point-to-segment distance.
function thickLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  c: RGB,
  a = 1,
  additive = false,
): void {
  const pad = w / 2 + 1;
  const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
  const bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + pad));
  const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + pad));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
      t = clamp(t, 0, 1);
      const d = Math.hypot(cx - (x0 + dx * t), cy - (y0 + dy * t));
      const edge = clamp(w / 2 + 0.5 - d, 0, 1) * a;
      if (edge <= 0) continue;
      if (additive) addPx(x, y, c[0], c[1], c[2], edge);
      else px(x, y, c[0], c[1], c[2], edge);
    }
  }
}

// Axis-aligned rectangle with softly rounded corners, filled.
function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: RGB,
  a = 1,
): void {
  fillPoly(
    [
      [x + r, y],
      [x + w - r, y],
      [x + w, y + r],
      [x + w, y + h - r],
      [x + w - r, y + h],
      [x + r, y + h],
      [x, y + h - r],
      [x, y + r],
    ],
    c,
    a,
  );
  disc(x + r, y + r, r, c, a);
  disc(x + w - r, y + r, r, c, a);
  disc(x + r, y + h - r, r, c, a);
  disc(x + w - r, y + h - r, r, c, a);
}

// Four-point sparkle: a bright core with thin cross rays.
function sparkle(cx: number, cy: number, len: number, c: RGB, a = 1): void {
  thickLine(cx - len, cy, cx + len, cy, 1.6, c, a * 0.9, true);
  thickLine(cx, cy - len, cx, cy + len, 1.6, c, a * 0.9, true);
  disc(cx, cy, 2.4, c, a, true);
}

// Rotate a point around a centre.
function rot(x: number, y: number, cx: number, cy: number, ang: number): [number, number] {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

// ---------------------------------------------------------------- scene ---

// Palette: deep teal night against one hot amber light.
const SKY_TOP: RGB = [3, 22, 29];
const SKY_MID: RGB = [7, 48, 60];
const SKY_LOW: RGB = [10, 69, 80];
const AMBER_CORE: RGB = [255, 243, 196];
const AMBER: RGB = [255, 196, 77];
const AMBER_DEEP: RGB = [255, 138, 42];
const STONE: RGB = [27, 47, 56];
const STONE_LT: RGB = [44, 71, 83];
const STONE_DK: RGB = [13, 26, 32];
const RIDGE: RGB = [5, 15, 20];

// 1. Sky: vertical gradient, teal deepening upward, with a faint warm
//    wash low on the right where the light will fall.
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const top = t < 0.55 ? lerp(0, 1, t / 0.55) : 1;
  const low = t < 0.55 ? 0 : lerp(0, 1, (t - 0.55) / 0.45);
  const r = lerp(lerp(SKY_TOP[0], SKY_MID[0], top), SKY_LOW[0], low);
  const g = lerp(lerp(SKY_TOP[1], SKY_MID[1], top), SKY_LOW[1], low);
  const b = lerp(lerp(SKY_TOP[2], SKY_MID[2], top), SKY_LOW[2], low);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    img[i] = r;
    img[i + 1] = g;
    img[i + 2] = b;
  }
}

// 2. Stars: small, brighter toward the top, a few with a sparkle cross.
for (let s = 0; s < 170; s++) {
  const x = rand() * W;
  const y = Math.pow(rand(), 1.6) * 560;
  const bright = 120 + rand() * 135;
  const size = rand() < 0.12 ? 1.8 : 1.1;
  disc(x, y, size, [bright, bright, bright * 0.95], 0.55 + rand() * 0.45);
  if (rand() < 0.1) sparkle(x, y, 5 + rand() * 4, [255, 255, 240], 0.5);
}

// 3. Wind streaks: long thin diagonal clouds, the sky itself in motion.
for (let s = 0; s < 9; s++) {
  const y = 60 + rand() * 420;
  const x = rand() * W - 200;
  const len = 220 + rand() * 320;
  const wdt = 5 + rand() * 9;
  const ang = -0.16 - rand() * 0.1;
  const c: RGB = [120 + rand() * 40, 170 + rand() * 30, 185];
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  thickLine(x, y, x2, y2, wdt, c, 0.05 + rand() * 0.05);
}

// 4. The colossal door: a huge stone slab floating in the sky, tilted a
//    little so its top leans into the light. Its corners, rotated -11°
//    around its centre, make the whole composition diagonal.
const DCX = 625;
const DCY = 335;
const DANG = -0.19;
const DW = 540;
const DH = 620;
const door: [number, number][] = [
  rot(DCX - DW / 2, DCY - DH / 2, DCX, DCY, DANG),
  rot(DCX + DW / 2, DCY - DH / 2, DCX, DCY, DANG),
  rot(DCX + DW / 2, DCY + DH / 2, DCX, DCY, DANG),
  rot(DCX - DW / 2, DCY + DH / 2, DCX, DCY, DANG),
];
fillPoly(door, STONE);
// A darker inner face, so the slab reads as thick carved stone.
const inset = 26;
const inner: [number, number][] = [
  rot(DCX - DW / 2 + inset, DCY - DH / 2 + inset, DCX, DCY, DANG),
  rot(DCX + DW / 2 - inset, DCY - DH / 2 + inset, DCX, DCY, DANG),
  rot(DCX + DW / 2 - inset, DCY + DH / 2 - inset, DCX, DCY, DANG),
  rot(DCX - DW / 2 + inset, DCY + DH / 2 - inset, DCX, DCY, DANG),
];
fillPoly(inner, STONE_DK);
// Sunlit top edge and shadowed bottom edge: one light direction, one read.
thickLine(door[0][0], door[0][1], door[1][0], door[1][1], 5, STONE_LT, 0.9);
thickLine(door[1][0], door[1][1], door[2][0], door[2][1], 4, STONE_LT, 0.45);
thickLine(door[2][0], door[2][1], door[3][0], door[3][1], 6, [4, 10, 13], 0.8);
// Carved panel seams across the slab.
for (let k = 1; k <= 3; k++) {
  const t = k / 4;
  const ax = lerp(door[0][0], door[3][0], t);
  const ay = lerp(door[0][1], door[3][1], t);
  const bx = lerp(door[1][0], door[2][0], t);
  const by = lerp(door[1][1], door[2][1], t);
  thickLine(ax, ay, bx, by, 3, STONE_DK, 0.7);
}
// A ring of carved stone around where the keyhole will sit.
const KEYX = 625;
const KEYY = 315;
disc(KEYX, KEYY, 92, STONE_LT, 0.85);
disc(KEYX, KEYY, 80, STONE, 1);
disc(KEYX, KEYY, 80, STONE_DK, 0.35);

// 5. Cracks: jagged amber-lit fractures racing out of the keyhole across
//    the stone, the moment the door gives way.
function crack(x0: number, y0: number, ang: number, len: number, segs: number): void {
  let x = x0;
  let y = y0;
  let a = ang;
  const step = len / segs;
  for (let s = 0; s < segs; s++) {
    const nx = x + Math.cos(a) * step;
    const ny = y + Math.sin(a) * step;
    thickLine(x, y, nx, ny, 2.2, AMBER_DEEP, 0.85, true);
    thickLine(x, y, nx, ny, 1, AMBER_CORE, 0.9, true);
    x = nx;
    y = ny;
    a += (rand() - 0.5) * 0.9;
  }
}
for (let k = 0; k < 7; k++) {
  crack(KEYX, KEYY, (k / 7) * Math.PI * 2 + 0.3, 130 + rand() * 150, 6);
}

// 6. The keyhole itself: a glowing circle over a tapering slot, white-hot
//    at the centre, ringed by a wide halo.
glow(KEYX, KEYY, 260, AMBER, 0.55);
glow(KEYX, KEYY, 150, AMBER_DEEP, 0.7);
fillPoly(
  [
    [KEYX - 26, KEYY + 30],
    [KEYX + 26, KEYY + 30],
    [KEYX + 46, KEYY + 128],
    [KEYX - 46, KEYY + 128],
  ],
  AMBER,
);
disc(KEYX, KEYY, 54, AMBER);
disc(KEYX, KEYY, 40, AMBER_CORE);
disc(KEYX, KEYY, 22, [255, 252, 235]);
// Light rays fanning out of the keyhole.
for (let k = 0; k < 10; k++) {
  const a = -Math.PI / 2 + ((k - 4.5) / 4.5) * 1.05;
  const len = 200 + rand() * 130;
  const x2 = KEYX + Math.cos(a) * len;
  const y2 = KEYY + Math.sin(a) * len;
  thickLine(KEYX, KEYY, x2, y2, 2.5, AMBER, 0.16, true);
}
sparkle(KEYX, KEYY, 26, [255, 250, 225], 0.9);

// 7. The beam: three nested wedges of light falling diagonally from the
//    keyhole down to the little figure — the picture's one line of motion.
const BEAM_TO: [number, number] = [330, 812];
fillPoly(
  [
    [KEYX - 52, KEYY + 96],
    [KEYX + 52, KEYY + 96],
    [BEAM_TO[0] + 92, BEAM_TO[1]],
    [BEAM_TO[0] - 92, BEAM_TO[1]],
  ],
  AMBER,
  0.1,
  true,
);
fillPoly(
  [
    [KEYX - 34, KEYY + 96],
    [KEYX + 34, KEYY + 96],
    [BEAM_TO[0] + 58, BEAM_TO[1]],
    [BEAM_TO[0] - 58, BEAM_TO[1]],
  ],
  AMBER,
  0.16,
  true,
);
fillPoly(
  [
    [KEYX - 16, KEYY + 96],
    [KEYX + 16, KEYY + 96],
    [BEAM_TO[0] + 26, BEAM_TO[1]],
    [BEAM_TO[0] - 26, BEAM_TO[1]],
  ],
  AMBER_CORE,
  0.22,
  true,
);

// 8. Light motes streaming down the beam, and embers rising where it lands.
for (let m = 0; m < 130; m++) {
  const t = rand();
  const cx = lerp(KEYX, BEAM_TO[0], t) + (rand() - 0.5) * (40 + t * 150);
  const cy = lerp(KEYY + 100, BEAM_TO[1], t) + (rand() - 0.5) * 30;
  const size = 1 + rand() * 2.4;
  const hot = rand() < 0.25;
  disc(cx, cy, size, hot ? AMBER_CORE : AMBER, 0.35 + rand() * 0.55, true);
  if (hot) sparkle(cx, cy, 4 + rand() * 3, AMBER_CORE, 0.5);
}
for (let m = 0; m < 26; m++) {
  const cx = BEAM_TO[0] + (rand() - 0.5) * 150;
  const cy = BEAM_TO[1] - rand() * 120;
  disc(cx, cy, 1 + rand() * 1.8, AMBER_DEEP, 0.5 + rand() * 0.4, true);
}

// 9. Distant mountain ridge, dark teal, behind the foreground.
const ridgePts: [number, number][] = [[-10, 760]];
let rx = -10;
while (rx < W + 10) {
  const step = 60 + rand() * 90;
  rx += step;
  ridgePts.push([rx, 700 + rand() * 70]);
}
ridgePts.push([W + 10, 760], [W + 10, H], [-10, H]);
fillPoly(ridgePts, [7, 26, 34]);

// 10. Foreground ridge: black rock the figure stands on. Its top edge is
//     a fixed jagged diagonal with one clear peak — the beam's foot and the
//     figure's footing, so the robot stands on solid ground, not mid-air.
const fgPts: [number, number][] = [
  [-10, 908],
  [110, 876],
  [215, 844],
  [330, 812],
  [455, 852],
  [580, 828],
  [715, 862],
  [850, 836],
  [960, 864],
  [1034, 884],
  [1034, H],
  [-10, H],
];
fillPoly(fgPts, RIDGE);
// No drawn cracks or rim lines on the rock: thin amber lines kept reading
// as sticks. The light itself, drawn in section 11, does the work.

// 11. The light lands: a soft column of amber glow rises from the peak,
//     and the little robot stands in it, one arm raised toward the door.
//     The glow behind it is what makes the dark figure readable.
const RX = 330;
const RY = 812;
const BODY: RGB = [20, 44, 52];
const BODY_DK: RGB = [12, 28, 35];
glow(RX, 762, 130, AMBER, 0.32);
glow(RX, 812, 90, AMBER, 0.42);
// (No ground shadow: on this dark ridge it read as a ball under the feet;
// the glow at the landing does the grounding instead.)
// Legs.
roundRect(RX - 14, RY - 20, 10, 20, 4, BODY);
roundRect(RX + 4, RY - 20, 10, 20, 4, BODY);
// Backpack, on the far side from the light.
roundRect(RX - 27, RY - 58, 11, 28, 4, BODY_DK);
// Body.
roundRect(RX - 16, RY - 62, 32, 44, 9, BODY);
// Glowing chest core.
disc(RX, RY - 42, 3.5, AMBER_CORE, 1, true);
glow(RX, RY - 42, 10, AMBER, 0.5);
// Amber rim on the light-facing side of the body.
thickLine(RX + 15, RY - 56, RX + 15, RY - 22, 3, AMBER, 0.95, true);
// Raised arm, reaching up the beam, rim-lit along its top edge.
thickLine(RX + 12, RY - 52, RX + 38, RY - 82, 7, BODY);
disc(RX + 38, RY - 82, 5.5, BODY);
thickLine(RX + 13, RY - 56, RX + 38, RY - 84, 2, AMBER, 0.9, true);
// Other arm, down at its side.
thickLine(RX - 15, RY - 52, RX - 24, RY - 32, 6, BODY);
// Head: dome with a glowing visor and an antenna.
disc(RX, RY - 72, 16, BODY);
disc(RX - 3, RY - 75, 12, [24, 52, 60], 0.7);
roundRect(RX - 11, RY - 77, 22, 8, 4, AMBER_CORE);
disc(RX + 12, RY - 73, 2.4, AMBER_CORE, 1, true);
thickLine(RX, RY - 86, RX + 4, RY - 100, 2, BODY);
disc(RX + 4, RY - 102, 4, AMBER, 1, true);
glow(RX + 4, RY - 102, 14, AMBER, 0.6);
// Bright motes kicked up where the light strikes the rock.
for (let m = 0; m < 10; m++) {
  const mx = RX + (rand() - 0.5) * 90;
  const my = RY - rand() * 26;
  disc(mx, my, 1 + rand() * 1.6, AMBER_CORE, 0.6 + rand() * 0.4, true);
}

// 12. Vignette: darken the corners a little so the eye stays on the beam.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2);
    const dy = (y + 0.5 - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    const f = d <= 0.72 ? 1 : 1 - (d - 0.72) * 0.55;
    if (f < 1) {
      const i = (y * W + x) * 3;
      img[i] *= f;
      img[i + 1] *= f;
      img[i + 2] *= f;
    }
  }
}

// ---------------------------------------------------------------- PNG ------

// CRC-32 (IEEE) over a buffer, table built once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// Per-row PNG filter choice: for each row, try None, Sub, Up, Average and
// Paeth, keep the one whose filtered bytes sum smallest in magnitude.
// (Row 0 has no row above it, so Up/Average/Paeth fall back to None/Sub.)
function filteredRows(): Buffer {
  const stride = W * 3;
  const rows = Buffer.alloc((stride + 1) * H);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.from(img);
  for (let y = 0; y < H; y++) {
    const row = cur.subarray(y * stride, (y + 1) * stride);
    const variants: Buffer[] = [];
    for (let f = 0; f <= 4; f++) {
      const v = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= 3 ? row[x - 3] : 0;
        const b = y > 0 ? prev[x] : 0;
        const c = y > 0 && x >= 3 ? prev[x - 3] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        v[x] = (row[x] - pred) & 0xff;
      }
      variants.push(v);
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      let score = 0;
      const v = variants[f];
      for (let x = 0; x < stride; x++) {
        const s = v[x] > 127 ? v[x] - 256 : v[x];
        score += s < 0 ? -s : s;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const outOff = y * (stride + 1);
    rows[outOff] = best;
    variants[best].copy(rows, outOff + 1);
    row.copy(prev);
  }
  return rows;
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = deflateSync(filteredRows(), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ run ---

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
