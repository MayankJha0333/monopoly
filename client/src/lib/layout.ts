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

/**
 * Where a token stands on its tile. Tokens fan out in a small grid so a
 * crowded space stays readable.
 */
export function tokenSpot(tileId: number, slot: number, total: number): [number, number, number] {
  const t = tileLayout(tileId);
  const [ix, iz] = inwardVector(t.edge);
  const cols = total <= 2 ? total : total <= 4 ? 2 : 3;
  const rows = Math.ceil(total / cols);
  const col = slot % cols;
  const row = Math.floor(slot / cols);

  const spread = t.isCorner ? 1.5 : Math.min(TILE_W * 0.62, 0.9);
  const alongAxis: [number, number] = t.edge === 'bottom' || t.edge === 'top' ? [1, 0] : [0, 1];
  const along = cols > 1 ? (col / (cols - 1) - 0.5) * spread : 0;
  const depth = rows > 1 ? (row / (rows - 1) - 0.5) * 0.75 : 0;

  // Sit slightly toward the outer half so buildings keep the inner edge.
  const base = t.isCorner ? 0 : 0.42;
  const x = t.x + alongAxis[0] * along + ix * (depth - base);
  const z = t.z + alongAxis[1] * along + iz * (depth - base);
  return [x, TOP_Y, z];
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
