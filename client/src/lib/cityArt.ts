/**
 * The city inside the board ring, painted in code: roads, blocks of extruded
 * buildings, a river with bridges, a park and a stadium. Everything is drawn
 * from a fixed seed, so the same town shows up on every client and in every
 * screenshot, and there is still not a single image file in the repo.
 */

type Ctx = CanvasRenderingContext2D;

/** mulberry32 — small, fast, and repeatable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(Math.min(255, ((n >> 16) & 255) * k));
  const g = Math.round(Math.min(255, ((n >> 8) & 255) * k));
  const b = Math.round(Math.min(255, (n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

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

const GROUND = '#c9d3bd';
const ASPHALT = '#5d6570';
const ASPHALT_EDGE = '#7a8390';
const WATER = '#5fa8d3';
const WATER_DEEP = '#3d84b8';
const PARK = '#8ec46b';
const PARK_DEEP = '#6ba84f';

const ROOFS = ['#f0e3c8', '#dcc49b', '#b9cde6', '#eb9f85', '#a8ceae', '#7fc4bd', '#efc069', '#c4a6d4'];
const BRICK = ['#d0603f', '#b34e35', '#dd7b4c'];
const GLASS = ['#6fa8d6', '#4f8fc0', '#8fc4d9'];

interface Rect { x: number; y: number; w: number; h: number }

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Extrusion offset: buildings lean up and slightly right, like a low camera. */
const LEAN_X = 0.22;
const LEAN_Y = 0.5;

interface Building extends Rect { height: number; roof: string; kind: 'block' | 'tower' | 'brick' }

function drawBuilding(c: Ctx, b: Building, u: number, rand: () => number) {
  const dx = b.height * LEAN_X;
  const dy = -b.height * LEAN_Y;
  const { x, y, w, h } = b;

  // Contact shadow on the ground.
  c.fillStyle = 'rgba(30, 40, 35, 0.22)';
  roundRect(c, x - 0.3 * u, y + 0.3 * u, w + 0.6 * u, h + 0.5 * u, 0.6 * u);
  c.fill();

  const wallSouth = shade(b.roof, 0.72);
  const wallWest = shade(b.roof, 0.58);

  // South wall.
  c.fillStyle = wallSouth;
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x + w, y + h);
  c.lineTo(x + w + dx, y + h + dy);
  c.lineTo(x + dx, y + h + dy);
  c.closePath();
  c.fill();

  // West wall.
  c.fillStyle = wallWest;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y + h);
  c.lineTo(x + dx, y + h + dy);
  c.lineTo(x + dx, y + dy);
  c.closePath();
  c.fill();

  // Roof.
  c.fillStyle = b.roof;
  c.beginPath();
  c.moveTo(x + dx, y + dy);
  c.lineTo(x + w + dx, y + dy);
  c.lineTo(x + w + dx, y + h + dy);
  c.lineTo(x + dx, y + h + dy);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(22, 30, 40, 0.45)';
  c.lineWidth = Math.max(0.7, 0.07 * u);
  c.stroke();

  // Windows, laid along the slanted south wall.
  const rows = Math.max(1, Math.min(7, Math.round(b.height / (1.6 * u))));
  const cols = Math.max(1, Math.min(6, Math.round(w / (1.7 * u))));
  const wW = Math.min(0.75 * u, (w / cols) * 0.46);
  const wH = Math.min(0.62 * u, (b.height / rows) * 0.46);
  for (let r = 0; r < rows; r++) {
    const f = (r + 0.55) / rows;
    const rowX = x + dx * f;
    const rowY = y + h + dy * f;
    for (let col = 0; col < cols; col++) {
      c.fillStyle = rand() > 0.74 ? 'rgba(255, 216, 138, 0.95)' : 'rgba(38, 54, 72, 0.5)';
      c.fillRect(rowX + (col + 0.5) * (w / cols) - wW / 2, rowY - wH / 2, wW, wH);
    }
  }

  // Rooftop clutter so the tops are not empty planes.
  const rx = x + dx;
  const ry = y + dy;
  if (b.kind === 'tower') {
    c.fillStyle = shade(b.roof, 0.88);
    c.fillRect(rx + w * 0.3, ry + h * 0.25, w * 0.4, h * 0.4);
    c.fillStyle = '#e05a5a';
    c.fillRect(rx + w * 0.47, ry - h * 0.5, Math.max(1, 0.16 * u), h * 0.8);
  } else if (rand() > 0.45) {
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.fillRect(rx + w * 0.14, ry + h * 0.2, w * 0.22, h * 0.24);
    c.fillStyle = shade(b.roof, 0.8);
    c.fillRect(rx + w * 0.58, ry + h * 0.5, w * 0.3, h * 0.3);
  }
}

