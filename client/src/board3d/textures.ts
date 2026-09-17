import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

/** A die face: soft rounded tile, navy pips, a coral one. */
export function dieFace(n: number) {
  return canvasTexture(`die-${n}`, 256, (c, s) => {
    c.fillStyle = '#e9eef6';
    c.fillRect(0, 0, s, s);
    const g = c.createRadialGradient(s * 0.4, s * 0.35, s * 0.1, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f1f4fa');
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.16);
    c.fill();
    c.fillStyle = n === 1 ? '#ff5a4f' : '#1b2d4a';
    for (const [x, y] of PIPS[n]!) {
      c.beginPath();
      c.arc(x * s, y * s, n === 1 ? s * 0.12 : s * 0.075, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Window grid for building facades; tinted by the material colour. */
export function facade(glass: boolean) {
  return canvasTexture(`facade-${glass}`, 128, (c, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s, s);
    const cells = 4;
    const cell = s / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        c.fillStyle = glass ? (((x + y) % 3) ? '#9cc9e8' : '#c9e6f7') : '#8fb0cf';
        if (glass) c.fillRect(x * cell + 3, y * cell + 2, cell - 6, cell - 4);
        else c.fillRect(x * cell + cell * 0.28, y * cell + cell * 0.22, cell * 0.44, cell * 0.5);
      }
    }
  });
}

export function striped(a: string, b: string, stripes = 8) {
  return canvasTexture(`stripe-${a}-${b}-${stripes}`, 128, (c, s) => {
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 ? b : a;
      c.fillRect((i / stripes) * s, 0, s / stripes + 1, s);
    }
  });
}
