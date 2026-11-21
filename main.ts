// SOLVARA — The Poster for a Place That Isn't There.
// A travel poster for an invented island where the sun sets twice:
// two suns sink over a turquoise sea, a white cliff town on the
// headland, a lantern causeway, one sailboat. Rendered entirely by
// code (Node 22 stdlib only): no network, no clock, no randomness —
// every pixel is deterministic, so repeated runs are byte-identical.
//
// Output: $MAKEFUN_OUTPUT_DIR/entry.png (1024x1024, <= 1 MiB).

import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const HORIZON = 560;

// ---------------------------------------------------------------- PNG ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas ----
type RGB = [number, number, number];
type Stop = { t: number; c: RGB };

class Canvas {
  px = new Uint8Array(W * H * 4);
  blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    const inv = 1 - a;
    this.px[i] = Math.round(r * a + this.px[i] * inv);
    this.px[i + 1] = Math.round(g * a + this.px[i + 1] * inv);
    this.px[i + 2] = Math.round(b * a + this.px[i + 2] * inv);
    this.px[i + 3] = 255;
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, c[0], c[1], c[2], a);
  }
  // Vertical gradient between y0 and y1 through color stops.
  vgrad(y0: number, y1: number, stops: Stop[]): void {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / (y1 - y0);
      let s0 = stops[0];
      let s1 = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].t && t <= stops[i + 1].t) { s0 = stops[i]; s1 = stops[i + 1]; break; }
      }
      const f = s1.t === s0.t ? 0 : (t - s0.t) / (s1.t - s0.t);
      const r = s0.c[0] + (s1.c[0] - s0.c[0]) * f;
      const g = s0.c[1] + (s1.c[1] - s0.c[1]) * f;
      const b = s0.c[2] + (s1.c[2] - s0.c[2]) * f;
      for (let x = 0; x < W; x++) this.blend(x, y, r, g, b, 1);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.blend(x, y, c[0], c[1], c[2], a);
      }
  }
  // Soft radial glow: alpha falls off quadratically to radius r.
  glow(cx: number, cy: number, r: number, c: RGB, aMax: number): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const a = aMax * (1 - d) * (1 - d);
        this.blend(x, y, c[0], c[1], c[2], a);
      }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.blend(x, y, c[0], c[1], c[2], a);
      }
  }
  // Scanline-filled polygon.
  poly(pts: [number, number][], c: RGB, a = 1): void {
    let minY = H;
    let maxY = 0;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(xs[i]));
        const x1 = Math.min(W - 1, Math.floor(xs[i + 1]));
        for (let x = x0; x <= x1; x++) this.blend(x, y, c[0], c[1], c[2], a);
      }
    }
  }
  // Thick line drawn as a chain of discs.
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, w / 3)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c, a);
    }
  }
}

// ------------------------------------------------------- deterministic rng
// Fixed-seed PRNG (mulberry32). Deterministic: same seed, same picture.
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

// ----------------------------------------------------------------- font --
// 5x7 bitmap font, one row per string, "1" = ink. Only the glyphs the
// poster uses are listed; unknown glyphs render as a blank.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "•": ["00000", "00000", "01110", "01110", "01110", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "°": ["00110", "01001", "01001", "00110", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
};

function textWidth(s: string, scale: number): number {
  return s.length * (5 * scale + scale) - scale;
}
function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, a = 1): void {
  let cx = Math.round(x);
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "1")
          cv.fillRect(cx + col * scale, y + r * scale, scale, scale, c, a);
    cx += 5 * scale + scale;
  }
}
function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB, a = 1): void {
  drawText(cv, s, cx - textWidth(s, scale) / 2, y, scale, c, a);
}

// -------------------------------------------------------------- poster ---
const CREAM: RGB = [255, 246, 224];
const SHADOW: RGB = [110, 36, 24];
const SUN_CORE: RGB = [255, 243, 201];
const SUN_MID: RGB = [255, 209, 102];
const GLOW: RGB = [255, 196, 107];

function drawSun(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.glow(cx, cy, r * 3.4, GLOW, 0.5);
  cv.glow(cx, cy, r * 1.9, SUN_MID, 0.55);
  cv.circle(cx, cy, r, SUN_MID);
  cv.circle(cx, cy, r * 0.78, SUN_CORE);
}

function drawBird(cv: Canvas, x: number, y: number, s: number): void {
  const c: RGB = [90, 42, 32];
  cv.line(x - s, y, x, y + s * 0.45, 3, c, 0.85);
  cv.line(x, y + s * 0.45, x + s, y, 3, c, 0.85);
}