function tree(c: Ctx, x: number, y: number, r: number, rand: () => number) {
  c.fillStyle = 'rgba(30, 45, 30, 0.22)';
  c.beginPath();
  c.ellipse(x + r * 0.25, y + r * 0.5, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = PARK_DEEP;
  c.beginPath();
  c.arc(x, y - r * 0.2, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rand() > 0.5 ? '#a5d67e' : '#94c96e';
  c.beginPath();
  c.arc(x - r * 0.22, y - r * 0.45, r * 0.72, 0, Math.PI * 2);
  c.fill();
}

function car(c: Ctx, x: number, y: number, u: number, horizontal: boolean, color: string) {
  const l = 1.5 * u;
  const w = 0.75 * u;
  c.fillStyle = 'rgba(0, 0, 0, 0.25)';
  roundRect(c, x + 0.1 * u, y + 0.12 * u, horizontal ? l : w, horizontal ? w : l, 0.3 * u);
  c.fill();
  c.fillStyle = color;
  roundRect(c, x, y, horizontal ? l : w, horizontal ? w : l, 0.3 * u);
  c.fill();
  c.fillStyle = 'rgba(255, 255, 255, 0.6)';
  if (horizontal) c.fillRect(x + l * 0.3, y + w * 0.18, l * 0.34, w * 0.64);
  else c.fillRect(x + w * 0.18, y + l * 0.3, w * 0.64, l * 0.34);
}

/**
 * Paints the whole town into the square at (x, y, size).
 */
export function paintCity(c: Ctx, x0: number, y0: number, size: number, seed = 11) {
  const rand = rng(seed);
  const u = size / 100;            // one "unit" is 1% of the centre square
  const P = (v: number) => x0 + v * u;
  const Q = (v: number) => y0 + v * u;

  c.save();
  c.beginPath();
  c.rect(x0, y0, size, size);
  c.clip();

  // ------------------------------------------------------------ ground
  c.fillStyle = GROUND;
  c.fillRect(x0, y0, size, size);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '90,110,80'}, 0.05)`;
    const w = (3 + rand() * 10) * u;
    c.fillRect(P(rand() * 100), Q(rand() * 100), w, w * 0.6);
  }

  // ------------------------------------------------------------- river
  // Runs from the left edge down to the bottom-right, with two bridges.
  const riverPath = () => {
    c.beginPath();
    c.moveTo(P(-4), Q(58));
    c.bezierCurveTo(P(14), Q(62), P(26), Q(74), P(34), Q(104));
    c.lineTo(P(16), Q(104));
    c.bezierCurveTo(P(10), Q(82), P(2), Q(76), P(-4), Q(74));
    c.closePath();
  };
  riverPath();
  c.fillStyle = WATER;
  c.fill();
  c.save();
  riverPath();
  c.clip();
  c.fillStyle = WATER_DEEP;
  c.fillRect(x0, y0, size, size);
  c.fillStyle = WATER;
  for (let i = 0; i < 22; i++) {
    c.beginPath();
    c.ellipse(P(rand() * 34), Q(56 + rand() * 46), (2 + rand() * 4) * u, 0.5 * u, 0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  c.lineWidth = 0.26 * u;
  for (let i = 0; i < 18; i++) {
    const wx = P(rand() * 32);
    const wy = Q(58 + rand() * 44);
    c.beginPath();
    c.moveTo(wx, wy);
    c.quadraticCurveTo(wx + 1.1 * u, wy - 0.55 * u, wx + 2.2 * u, wy);
    c.stroke();
  }
  // A little ferry.
  c.fillStyle = '#f4f7fa';
  c.beginPath();
  c.ellipse(P(20), Q(80), 2.4 * u, 1.1 * u, 0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#e8503a';
  c.fillRect(P(19.4), Q(78.8), 1.2 * u, 1.1 * u);
  c.restore();

  // Riverbank.
  riverPath();
  c.strokeStyle = '#b9c6a6';
  c.lineWidth = 0.9 * u;
  c.stroke();

  const cityBlocks: Rect[] = [];
  const blocked: Rect[] = [
    // The waterway corner: two boxes are enough to keep blocks off the river.
    { x: P(-6), y: Q(60), w: 22 * u, h: 50 * u },
    { x: P(8), y: Q(74), w: 28 * u, h: 34 * u },
  ];

  // -------------------------------------------------------------- park
  const park: Rect = { x: P(58), y: Q(8), w: 36 * u, h: 34 * u };
  blocked.push(park);
  c.fillStyle = PARK;
  roundRect(c, park.x, park.y, park.w, park.h, 3 * u);
  c.fill();
  c.fillStyle = PARK_DEEP;
  c.globalAlpha = 0.45;
  c.beginPath();
  c.ellipse(park.x + park.w * 0.3, park.y + park.h * 0.66, park.w * 0.3, park.h * 0.22, 0.3, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  // Pond and paths.
  c.fillStyle = WATER;
  c.beginPath();
  c.ellipse(park.x + park.w * 0.66, park.y + park.h * 0.34, park.w * 0.19, park.h * 0.15, -0.4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  c.lineWidth = 0.35 * u;
  c.stroke();
  c.strokeStyle = '#e3d8b8';
  c.lineWidth = 1.1 * u;
  c.beginPath();
  c.moveTo(park.x, park.y + park.h * 0.78);
  c.quadraticCurveTo(park.x + park.w * 0.5, park.y + park.h * 0.2, park.x + park.w, park.y + park.h * 0.5);
  c.stroke();
  for (let i = 0; i < 26; i++) {
    tree(c, park.x + (0.06 + rand() * 0.88) * park.w, park.y + (0.1 + rand() * 0.84) * park.h, (0.9 + rand() * 0.7) * u, rand);
  }

  // ----------------------------------------------------------- stadium
  const stadium = { cx: P(20), cy: Q(20), rx: 13 * u, ry: 10 * u };
  blocked.push({ x: stadium.cx - stadium.rx, y: stadium.cy - stadium.ry, w: stadium.rx * 2, h: stadium.ry * 2 });
  c.fillStyle = 'rgba(30, 40, 35, 0.2)';
  c.beginPath();
  c.ellipse(stadium.cx + 0.6 * u, stadium.cy + 0.9 * u, stadium.rx, stadium.ry, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#dfe4ea';
  c.beginPath();
  c.ellipse(stadium.cx, stadium.cy, stadium.rx, stadium.ry, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#b9c2cc';
  c.beginPath();
  c.ellipse(stadium.cx, stadium.cy, stadium.rx * 0.84, stadium.ry * 0.82, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = PARK;
  c.beginPath();
  c.ellipse(stadium.cx, stadium.cy, stadium.rx * 0.62, stadium.ry * 0.6, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  c.lineWidth = 0.22 * u;
  c.beginPath();
  c.ellipse(stadium.cx, stadium.cy, stadium.rx * 0.36, stadium.ry * 0.34, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(stadium.cx, stadium.cy - stadium.ry * 0.6);
  c.lineTo(stadium.cx, stadium.cy + stadium.ry * 0.6);
  c.stroke();

  // ------------------------------------------------------------- roads
  const avenues = [8, 27, 46, 65, 84];   // vertical
  const streets = [8, 26, 44, 62, 80];   // horizontal
  const roadW = 5 * u;

  const drawRoad = (rx: number, ry: number, rw: number, rh: number) => {
    c.fillStyle = ASPHALT_EDGE;
    c.fillRect(rx - 0.5 * u, ry - 0.5 * u, rw + u, rh + u);
    c.fillStyle = ASPHALT;
    c.fillRect(rx, ry, rw, rh);
  };

  for (const a of avenues) drawRoad(P(a), Q(-6), roadW, size + 12 * u);
  for (const s of streets) drawRoad(P(-6), Q(s), size + 12 * u, roadW);

  // Lane markings.
  c.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  c.lineWidth = 0.28 * u;
  c.setLineDash([1.6 * u, 1.9 * u]);
  for (const a of avenues) {
    c.beginPath();
    c.moveTo(P(a) + roadW / 2, y0);
    c.lineTo(P(a) + roadW / 2, y0 + size);
    c.stroke();
  }
  for (const s of streets) {
    c.beginPath();
    c.moveTo(x0, Q(s) + roadW / 2);
    c.lineTo(x0 + size, Q(s) + roadW / 2);
    c.stroke();
  }
  c.setLineDash([]);

  // Where an avenue crosses the water it reads as a bridge: pale deck edges
  // and a railing, with the road surface already drawn over the river.
  const bridges: [number, number, number][] = [[8, 60, 15], [27, 80, 16]];
  for (const [avenue, from, span] of bridges) {
    const bx = P(avenue) - 1.4 * u;
    const by = Q(from);
    const deckH = span * u;
    c.fillStyle = 'rgba(20, 30, 40, 0.25)';
    c.fillRect(bx + 0.5 * u, by + 0.6 * u, roadW + 2.8 * u, deckH);
    c.fillStyle = '#cfc7b2';
    c.fillRect(bx, by, roadW + 2.8 * u, deckH);
    c.fillStyle = ASPHALT;
    c.fillRect(bx + 1.4 * u, by, roadW, deckH);
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 0.3 * u;
    c.beginPath();
    c.moveTo(bx + 0.6 * u, by); c.lineTo(bx + 0.6 * u, by + deckH);
    c.moveTo(bx + roadW + 2.2 * u, by); c.lineTo(bx + roadW + 2.2 * u, by + deckH);
    c.stroke();
    c.setLineDash([1.6 * u, 1.9 * u]);
    c.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    c.lineWidth = 0.28 * u;
    c.beginPath();
    c.moveTo(bx + 1.4 * u + roadW / 2, by);
    c.lineTo(bx + 1.4 * u + roadW / 2, by + deckH);
    c.stroke();
    c.setLineDash([]);
  }

  // A plaza with a fountain, where two avenues meet the park.
  const plaza = { x: P(72), y: Q(50), r: 6.5 * u };
  blocked.push({ x: plaza.x - plaza.r, y: plaza.y - plaza.r, w: plaza.r * 2, h: plaza.r * 2 });
  c.fillStyle = '#e6dfcc';
  c.beginPath(); c.arc(plaza.x, plaza.y, plaza.r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#cdc4ae'; c.lineWidth = 0.5 * u; c.stroke();
  c.fillStyle = PARK;
  c.beginPath(); c.arc(plaza.x, plaza.y, plaza.r * 0.72, 0, Math.PI * 2); c.fill();
  c.fillStyle = WATER;
  c.beginPath(); c.arc(plaza.x, plaza.y, plaza.r * 0.34, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f4f9fb';
  c.beginPath(); c.arc(plaza.x, plaza.y, plaza.r * 0.13, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    tree(c, plaza.x + Math.cos(a) * plaza.r * 0.88, plaza.y + Math.sin(a) * plaza.r * 0.88, 0.9 * u, rand);
  }

  // A marina on the river.
  c.fillStyle = '#d9cfb8';
  c.fillRect(P(6), Q(88), 9 * u, 1.2 * u);
  for (let i = 0; i < 4; i++) {
    c.fillRect(P(7 + i * 2.2), Q(89.2), 0.9 * u, 4 * u);
    c.fillStyle = '#f4f7fa';
    c.beginPath();
    c.ellipse(P(8.2 + i * 2.2), Q(91 + (i % 2) * 1.4), 1.4 * u, 0.6 * u, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d9cfb8';
  }

  // ------------------------------------------------------------ blocks
  const edges = (lines: number[], span: number) => {
    const out: [number, number][] = [];
    let from = 0;
    for (const l of lines) {
      if (l - from > 6) out.push([from, l]);
      from = l + 5;
    }
    if (span - from > 6) out.push([from, span]);
    return out;
  };

  const colSpans = edges(avenues, 100);
  const rowSpans = edges(streets, 100);

  for (const [cx1, cx2] of colSpans) {
    for (const [ry1, ry2] of rowSpans) {
      const block: Rect = { x: P(cx1 + 1), y: Q(ry1 + 1), w: (cx2 - cx1 - 2) * u, h: (ry2 - ry1 - 2) * u };
      if (blocked.some((b) => overlaps(block, b))) continue;
      cityBlocks.push(block);

      // Pavement under the block.
      c.fillStyle = '#ded8c6';
      roundRect(c, block.x - 0.8 * u, block.y - 0.8 * u, block.w + 1.6 * u, block.h + 1.6 * u, 1.2 * u);
      c.fill();

      // How far from the middle of the town — downtown gets the towers.
      const mid = { x: block.x + block.w / 2, y: block.y + block.h / 2 };
      const d = Math.hypot(mid.x - (x0 + size / 2), mid.y - (y0 + size / 2)) / (size / 2);
      const tall = Math.max(0.25, 1 - d * 0.9);

      // One block in seven is open ground: a green, a court or a car park.
      const open = rand();
      if (open < 0.14) {
        c.fillStyle = PARK;
        roundRect(c, block.x, block.y, block.w, block.h, 1.6 * u);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        c.lineWidth = 0.3 * u;
        c.beginPath();
        c.moveTo(block.x, block.y + block.h * 0.62);
        c.quadraticCurveTo(block.x + block.w * 0.5, block.y + block.h * 0.2,
          block.x + block.w, block.y + block.h * 0.55);
        c.stroke();
        const n = Math.max(3, Math.round((block.w * block.h) / (26 * u * u)));
        for (let i = 0; i < n; i++) {
          tree(c, block.x + (0.12 + rand() * 0.76) * block.w,
            block.y + (0.12 + rand() * 0.76) * block.h, (0.85 + rand() * 0.6) * u, rand);
        }
        continue;
      }
      if (open < 0.2) {
        c.fillStyle = '#6f7883';
        roundRect(c, block.x, block.y, block.w, block.h, 1 * u);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        c.lineWidth = 0.22 * u;
        for (let i = 1; i < 5; i++) {
          c.beginPath();
          c.moveTo(block.x + (block.w / 5) * i, block.y + 0.6 * u);
          c.lineTo(block.x + (block.w / 5) * i, block.y + block.h - 0.6 * u);
          c.stroke();
        }
        const carColoursHere = ['#e8503a', '#f0b429', '#3f9ad6', '#ffffff', '#2f3b4a'];
        for (let i = 0; i < 6; i++) {
          car(c, block.x + (0.1 + rand() * 0.76) * block.w, block.y + (0.1 + rand() * 0.7) * block.h,
            u, false, carColoursHere[Math.floor(rand() * carColoursHere.length)]!);
        }
        continue;
      }

      // Small footprints, packed in a grid, so a block reads as a city block
      // rather than one big slab.
      const cols = Math.max(1, Math.round(block.w / (6.2 * u)));
      const rows = Math.max(1, Math.round(block.h / (6.2 * u)));
      const cellW = block.w / cols;
      const cellH = block.h / rows;

      const list: Building[] = [];
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (rand() < 0.07) continue;                       // a yard or car park
          const padX = (0.5 + rand() * 0.7) * u;
          const padY = (0.5 + rand() * 0.7) * u;
          const bw = Math.min(cellW - padX * 2, 6 * u);
          const bh = Math.min(cellH - padY * 2, 6 * u);
          if (bw < 2 * u || bh < 2 * u) continue;
          const roll = rand();
          const isTower = roll < tall * 0.5;
          const isBrick = !isTower && roll > 0.78;
          const height = isTower
            ? Math.min(13 * u, (7 + rand() * 7) * u * (0.7 + tall * 0.6))
            : (2.6 + rand() * 3.4) * u * (0.8 + tall * 0.3);
          const roof = isTower
            ? (rand() > 0.45 ? GLASS[Math.floor(rand() * GLASS.length)]! : ROOFS[Math.floor(rand() * 3) + 2]!)
            : isBrick ? BRICK[Math.floor(rand() * BRICK.length)]! : ROOFS[Math.floor(rand() * ROOFS.length)]!;
          list.push({
            x: block.x + col * cellW + padX,
            y: block.y + r * cellH + padY,
            w: bw, h: bh, height,
            roof,
            kind: isTower ? 'tower' : isBrick ? 'brick' : 'block',
          });
        }
      }

      // Painter's order: lower on the board draws last, so it overlaps.
      list.sort((a, b) => a.y + a.h - (b.y + b.h));
      for (const b of list) drawBuilding(c, b, u, rand);
    }
  }

  // --------------------------------------------------- street furniture
  const carColors = ['#e8503a', '#f0b429', '#3f9ad6', '#ffffff', '#2f3b4a', '#6cc070'];
  for (let i = 0; i < 34; i++) {
    const alongAvenue = rand() > 0.5;
    const line = (alongAvenue ? avenues : streets)[Math.floor(rand() * 5)]!;
    const along = 4 + rand() * 92;
    const lane = rand() > 0.5 ? 1.1 : 2.9;
    const color = carColors[Math.floor(rand() * carColors.length)]!;
    if (alongAvenue) car(c, P(line) + lane * u, Q(along), u, false, color);
    else car(c, P(along), Q(line) + lane * u, u, true, color);
  }

  // Street trees along the pavements.
  for (let i = 0; i < 46; i++) {
    const alongAvenue = rand() > 0.5;
    const line = (alongAvenue ? avenues : streets)[Math.floor(rand() * 5)]!;
    const along = 3 + rand() * 94;
    const side = rand() > 0.5 ? -1.1 : 6.1;
    const tx = alongAvenue ? P(line) + side * u : P(along);
    const ty = alongAvenue ? Q(along) : Q(line) + side * u;
    if (ty > Q(56) && ty < Q(82)) continue;   // not in the river
    tree(c, tx, ty, (0.75 + rand() * 0.5) * u, rand);
  }

  c.restore();
}
