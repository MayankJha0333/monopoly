/**
 * Board geometry. World space is metres with the board centred on the origin,
 * +X to the right and +Z toward the near edge (where GO sits, bottom-right).
 */

export const BOARD_SIZE = 20;
export const HALF = BOARD_SIZE / 2;
export const CORNER = 3.4;
export const SIDE_SPAN = BOARD_SIZE - CORNER * 2;
export const TILE_W = SIDE_SPAN / 9;
export const BOARD_THICKNESS = 0.55;
export const TOP_Y = BOARD_THICKNESS;

/** Distance from the centre to the middle of an edge strip. */
const STRIP_MID = HALF - CORNER / 2;
/** Where the side strip starts, measured from the centre. */
const STRIP_END = HALF - CORNER;

export type Edge = 'bottom' | 'left' | 'top' | 'right';

export interface TileLayout {
  id: number;
  edge: Edge;
  isCorner: boolean;
  /** centre of the tile in world space */
  x: number;
  z: number;
  /** footprint along the edge (w) and toward the centre (d) */
  w: number;
  d: number;
  /** rotation about Y so local +Z points away from the board centre */
  rot: number;
}

const EDGE_ROT: Record<Edge, number> = {
  bottom: 0,
  left: -Math.PI / 2,
  top: Math.PI,
  right: Math.PI / 2,
};

export function tileLayout(id: number): TileLayout {
  const i = ((id % 40) + 40) % 40;

  if (i % 10 === 0) {
    const corners: Record<number, { x: number; z: number; edge: Edge }> = {
      0:  { x: STRIP_MID,  z: STRIP_MID,  edge: 'bottom' },
      10: { x: -STRIP_MID, z: STRIP_MID,  edge: 'left' },
      20: { x: -STRIP_MID, z: -STRIP_MID, edge: 'top' },
      30: { x: STRIP_MID,  z: -STRIP_MID, edge: 'right' },
    };
    const c = corners[i]!;
    return { id: i, edge: c.edge, isCorner: true, x: c.x, z: c.z, w: CORNER, d: CORNER, rot: EDGE_ROT[c.edge] };
  }

  const edge: Edge = i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right';
  const n = i % 10;                     // 1..9 along the edge
  const offset = STRIP_END - (n - 0.5) * TILE_W;

  const spot: Record<Edge, { x: number; z: number }> = {
    bottom: { x: offset, z: STRIP_MID },
    left:   { x: -STRIP_MID, z: offset },
    top:    { x: -offset, z: -STRIP_MID },
    right:  { x: STRIP_MID, z: -offset },
  };

  return {
    id: i, edge, isCorner: false,
    ...spot[edge],
    w: TILE_W, d: CORNER, rot: EDGE_ROT[edge],
  };
}

export const LAYOUTS: TileLayout[] = Array.from({ length: 40 }, (_, i) => tileLayout(i));

/** Unit vector pointing from a tile toward the middle of the board. */
export function inwardVector(edge: Edge): [number, number] {
  switch (edge) {
    case 'bottom': return [0, -1];
    case 'top': return [0, 1];
    case 'left': return [1, 0];
    case 'right': return [-1, 0];
  }
}

export interface TokenPlace {
  /** world position on the board top */
  pos: [number, number, number];
  /** size multiplier, so a crowded tile still fits everyone */
  scale: number;
}

/**
 * Where a token stands on its tile when `total` tokens share it.
 *
 * A side tile is narrow along the edge and deep toward the middle, so a crowd
 * forms two columns running inward, stopping short of the colour band where
 * houses stand. Pieces shrink a little as the tile fills, so nobody spills
 * onto the next tile. Corners are square and take a 2x2 or 3x3 grid.
 */