function drawPalm(cv: Canvas, bx: number, by: number, h: number, lean: number, c: RGB): void {
  const topX = bx + lean;
  const topY = by - h;
  // Trunk: a gently curving thick line, drawn as overlapping segments
  // so it stays solid instead of dotted.
  const steps = 16;
  let px = bx;
  let py = by;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = bx + (topX - bx) * t + Math.sin(t * 2.2) * 14 * (1 - t);
    const y = by - h * t;
    cv.line(px, py, x, y, 13 - t * 5, c);
    px = x;
    py = y;
  }
  // Fronds: six arcs drooping from the crown, thick enough to read.
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI * (0.08 + k * 0.16);
    const len = h * (0.42 + (k % 2) * 0.08);
    const ex = topX + Math.cos(ang) * len * (k < 3 ? 1 : -1) * 1.15;
    const ey = topY + Math.sin(ang) * len * 0.55 + len * 0.28;
    const mx = (topX + ex) / 2;
    const my = (topY + ey) / 2 - 16;
    cv.line(topX, topY, mx, my, 9, c);
    cv.line(mx, my, ex, ey, 9, c);
  }
  // Coconuts.
  cv.circle(topX - 6, topY + 8, 6, c);
  cv.circle(topX + 6, topY + 9, 6, c);
}

function drawHouse(cv: Canvas, x: number, baseY: number, w: number, h: number, dome: boolean): void {
  const wall: RGB = [255, 248, 236];
  const roof: RGB = [201, 111, 74];
  cv.fillRect(x, baseY - h, w, h, wall);
  // Terracotta roof: a shallow trapezoid.
  cv.poly([[x - 4, baseY - h], [x + w + 4, baseY - h], [x + w - 8, baseY - h - 14], [x + 8, baseY - h - 14]], roof);
  if (dome) {
    cv.circle(x + w / 2, baseY - h - 12, 13, [232, 122, 74]);
    cv.fillRect(x + w / 2 - 2, baseY - h - 30, 4, 8, [232, 122, 74]);
  }
  // Windows: two warm-lit, one dark.
  const winW = 9;
  const winH = 13;
  const wy = baseY - h + Math.round(h * 0.3);
  cv.fillRect(x + Math.round(w * 0.2), wy, winW, winH, [255, 209, 102]);
  cv.fillRect(x + Math.round(w * 0.6), wy, winW, winH, [255, 209, 102]);
  cv.fillRect(x + Math.round(w * 0.4), baseY - 16, 10, 16, [90, 52, 40]);
}

