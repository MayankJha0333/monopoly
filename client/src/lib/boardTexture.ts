import { BOARD, GROUPS } from '@shared/board';
import type { StreetTile, TaxTile } from '@shared/types';
import { CORNER, LAYOUTS, worldToTex } from './layout';
import { paintCity } from './cityArt';
import { paintGround } from './cityGround';

/**
 * Paints the Sunnyport board face: sea-glass tiles with rounded colour caps,
 * set into a lagoon-teal grid. Every icon is drawn in code.
 */

const SIZE = 2048;
const TILE = '#fffaf0';
const TILE_ALT = '#f6fbff';
const INK = '#14304a';
const GRID = '#0e8a97';
const GRID_DEEP = '#0a6b78';
const SUN = '#ffc93c';
const CORAL = '#ff6b5b';
const SEA = '#27b5d6';

const U = SIZE / 20; // canvas pixels per world unit
const FONT = 'Outfit, system-ui, sans-serif';
const DISPLAY = 'Bungee, Outfit, sans-serif';

/** Canvas rotation that makes each edge's text read from that side of the table. */
const EDGE_ANGLE: Record<string, number> = {
  bottom: 0,
  left: Math.PI / 2,
  top: Math.PI,
  right: -Math.PI / 2,
};

type Ctx = CanvasRenderingContext2D;

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

/** Centred text over up to `maxLines` lines, shrinking a word that is too wide. */
function wrapCentered(
  c: Ctx, text: string, w: number, top: number, lineHeight: number, maxLines: number,
  font: (px: number) => string, px: number,
) {
  c.font = font(px);
  const words = text.split(' ');
  const widest = Math.max(...words.map((word) => c.measureText(word).width));
  if (widest > w) {
    const scale = Math.max(0.6, w / widest);
    c.font = font(px * scale);
    lineHeight *= scale;
  }
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width > w && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  const offset = ((shown.length - 1) * lineHeight) / 2;
  shown.forEach((l, i) => c.fillText(l, 0, top - offset + i * lineHeight));
}

function pill(c: Ctx, text: string, y: number, w: number, fill = INK, ink = '#ffffff') {
  c.font = `700 ${w * 0.15}px ${FONT}`;
  const tw = c.measureText(text).width + w * 0.16;
  c.fillStyle = fill;
  roundRect(c, -tw / 2, y - w * 0.11, tw, w * 0.22, w * 0.11);
  c.fill();
  c.fillStyle = ink;
  c.fillText(text, 0, y + w * 0.008);
}

// -------------------------------------------------------------------- icons

function ferry(c: Ctx, s: number) {
  c.save();
  c.fillStyle = SEA;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(-s * 0.4 + i * s * 0.4, s * 0.34, s * 0.2, Math.PI, 0);
    c.fill();
  }
  c.fillStyle = CORAL;
  c.beginPath();
  c.moveTo(-s * 0.55, s * 0.05); c.lineTo(s * 0.55, s * 0.05);
  c.lineTo(s * 0.38, s * 0.3); c.lineTo(-s * 0.42, s * 0.3);
  c.closePath(); c.fill();
  c.fillStyle = '#ffffff';
  roundRect(c, -s * 0.34, -s * 0.2, s * 0.6, s * 0.26, s * 0.05); c.fill();
  c.strokeStyle = INK; c.lineWidth = s * 0.03; c.stroke();
  c.fillStyle = SEA;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-s * 0.2 + i * s * 0.16, -s * 0.07, s * 0.045, 0, 7); c.fill(); }
  c.fillStyle = SUN;
  c.fillRect(-s * 0.02, -s * 0.42, s * 0.12, s * 0.22);
  c.restore();
}

