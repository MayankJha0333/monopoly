import { expect, test } from '@playwright/test';
import { crowdPlace, tileLayout, tokenPlace } from '../client/src/lib/layout';

/** Every token on a tile has to stay on that tile, and not sit on another token. */
test('crowded tiles keep every piece on its own tile', () => {
  const PAWN_RADIUS = 0.42;
  for (const id of [1, 5, 10, 13, 20, 27, 30, 39]) {
    const t = tileLayout(id);
    const horizontal = t.edge === 'bottom' || t.edge === 'top' || t.isCorner;
    const halfX = (horizontal ? t.w : t.d) / 2;
    const halfZ = (horizontal ? t.d : t.w) / 2;
    for (let total = 1; total <= 8; total++) {
      const places = Array.from({ length: total }, (_, i) => tokenPlace(id, i, total));
      for (const p of places) {
        const r = PAWN_RADIUS * p.scale;
        expect(Math.abs(p.pos[0] - t.x) + r, `tile ${id}, ${total} pieces`).toBeLessThanOrEqual(halfX + 0.001);
        expect(Math.abs(p.pos[2] - t.z) + r, `tile ${id}, ${total} pieces`).toBeLessThanOrEqual(halfZ + 0.001);
      }
      for (let a = 0; a < total; a++) {
        for (let b = a + 1; b < total; b++) {
          const pa = places[a]!, pb = places[b]!;
          const gap = Math.hypot(pa.pos[0] - pb.pos[0], pa.pos[2] - pb.pos[2]);
          expect(gap, `tile ${id}: pieces ${a} and ${b} of ${total} overlap`)
            .toBeGreaterThanOrEqual(PAWN_RADIUS * (pa.scale + pb.scale) - 0.001);
        }
      }
    }
  }
});

test('a walking piece takes the next free spot on a crowded tile', () => {
  const resting = ['a', 'b'];
  const walker = crowdPlace(7, resting, 'c');
  const others = resting.map((id) => crowdPlace(7, resting, id));
  for (const o of others) {
    expect(Math.hypot(o.pos[0] - walker.pos[0], o.pos[2] - walker.pos[2])).toBeGreaterThan(0.4);
  }
});