function drawPoster(cv: Canvas): void {
  const rnd = mulberry32(20261121);

  // --- Sky: coral sunset deepening to gold at the horizon.
  cv.vgrad(0, HORIZON, [
    { t: 0, c: [201, 75, 50] },
    { t: 0.35, c: [232, 112, 63] },
    { t: 0.7, c: [245, 158, 88] },
    { t: 1, c: [251, 208, 122] },
  ]);

  // --- Soft clouds.
  const cloud: RGB = [255, 217, 168];
  cv.ellipse(205, 305, 185, 20, cloud, 0.26);
  cv.ellipse(810, 262, 225, 22, cloud, 0.24);
  cv.ellipse(560, 185, 150, 15, cloud, 0.2);
  cv.ellipse(860, 385, 205, 18, cloud, 0.2);
  cv.ellipse(150, 435, 160, 15, cloud, 0.18);
  cv.fillRect(0, 528, W, 18, [255, 233, 184], 0.3);

  // --- The twin suns: one large, one companion, low over the sea.
  drawSun(cv, 400, 470, 56);
  drawSun(cv, 612, 444, 40);

  // --- Birds.
  drawBird(cv, 298, 300, 13);
  drawBird(cv, 348, 282, 10);
  drawBird(cv, 705, 318, 12);
  drawBird(cv, 748, 296, 9);
  drawBird(cv, 660, 340, 9);

  // --- Sea: turquoise at the horizon, deep teal below.
  cv.vgrad(HORIZON, H, [
    { t: 0, c: [121, 201, 190] },
    { t: 0.35, c: [62, 154, 160] },
    { t: 0.7, c: [30, 107, 126] },
    { t: 1, c: [15, 68, 89] },
  ]);

  // --- Sun glitter: two shimmering light paths under the suns.
  const glitter: RGB = [255, 217, 138];
  for (const [cx, spread] of [[400, 46], [612, 36]] as [number, number][]) {
    for (let i = 0; i < 110; i++) {
      const y = HORIZON + 12 + rnd() * 380;
      const depth = (y - HORIZON) / 400;
      const wdt = 12 + rnd() * 26 * (1 - depth * 0.4);
      const x = cx + (rnd() - 0.5) * 2 * spread * (0.5 + depth);
      cv.fillRect(x - wdt / 2, y, wdt, 3, glitter, 0.16 + rnd() * 0.34);
    }
  }
  // Faint wave lines.
  for (let y = HORIZON + 46; y < H; y += 42) {
    cv.fillRect(0, y, W, 2, [10, 50, 66], 0.1 + rnd() * 0.08);
  }

  // --- Headland with the white cliff town (right side).
  const cliff: RGB = [110, 58, 46];
  cv.poly(
    [[692, HORIZON], [768, 522], [848, 502], [920, 514], [982, 536], [W, HORIZON],
     [W, 780], [968, 780], [900, 712], [820, 668], [748, 622]],
    cliff,
  );
  // Cliff highlight along the ridge.
  cv.line(768, 522, 848, 502, 4, [150, 88, 66], 0.8);
  cv.line(848, 502, 920, 514, 4, [150, 88, 66], 0.8);
  // Houses on the ridge.
  drawHouse(cv, 772, 522, 46, 52, false);
  drawHouse(cv, 832, 502, 56, 66, true);
  drawHouse(cv, 902, 514, 48, 56, false);
  // Lighthouse at the point, fully on canvas.
  cv.fillRect(960, 452, 20, 84, [255, 248, 236]);
  cv.fillRect(960, 470, 20, 10, [201, 75, 50]);
  cv.fillRect(960, 496, 20, 10, [201, 75, 50]);
  cv.circle(970, 446, 9, [255, 209, 102]);
  cv.glow(970, 446, 34, SUN_MID, 0.5);
  cv.fillRect(964, 436, 12, 6, [90, 52, 40]);

  // --- Lantern causeway from the shore to the town.
  cv.poly([[150, H], [236, H], [766, 664], [722, 644]], [138, 90, 68]);
  cv.line(236, H, 766, 664, 4, [201, 138, 95], 0.9);
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + i * 0.15;
    const px = 150 + (766 - 150) * t + 40 * t;
    const py = H - (H - 664) * t + 6;
    cv.line(px, py, px, py - 30, 4, [60, 38, 30]);
    cv.glow(px, py - 34, 16, SUN_MID, 0.55);
    cv.circle(px, py - 34, 5, SUN_CORE);
  }

  // --- Sailboat on the glitter path.
  const boatX = 330;
  const boatY = 762;
  cv.poly([[boatX - 34, boatY], [boatX + 34, boatY], [boatX + 22, boatY + 16], [boatX - 22, boatY + 16]], [35, 68, 58]);
  cv.line(boatX, boatY, boatX, boatY - 72, 4, [60, 42, 34]);
  cv.poly([[boatX + 4, boatY - 70], [boatX + 4, boatY - 6], [boatX + 44, boatY - 6]], [255, 248, 236]);
  cv.poly([[boatX - 3, boatY - 58], [boatX - 3, boatY - 6], [boatX - 32, boatY - 6]], [255, 238, 210]);
  // Reflection.
  cv.poly([[boatX - 26, boatY + 20], [boatX + 26, boatY + 20], [boatX + 16, boatY + 34], [boatX - 16, boatY + 34]], [255, 217, 138], 0.22);

  // --- Palm silhouettes framing the left edge.
  const palm: RGB = [31, 61, 51];
  drawPalm(cv, 62, H, 330, 46, palm);
  drawPalm(cv, 168, H, 210, -30, palm);

  // --- Thin cream poster frame.
  cv.fillRect(18, 18, W - 36, 4, CREAM, 0.55);
  cv.fillRect(18, H - 22, W - 36, 4, CREAM, 0.55);
  cv.fillRect(18, 18, 4, H - 36, CREAM, 0.55);
  cv.fillRect(W - 22, 18, 4, H - 36, CREAM, 0.55);

  // --- Type: the name carries the poster.
  drawTextCentered(cv, "SOLVARA", 512 + 6, 76, 16, SHADOW, 0.55);
  drawTextCentered(cv, "SOLVARA", 512, 70, 16, CREAM);
  drawTextCentered(cv, "WHERE THE SUN SETS TWICE", 512 + 3, 213, 6, SHADOW, 0.5);
  drawTextCentered(cv, "WHERE THE SUN SETS TWICE", 512, 210, 6, CREAM);
  // Small sun divider under the tagline.
  cv.line(330, 272, 486, 272, 3, CREAM, 0.8);
  cv.line(538, 272, 694, 272, 3, CREAM, 0.8);
  cv.circle(512, 272, 8, SUN_MID);
  cv.circle(512, 272, 5, SUN_CORE);

  // --- Bottom strip: three countable facts, nothing more.
  cv.fillRect(0, 950, W, 74, [11, 50, 66], 0.42);
  drawTextCentered(
    cv,
    "TWO SUNSETS DAILY  •  FERRY 40 MIN  •  WARM ALL YEAR",
    512, 976, 3, [255, 233, 184],
  );
}

// ----------------------------------------------------------------- main --
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const cv = new Canvas();
  drawPoster(cv);
  const png = encodePng(cv.px, W, H);
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  // Read-back self-check: the file on disk must be a whole PNG of the
  // right size, byte-identical to what was encoded, under the 1 MiB cap.
  const back = readFileSync(outPath);
  if (!back.equals(png)) throw new Error("read-back mismatch: file differs from encoded bytes");
  if (back.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("read-back: not a PNG");
  const w = back.readUInt32BE(16);
  const h = back.readUInt32BE(20);
  if (w !== W || h !== H) throw new Error(`read-back: wrong size ${w}x${h}, expected ${W}x${H}`);
  if (back.length > 1048576) throw new Error(`entry.png too large: ${back.length} bytes`);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} bytes=${png.length} sha256=${sha}`);
}

main();