function cableCar(c: Ctx, s: number) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.035;
  c.beginPath(); c.moveTo(-s * 0.6, -s * 0.46); c.lineTo(s * 0.6, -s * 0.24); c.stroke();
  c.beginPath(); c.moveTo(0, -s * 0.35); c.lineTo(0, -s * 0.16); c.stroke();
  c.fillStyle = SUN;
  roundRect(c, -s * 0.3, -s * 0.16, s * 0.6, s * 0.48, s * 0.1); c.fill(); c.stroke();
  c.fillStyle = '#bfe9f7';
  roundRect(c, -s * 0.22, -s * 0.08, s * 0.44, s * 0.18, s * 0.04); c.fill();
  c.restore();
}

function balloon(c: Ctx, s: number) {
  c.save();
  const cols = [CORAL, SUN, SEA, SUN, CORAL];
  for (let i = 0; i < 5; i++) {
    c.fillStyle = cols[i]!;
    c.beginPath();
    c.ellipse(0, -s * 0.12, s * 0.34 * (1 - i * 0.2), s * 0.38, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = INK; c.lineWidth = s * 0.025;
  c.beginPath(); c.moveTo(-s * 0.18, s * 0.2); c.lineTo(-s * 0.08, s * 0.36);
  c.moveTo(s * 0.18, s * 0.2); c.lineTo(s * 0.08, s * 0.36); c.stroke();
  c.fillStyle = '#9a5b2e';
  roundRect(c, -s * 0.11, s * 0.34, s * 0.22, s * 0.14, s * 0.03); c.fill();
  c.restore();
}

function tram(c: Ctx, s: number) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.03;
  c.beginPath(); c.moveTo(-s * 0.1, -s * 0.28); c.lineTo(s * 0.06, -s * 0.44); c.lineTo(s * 0.2, -s * 0.28); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.6, -s * 0.44); c.lineTo(s * 0.6, -s * 0.44); c.stroke();
  c.fillStyle = '#23c19a';
  roundRect(c, -s * 0.5, -s * 0.28, s, s * 0.52, s * 0.14); c.fill(); c.stroke();
  c.fillStyle = '#e8fbff';
  for (let i = 0; i < 3; i++) { roundRect(c, -s * 0.4 + i * s * 0.28, -s * 0.18, s * 0.22, s * 0.18, s * 0.04); c.fill(); }
  c.fillStyle = INK;
  c.beginPath(); c.arc(-s * 0.26, s * 0.28, s * 0.07, 0, 7); c.arc(s * 0.26, s * 0.28, s * 0.07, 0, 7); c.fill();
  c.restore();
}

function sun(c: Ctx, s: number) {
  c.save();
  c.fillStyle = SUN;
  for (let i = 0; i < 10; i++) {
    c.save();
    c.translate(0, -s * 0.14);
    c.rotate((i / 10) * Math.PI * 2);
    roundRect(c, -s * 0.03, -s * 0.36, s * 0.06, s * 0.12, s * 0.03);
    c.fill();
    c.restore();
  }
  c.beginPath(); c.arc(0, -s * 0.14, s * 0.18, 0, 7); c.fill();
  c.fillStyle = '#2d5b8c';
  c.beginPath();
  c.moveTo(-s * 0.46, s * 0.4); c.lineTo(s * 0.34, s * 0.4); c.lineTo(s * 0.46, s * 0.14); c.lineTo(-s * 0.34, s * 0.14);
  c.closePath(); c.fill();
  c.strokeStyle = '#8cc8f0'; c.lineWidth = s * 0.02;
  c.beginPath(); c.moveTo(-s * 0.4, s * 0.27); c.lineTo(s * 0.4, s * 0.27); c.moveTo(0, s * 0.14); c.lineTo(-s * 0.06, s * 0.4); c.stroke();
  c.restore();
}

