/**
 * The town in the middle of the 3D board, as data. The flat parts (streets,
 * parks, lots) are painted into the board texture by `cityGround`, and the 3D
 * view raises buildings on the same lots, so the two always line up.
 * World units, board centred on the origin.
 */
import { CORNER, HALF } from './layout';

export const INNER = HALF - CORNER;        // 6.6: the edge of the tile ring
export const PROMENADE = 5.5;              // kept clear so dice can land here
export const RING_ROAD = 5.2;              // centre line of the ring road
export const STREET = 1.9;                 // centre lines of the cross streets
export const STREET_W = 0.55;

export type Special = 'park' | 'stadium' | 'wheel' | 'lagoon' | 'towers';

export interface Block { i: number; j: number; x0: number; x1: number; z0: number; z1: number; special: Special | null }
export interface Lot { x: number; z: number; w: number; d: number; h: number; color: string; roof: 'flat' | 'cone' | 'dome' | 'tank' | 'spire'; glass: boolean }

const SPANS: [number, number][] = [[-4.95, -2.25], [-1.55, 1.55], [2.25, 4.95]];
const SPECIALS: Record<string, Special> = { '1,1': 'park', '2,0': 'stadium', '0,2': 'wheel', '2,2': 'lagoon', '0,0': 'towers' };

export const BLOCKS: Block[] = SPANS.flatMap(([x0, x1], i) =>
  SPANS.map(([z0, z1], j) => ({ i, j, x0, x1, z0, z1, special: SPECIALS[`${i},${j}`] ?? null })),
);

/** mulberry32 — small, fast, and repeatable. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FACADES = ['#ff8a7a', '#ffd166', '#6fd3f0', '#b69cff', '#5fdba7', '#ffb35c', '#ff8fc7', '#8fb8ff', '#fff4e0', '#9be7df'];

function lotsFor(b: Block, r: () => number): Lot[] {
  const out: Lot[] = [];
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const central = b.i === 1 || b.j === 1;
  if (b.special === 'towers') {
    out.push({ x: b.x0 + w * 0.3, z: b.z0 + d * 0.32, w: 0.95, d: 0.95, h: 3.4, color: '#6fd3f0', roof: 'spire', glass: true });
    out.push({ x: b.x0 + w * 0.72, z: b.z0 + d * 0.3, w: 0.8, d: 0.8, h: 2.5, color: '#b69cff', roof: 'flat', glass: true });
    out.push({ x: b.x0 + w * 0.5, z: b.z0 + d * 0.76, w: 1.6, d: 0.75, h: 1.1, color: '#ffd166', roof: 'tank', glass: false });
    return out;
  }
  if (b.special) return out;
  for (const [fx, fz] of [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]] as const) {
    const lw = 0.8 + r() * 0.3;
    const ld = 0.8 + r() * 0.3;
    const tall = central ? 0.9 + r() * 2.0 : 0.55 + r() * 1.25;
    const roll = r();
    out.push({
      x: b.x0 + w * fx, z: b.z0 + d * fz, w: lw, d: ld, h: tall,
      color: FACADES[Math.floor(r() * FACADES.length)]!,
      roof: roll < 0.22 ? 'cone' : roll < 0.38 ? 'dome' : roll < 0.55 ? 'tank' : tall > 2.2 && roll < 0.7 ? 'spire' : 'flat',
      glass: tall > 1.9 && r() < 0.6,
    });
  }
  return out;
}

export function cityLots(seed = 7): Lot[] {
  const r = rng(seed);
  return BLOCKS.flatMap((b) => lotsFor(b, r));
}
