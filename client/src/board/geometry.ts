import {
  BOARD_SIZE, HALF, LAYOUTS, buildingSpots, crowdPlace, inwardVector, tileLayout, tokenSpot,
} from '@/lib/layout';
import type { Edge } from '@/lib/layout';

/**
 * The 2D board lives in its own pixel space — a 1000x1000 square — and every
 * overlay (tokens, houses, owner strips, highlights) is placed in it. The
 * camera then translates and scales that whole plane, so nothing else has to
 * know about the viewport.
 */
export const BOARD_PX = 1000;
export const PX = BOARD_PX / BOARD_SIZE;

export interface Point { x: number; y: number }
export interface Box extends Point { w: number; h: number }

export const toPx = (wx: number, wz: number): Point => ({
  x: (wx + HALF) * PX,
  y: (wz + HALF) * PX,
});

export interface TileBox extends Box {
  id: number;
  edge: Edge;
  isCorner: boolean;
  cx: number;
  cy: number;
  /** rotation, in degrees, that makes a label read from outside the board */
  labelRotation: number;
}

const EDGE_LABEL_ROTATION: Record<Edge, number> = {
  bottom: 0, left: 90, top: 180, right: -90,
};

function box(id: number): TileBox {
  const t = tileLayout(id);
  const horizontal = t.edge === 'bottom' || t.edge === 'top';
  const w = (horizontal ? t.w : t.d) * PX;
  const h = (horizontal ? t.d : t.w) * PX;
  const c = toPx(t.x, t.z);
  return {
    id, edge: t.edge, isCorner: t.isCorner,
    x: c.x - w / 2, y: c.y - h / 2, w, h,
    cx: c.x, cy: c.y,
    labelRotation: EDGE_LABEL_ROTATION[t.edge],
  };
}

export const TILE_BOXES: TileBox[] = LAYOUTS.map((l) => box(l.id));

export const tileBox = (id: number): TileBox =>
  TILE_BOXES[((id % 40) + 40) % 40]!;

/** Where a token stands among whoever else is resting on that tile, and how big. */
export function crowdPoint(tileId: number, occupants: string[] | undefined, playerId: string): Point & { scale: number } {
  const place = crowdPlace(tileId, occupants, playerId);
  return { ...toPx(place.pos[0], place.pos[2]), scale: place.scale };
}

/** Where a token stands, fanned out when a tile is crowded. */
export function tokenPoint(tileId: number, slot: number, total: number): Point {
  const [x, , z] = tokenSpot(tileId, slot, total);
  return toPx(x, z);
}

/** House and hotel positions along a street's colour band. */
export function buildingPoints(tileId: number, count: number): Point[] {
  return buildingSpots(tileId, count).map(([x, , z]) => toPx(x, z));
}

/**
 * The owner strip: a bar hugging the outer edge of a tile, the way a flag in
 * the owner's colour reads on a printed board.
 */
export function ownerStrip(tileId: number, thickness = 15): Box {
  const t = tileBox(tileId);
  const [ix, iy] = inwardVector(t.edge);
  if (ix !== 0) {
    const x = ix > 0 ? t.x : t.x + t.w - thickness;
    return { x, y: t.y, w: thickness, h: t.h };
  }
  const y = iy > 0 ? t.y : t.y + t.h - thickness;
  return { x: t.x, y, w: t.w, h: thickness };
}

/** Unit vector pointing out of the board from a tile, in screen axes. */
export function outward(tileId: number): Point {
  const [ix, iy] = inwardVector(tileBox(tileId).edge);
  return { x: -ix, y: -iy };
}