function windmill(c: Ctx, s: number) {
  c.save();
  c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = s * 0.03;
  c.beginPath(); c.moveTo(-s * 0.05, -s * 0.18); c.lineTo(s * 0.05, -s * 0.18); c.lineTo(s * 0.1, s * 0.46); c.lineTo(-s * 0.1, s * 0.46);
  c.closePath(); c.fill(); c.stroke();
  c.translate(0, -s * 0.2);
  for (let i = 0; i < 3; i++) {
    c.rotate((Math.PI * 2) / 3);
    c.fillStyle = i === 0 ? CORAL : '#ffffff';
    roundRect(c, -s * 0.05, -s * 0.46, s * 0.1, s * 0.44, s * 0.05); c.fill(); c.stroke();
  }
  c.fillStyle = INK; c.beginPath(); c.arc(0, 0, s * 0.05, 0, 7); c.fill();
  c.restore();
}

function chest(c: Ctx, s: number) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.035;
  c.fillStyle = '#b86a2c';
  roundRect(c, -s * 0.42, -s * 0.02, s * 0.84, s * 0.44, s * 0.06); c.fill(); c.stroke();
  c.fillStyle = '#d98a3d';
  c.beginPath(); c.moveTo(-s * 0.42, -s * 0.02); c.bezierCurveTo(-s * 0.42, -s * 0.36, s * 0.42, -s * 0.36, s * 0.42, -s * 0.02);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = SUN;
  c.fillRect(-s * 0.3, -s * 0.24, s * 0.08, s * 0.66); c.fillRect(s * 0.22, -s * 0.24, s * 0.08, s * 0.66);
  roundRect(c, -s * 0.09, -s * 0.06, s * 0.18, s * 0.2, s * 0.04); c.fill(); c.stroke();
  // sparkle
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(s * 0.38, -s * 0.42); c.lineTo(s * 0.42, -s * 0.33); c.lineTo(s * 0.51, -s * 0.3);
  c.lineTo(s * 0.42, -s * 0.27); c.lineTo(s * 0.38, -s * 0.18); c.lineTo(s * 0.34, -s * 0.27); c.lineTo(s * 0.25, -s * 0.3);
  c.lineTo(s * 0.34, -s * 0.33); c.closePath(); c.fill();
  c.restore();
}

function gift(c: Ctx, s: number, color: string) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.035;
  c.fillStyle = color;
  roundRect(c, -s * 0.36, -s * 0.08, s * 0.72, s * 0.5, s * 0.06); c.fill(); c.stroke();
  roundRect(c, -s * 0.42, -s * 0.2, s * 0.84, s * 0.16, s * 0.05); c.fill(); c.stroke();
  c.fillStyle = SUN;
  c.fillRect(-s * 0.06, -s * 0.2, s * 0.12, s * 0.62);
  c.beginPath(); c.ellipse(-s * 0.14, -s * 0.28, s * 0.14, s * 0.08, -0.4, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(s * 0.14, -s * 0.28, s * 0.14, s * 0.08, 0.4, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#ffffff';
  c.font = `800 ${s * 0.3}px ${FONT}`;
  c.fillText('!', 0, s * 0.2);
  c.restore();
}

function coins(c: Ctx, s: number) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.03;
  for (let i = 0; i < 4; i++) {
    c.fillStyle = i % 2 ? '#f5b82e' : SUN;
    c.beginPath(); c.ellipse(-s * 0.12, s * 0.3 - i * s * 0.12, s * 0.28, s * 0.09, 0, 0, 7); c.fill(); c.stroke();
  }
  c.fillStyle = SUN;
  c.beginPath(); c.arc(s * 0.26, -s * 0.12, s * 0.2, 0, 7); c.fill(); c.stroke();
  c.fillStyle = INK; c.font = `800 ${s * 0.22}px ${FONT}`; c.fillText('$', s * 0.26, -s * 0.11);
  c.restore();
}

