/**
 * Flat layer of the 3D town, painted into the board texture: grass, the
 * promenade, streets with lane marks, park paths and building pads.
 */
import { BLOCKS, INNER, PROMENADE, RING_ROAD, STREET, STREET_W } from './cityPlan';

type Ctx = CanvasRenderingContext2D;

export function paintGround(c: Ctx, x0: number, y0: number, size: number) {
  const k = size / (INNER * 2);
  const X = (wx: number) => x0 + (wx + INNER) * k;
  const Y = (wz: number) => y0 + (wz + INNER) * k;
  const rect = (ax: number, az: number, bx: number, bz: number, fill: string) => {
    c.fillStyle = fill;
    c.fillRect(X(ax), Y(az), (bx - ax) * k, (bz - az) * k);
  };

  // Promenade: warm paving all round the edge.
  rect(-INNER, -INNER, INNER, INNER, '#f3e2bf');
  c.strokeStyle = 'rgba(160, 120, 70, 0.18)';
  c.lineWidth = 2;
  for (let v = -INNER; v <= INNER; v += 0.35) {
    c.beginPath(); c.moveTo(X(v), Y(-INNER)); c.lineTo(X(v), Y(-PROMENADE)); c.stroke();
    c.beginPath(); c.moveTo(X(v), Y(PROMENADE)); c.lineTo(X(v), Y(INNER)); c.stroke();
    c.beginPath(); c.moveTo(X(-INNER), Y(v)); c.lineTo(X(-PROMENADE), Y(v)); c.stroke();
    c.beginPath(); c.moveTo(X(PROMENADE), Y(v)); c.lineTo(X(INNER), Y(v)); c.stroke();
  }

  // Lawn inside the promenade.
  rect(-PROMENADE, -PROMENADE, PROMENADE, PROMENADE, '#8fd27a');

  // Ring road and cross streets.
  const asphalt = '#4b5566';
  const half = STREET_W / 2;
  rect(-RING_ROAD - half, -RING_ROAD - half, RING_ROAD + half, -RING_ROAD + half, asphalt);
  rect(-RING_ROAD - half, RING_ROAD - half, RING_ROAD + half, RING_ROAD + half, asphalt);
  rect(-RING_ROAD - half, -RING_ROAD - half, -RING_ROAD + half, RING_ROAD + half, asphalt);
  rect(RING_ROAD - half, -RING_ROAD - half, RING_ROAD + half, RING_ROAD + half, asphalt);
  for (const s of [-STREET, STREET]) {
    rect(-RING_ROAD, s - half, RING_ROAD, s + half, asphalt);
    rect(s - half, -RING_ROAD, s + half, RING_ROAD, asphalt);
  }

  // Lane dashes.
  c.fillStyle = '#ffe28a';
  const dash = 0.22;
  for (let v = -RING_ROAD + 0.2; v < RING_ROAD - 0.2; v += 0.45) {
    for (const s of [-STREET, STREET, -RING_ROAD, RING_ROAD]) {
      c.fillRect(X(v), Y(s) - 2, dash * k, 4);
      c.fillRect(X(s) - 2, Y(v), 4, dash * k);
    }
  }

  // Blocks.
  for (const b of BLOCKS) {
    const pad = 0.12;
    if (b.special === 'park') {
      rect(b.x0, b.z0, b.x1, b.z1, '#6cc760');
      c.fillStyle = '#f1dfb6';
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      rect(b.x0, cz - 0.12, b.x1, cz + 0.12, '#f1dfb6');
      rect(cx - 0.12, b.z0, cx + 0.12, b.z1, '#f1dfb6');
      c.beginPath(); c.arc(X(cx), Y(cz), 0.62 * k, 0, Math.PI * 2); c.fill();
      continue;
    }
    if (b.special === 'lagoon') {
      rect(b.x0, b.z0, b.x1, b.z1, '#f3e2bf');
      c.fillStyle = '#38c3e0';
      c.beginPath();
      c.ellipse(X((b.x0 + b.x1) / 2), Y((b.z0 + b.z1) / 2), 1.15 * k, 0.95 * k, 0.3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.stroke();
      continue;
    }
    if (b.special === 'stadium' || b.special === 'wheel') {
      rect(b.x0, b.z0, b.x1, b.z1, b.special === 'stadium' ? '#d9e6ee' : '#ffe6f1');
      continue;
    }
    rect(b.x0 + pad, b.z0 + pad, b.x1 - pad, b.z1 - pad, '#dfe6ea');
  }
}