export function tokenPlace(tileId: number, slot: number, total: number): TokenPlace {
  const t = tileLayout(tileId);
  const [ix, iz] = inwardVector(t.edge);
  const along: [number, number] = t.edge === 'bottom' || t.edge === 'top' ? [1, 0] : [0, 1];
  const n = Math.max(1, total);
  const i = Math.max(0, Math.min(n - 1, slot));

  let v = 0;      // offset along the edge
  let u = 0;      // offset toward the board centre
  let scale = 1;

  if (t.isCorner) {
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const gap = cols === 3 ? 0.95 : 1.15;
    v = (i % cols - (cols - 1) / 2) * gap;
    u = (Math.floor(i / cols) - (rows - 1) / 2) * gap;
    scale = n <= 4 ? 1 : 0.82;
    // Start and the other corners keep their centre; nudge a crowd away from the rim.
    u += 0.1;
  } else if (n === 1) {
    u = -0.42;
  } else {
    // Two columns, as many rows as needed, between the outer rim and the band.
    const rows = Math.ceil(n / 2);
    const nearRim = -1.42;
    const nearBand = 0.62;
    const span = nearBand - nearRim;
    const step = Math.min(0.78, span / rows);
    const first = (nearRim + nearBand) / 2 - ((rows - 1) * step) / 2;
    const col = i % 2;
    const row = Math.floor(i / 2);
    // An odd last token sits in the middle of its row.
    const alone = n % 2 === 1 && i === n - 1;
    const colGap = n <= 2 ? 0.36 : n <= 6 ? 0.34 : 0.3;
    v = alone ? 0 : (col === 0 ? -colGap : colGap);
    u = first + row * step;
    scale = n <= 2 ? 0.8 : n <= 4 ? 0.74 : n <= 6 ? 0.66 : 0.58;
  }

  return {
    pos: [t.x + along[0] * v + ix * u, TOP_Y, t.z + along[1] * v + iz * u],
    scale,
  };
}

/** Where a token stands on its tile (position only). */
export function tokenSpot(tileId: number, slot: number, total: number): [number, number, number] {
  return tokenPlace(tileId, slot, total).pos;
}

/**
 * Who is standing where, for laying out crowds: tokens resting on a tile, in
 * seat order. A token that is still walking is not counted anywhere, so it
 * slides past a crowd into the next free spot instead of pushing people out.
 */
export function restingOccupants(
  players: { id: string; bankrupt: boolean }[],
  shownOf: (id: string) => number,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const p of players) {
    if (p.bankrupt) continue;
    const shown = shownOf(p.id);
    if (Math.abs(shown - Math.round(shown)) > 0.001) continue;
    const tile = ((Math.round(shown) % 40) + 40) % 40;
    const list = out.get(tile) ?? [];
    list.push(p.id);
    out.set(tile, list);
  }
  return out;
}

/** A token's place on a tile given who else is resting there. */
export function crowdPlace(tileId: number, occupants: string[] | undefined, playerId: string): TokenPlace {
  const list = occupants ?? [];
  const idx = list.indexOf(playerId);
  const slot = idx >= 0 ? idx : list.length;
  const total = idx >= 0 ? list.length : list.length + 1;
  return tokenPlace(tileId, slot, total);
}

/** Positions for the houses/hotel sitting on a street's colour band. */
export function buildingSpots(tileId: number, count: number): [number, number, number][] {
  const t = tileLayout(tileId);
  const [ix, iz] = inwardVector(t.edge);
  const alongAxis: [number, number] = t.edge === 'bottom' || t.edge === 'top' ? [1, 0] : [0, 1];
  // Sit on the colour band, which runs along the inner edge of the tile.
  const bandOffset = t.d / 2 - 0.22;

  if (count >= 5) {
    return [[t.x + ix * bandOffset, TOP_Y, t.z + iz * bandOffset]];
  }
  return Array.from({ length: count }, (_, k) => {
    const along = (k - (count - 1) / 2) * (TILE_W * 0.26);
    return [
      t.x + alongAxis[0] * along + ix * bandOffset,
      TOP_Y,
      t.z + alongAxis[1] * along + iz * bandOffset,
    ] as [number, number, number];
  });
}

/** Maps world coordinates onto the board texture canvas. */
export const worldToTex = (wx: number, wz: number, size: number): [number, number] => [
  ((wx + HALF) / BOARD_SIZE) * size,
  ((wz + HALF) / BOARD_SIZE) * size,
];