function yacht(c: Ctx, s: number) {
  c.save();
  c.fillStyle = SEA;
  c.beginPath(); c.arc(-s * 0.3, s * 0.38, s * 0.16, Math.PI, 0); c.arc(s * 0.1, s * 0.38, s * 0.16, Math.PI, 0); c.fill();
  c.strokeStyle = INK; c.lineWidth = s * 0.03;
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(-s * 0.56, s * 0.12); c.lineTo(s * 0.56, s * 0.12); c.lineTo(s * 0.36, s * 0.32); c.lineTo(-s * 0.44, s * 0.32);
  c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.02, s * 0.08); c.lineTo(-s * 0.02, -s * 0.46); c.lineTo(s * 0.34, s * 0.08); c.closePath();
  c.fillStyle = CORAL; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.08, s * 0.08); c.lineTo(-s * 0.08, -s * 0.36); c.lineTo(-s * 0.38, s * 0.08); c.closePath();
  c.fillStyle = '#ffffff'; c.fill(); c.stroke();
  c.restore();
}

function umbrella(c: Ctx, s: number) {
  c.save();
  c.fillStyle = '#ffe3a3';
  c.beginPath(); c.ellipse(0, s * 0.38, s * 0.5, s * 0.1, 0, 0, 7); c.fill();
  c.strokeStyle = INK; c.lineWidth = s * 0.03;
  c.beginPath(); c.moveTo(s * 0.02, -s * 0.2); c.lineTo(s * 0.1, s * 0.38); c.stroke();
  const cols = [CORAL, '#ffffff', CORAL, '#ffffff', CORAL];
  for (let i = 0; i < 5; i++) {
    c.fillStyle = cols[i]!;
    c.beginPath();
    c.moveTo(0, -s * 0.42);
    c.arc(0, -s * 0.12, s * 0.42, Math.PI + (i / 5) * Math.PI, Math.PI + ((i + 1) / 5) * Math.PI);
    c.closePath(); c.fill();
  }
  c.beginPath(); c.arc(0, -s * 0.12, s * 0.42, Math.PI, 0); c.closePath(); c.stroke();
  c.fillStyle = SUN;
  c.beginPath(); c.arc(s * 0.36, -s * 0.44, s * 0.1, 0, 7); c.fill();
  c.restore();
}

function siren(c: Ctx, s: number) {
  c.save();
  c.strokeStyle = INK; c.lineWidth = s * 0.03;
  c.fillStyle = '#3a4a64';
  roundRect(c, -s * 0.3, s * 0.12, s * 0.6, s * 0.14, s * 0.04); c.fill();
  c.fillStyle = CORAL;
  c.beginPath(); c.arc(0, s * 0.12, s * 0.24, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath(); c.ellipse(-s * 0.08, -s * 0.02, s * 0.05, s * 0.09, 0.4, 0, 7); c.fill();
  c.strokeStyle = CORAL; c.lineWidth = s * 0.04; c.lineCap = 'round';
  for (const a of [-2.4, -1.57, -0.74]) {
    c.beginPath();
    c.moveTo(Math.cos(a) * s * 0.32, s * 0.08 + Math.sin(a) * s * 0.32);
    c.lineTo(Math.cos(a) * s * 0.44, s * 0.08 + Math.sin(a) * s * 0.44);
    c.stroke();
  }
  c.restore();
}

function arrow(c: Ctx, s: number, color: string) {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(s * 0.5, -s * 0.14); c.lineTo(-s * 0.1, -s * 0.14); c.lineTo(-s * 0.1, -s * 0.34);
  c.lineTo(-s * 0.6, 0); c.lineTo(-s * 0.1, s * 0.34); c.lineTo(-s * 0.1, s * 0.14); c.lineTo(s * 0.5, s * 0.14);
  c.closePath(); c.fill();
  c.restore();
}

const TRANSIT_ICON: Record<number, (c: Ctx, s: number) => void> = { 5: ferry, 15: cableCar, 25: balloon, 35: tram };

// ------------------------------------------------------------------ corners

function drawCorner(c: Ctx, id: number, size: number) {
  const half = size / 2;
  const inset = 8;
  const fills: Record<number, string> = { 0: '#fff1c2', 10: '#ffe1d6', 20: '#dff6ff', 30: '#ffe1d6' };
  c.fillStyle = fills[id] ?? TILE;
  roundRect(c, -half + inset, -half + inset, size - inset * 2, size - inset * 2, 26);
  c.fill();

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = INK;

  if (id === 0) {
    c.font = `400 ${size * 0.19}px ${DISPLAY}`;
    c.fillStyle = CORAL;
    c.fillText('START', 0, -size * 0.2);
    c.fillStyle = INK;
    c.font = `700 ${size * 0.062}px ${FONT}`;
    c.fillText('Collect $200', 0, -size * 0.02);
    c.fillText('every lap', 0, size * 0.06);
    c.save();
    c.translate(-size * 0.02, size * 0.27);
    arrow(c, size * 0.5, CORAL);
    c.restore();
    return;
  }

  if (id === 10) {
    // The cell sits in the inner corner; visitors stand on the outer strip.
    const cell = size * 0.56;
    const x0 = -half + inset + 10;
    const y0 = -half + inset + 10;
    c.fillStyle = '#ff9b54';
    roundRect(c, x0, y0, cell, cell, 22); c.fill();
    c.fillStyle = '#fff4e6';
    roundRect(c, x0 + 16, y0 + 16, cell - 32, cell - 32, 14); c.fill();
    c.strokeStyle = INK; c.lineWidth = size * 0.022; c.lineCap = 'round';
    for (let i = 1; i <= 4; i++) {
      const x = x0 + 16 + ((cell - 32) * i) / 5;
      c.beginPath(); c.moveTo(x, y0 + 22); c.lineTo(x, y0 + cell - 22); c.stroke();
    }
    c.fillStyle = INK;
    c.font = `400 ${size * 0.085}px ${DISPLAY}`;
    c.fillText('LOCKUP', x0 + cell / 2, y0 + cell + size * 0.08);
    c.font = `700 ${size * 0.06}px ${FONT}`;
    c.save();
    c.translate(half * 0.74, -size * 0.02);
    c.rotate(-Math.PI / 2);
    c.fillText('Just visiting', 0, 0);
    c.restore();
    return;
  }

  if (id === 20) {
    c.font = `400 ${size * 0.09}px ${DISPLAY}`;
    c.fillText('BEACH', 0, -half * 0.62);
    c.fillText('BREAK', 0, -half * 0.44);
    c.save();
    c.translate(0, size * 0.12);
    umbrella(c, size * 0.5);
    c.restore();
    return;
  }

  c.font = `400 ${size * 0.08}px ${DISPLAY}`;
  c.fillText('GO TO', 0, -half * 0.62);
  c.fillText('LOCKUP', 0, -half * 0.45);
  c.save();
  c.translate(0, size * 0.14);
  siren(c, size * 0.56);
  c.restore();
}

// -------------------------------------------------------------------- tiles

function drawTile(c: Ctx, id: number) {
  const L = LAYOUTS[id]!;
  const t = BOARD[id]!;
  const [cx, cy] = worldToTex(L.x, L.z, SIZE);
  const w = L.w * U;
  const h = L.d * U;

  c.save();
  c.translate(cx, cy);
  c.rotate(EDGE_ANGLE[L.edge]!);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  if (L.isCorner) {
    drawCorner(c, id, CORNER * U);
    c.restore();
    return;
  }

  const inset = 5;
  const x0 = -w / 2 + inset;
  const y0 = -h / 2 + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  c.fillStyle = id % 2 ? TILE : TILE_ALT;
  roundRect(c, x0, y0, iw, ih, 16);
  c.fill();

  c.fillStyle = INK;
  const nameFont = (px: number) => `700 ${px}px ${FONT}`;

  switch (t.type) {
    case 'street': {
      const st = t as StreetTile;
      const band = h * 0.22;
      c.save();
      roundRect(c, x0, y0, iw, ih, 16);
      c.clip();
      c.fillStyle = GROUPS[st.group].color;
      c.fillRect(x0, y0, iw, band);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fillRect(x0, y0, iw, band * 0.3);
      c.restore();
      c.fillStyle = INK;
      wrapCentered(c, st.name, iw * 0.86, -h * 0.02, w * 0.19, 3, nameFont, w * 0.16);
      pill(c, `$${st.price}`, h * 0.33, w, GROUPS[st.group].color, '#ffffff');
      break;
    }
    case 'railroad': {
      wrapCentered(c, t.name, iw * 0.88, -h * 0.3, w * 0.17, 2, nameFont, w * 0.15);
      c.save(); c.translate(0, h * 0.04); (TRANSIT_ICON[id] ?? ferry)(c, w * 0.7); c.restore();
      pill(c, '$200', h * 0.34, w);
      break;
    }
    case 'utility': {
      wrapCentered(c, t.name, iw * 0.88, -h * 0.3, w * 0.17, 2, nameFont, w * 0.15);
      c.save(); c.translate(0, h * 0.04); (id === 12 ? sun : windmill)(c, w * 0.7); c.restore();
      pill(c, '$150', h * 0.34, w);
      break;
    }
    case 'chance': {
      c.font = nameFont(w * 0.16);
      c.fillText('Surprise', 0, -h * 0.32);
      c.save(); c.translate(0, h * 0.05); gift(c, w * 0.72, id === 22 ? SEA : CORAL); c.restore();
      break;
    }
    case 'chest': {
      c.font = nameFont(w * 0.16);
      c.fillText('Treasure', 0, -h * 0.32);
      c.save(); c.translate(0, h * 0.06); chest(c, w * 0.74); c.restore();
      break;
    }
    case 'tax': {
      const tax = t as TaxTile;
      wrapCentered(c, tax.name, iw * 0.88, -h * 0.3, w * 0.17, 2, nameFont, w * 0.15);
      c.save(); c.translate(0, h * 0.04); (id === 4 ? coins : yacht)(c, w * 0.66); c.restore();
      pill(c, `Pay $${tax.amount}`, h * 0.34, w, CORAL);
      break;
    }
    default:
      break;
  }

  c.restore();
}

function drawCentre(c: Ctx, centre: 'city' | 'ground') {
  const inner = (20 - CORNER * 2) * U;
  const o = (SIZE - inner) / 2;
  c.save();
  roundRect(c, o + 4, o + 4, inner - 8, inner - 8, 28);
  c.clip();
  if (centre === 'city') paintCity(c, o, o, inner);
  else paintGround(c, o, o, inner);
  c.restore();
  c.strokeStyle = GRID_DEEP;
  c.lineWidth = 8;
  roundRect(c, o + 4, o + 4, inner - 8, inner - 8, 28);
  c.stroke();
}

function paint(canvas: HTMLCanvasElement, centre: 'city' | 'ground') {
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, SIZE, SIZE);

  // The lagoon-teal grid that the tiles sit in.
  const g = c.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, '#12a3b0');
  g.addColorStop(1, GRID);
  c.fillStyle = g;
  c.fillRect(0, 0, SIZE, SIZE);

  drawCentre(c, centre);
  for (let i = 0; i < 40; i++) drawTile(c, i);

  c.strokeStyle = SUN;
  c.lineWidth = 12;
  roundRect(c, 8, 8, SIZE - 16, SIZE - 16, 36);
  c.stroke();
}

/** The square board face, in texture pixels. */
export const BOARD_TEX_SIZE = SIZE;

/**
 * Paints the board face onto a canvas. `centre: 'ground'` leaves the middle as
 * flat streets and parks, for the 3D view that raises its own buildings.
 * Web fonts may not be ready on the first pass, so callers get a second paint
 * once they land.
 */
export function paintBoard(
  canvas: HTMLCanvasElement,
  onRepaint?: () => void,
  centre: 'city' | 'ground' = 'city',
) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  paint(canvas, centre);
  document.fonts?.ready.then(() => {
    paint(canvas, centre);
    onRepaint?.();
  }).catch(() => undefined);
}
