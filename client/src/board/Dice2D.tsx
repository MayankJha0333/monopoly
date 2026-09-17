import { useEffect, useRef, useState } from 'react';
import { play } from '@/audio/sfx';

export interface DiceRoll { values: [number, number]; seed: number; at: number }

/** Cube rotation that brings a face to the front. */
const FACE: Record<number, [number, number]> = {
  1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180],
};

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

const THROW_MS = 950;
const HOLD_MS = 900;

function Face({ value, transform }: { value: number; transform: string }) {
  return (
    <span className="die-face" style={{ transform }}>
      {PIPS[value]!.map(([col, row], i) => (
        <i key={i} style={{ gridColumn: col + 1, gridRow: row + 1 }} />
      ))}
    </span>
  );
}

/**
 * One die: the wrapper flies in and bounces, the cube inside spins to the face
 * the server rolled, and a shadow underneath tracks the bounce.
 */
function Die({ value, spin, delay, fromX, fromY }: {
  value: number; spin: number; delay: number; fromX: number; fromY: number;
}) {
  const [rx, ry] = FACE[value] ?? FACE[1]!;
  return (
    <span
      className="die"
      style={{
        ['--from-x' as string]: `${fromX}px`,
        ['--from-y' as string]: `${fromY}px`,
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="die-shadow" style={{ animationDelay: `${delay}ms` }} />
      <span
        className="die-cube"
        style={{
          transform: `rotateX(${360 * (2 + spin) + rx}deg) rotateY(${360 * (1 + spin) + ry}deg)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        <Face value={1} transform="translateZ(29px)" />
        <Face value={6} transform="rotateY(180deg) translateZ(29px)" />
        <Face value={3} transform="rotateY(90deg) translateZ(29px)" />
        <Face value={4} transform="rotateY(-90deg) translateZ(29px)" />
        <Face value={2} transform="rotateX(90deg) translateZ(29px)" />
        <Face value={5} transform="rotateX(-90deg) translateZ(29px)" />
      </span>
    </span>
  );
}

/**
 * The throw, played on the board itself: the dice land beside the token that
 * is rolling, and they pan and zoom with the board like any other piece.
 */
export function Dice2D({ roll, x, y, onSettled }: {
  roll: DiceRoll | null;
  /** Where the dice land, in board pixels. */
  x: number;
  y: number;
  onSettled?: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'throw' | 'hold' | 'out'>('idle');
  const shown = useRef<DiceRoll | null>(null);
  const spot = useRef({ x, y });

  useEffect(() => {
    if (!roll || roll.at === shown.current?.at) return;
    shown.current = roll;
    spot.current = { x, y };      // freeze where they land for this throw
    setPhase('throw');
    play('dice');

    const toHold = setTimeout(() => setPhase('hold'), THROW_MS);
    const settled = setTimeout(() => onSettled?.(), THROW_MS + 60);
    const toOut = setTimeout(() => setPhase('out'), THROW_MS + HOLD_MS);
    const toIdle = setTimeout(() => setPhase('idle'), THROW_MS + HOLD_MS + 440);
    return () => { [toHold, settled, toOut, toIdle].forEach(clearTimeout); };
  }, [roll?.at, onSettled, x, y]);

  const current = shown.current;
  if (!current || phase === 'idle') return null;

  const seed = current.seed || 1;
  const total = current.values[0] + current.values[1];
  const doubles = current.values[0] === current.values[1];

  // The throw arrives from a different quarter each time, from the seed.
  const angle = ((seed % 8) / 8) * Math.PI * 2;
  const fromX = Math.cos(angle) * 210;
  const fromY = Math.sin(angle) * 210 - 120;

  return (
    <div
      className="dice-board"
      data-phase={phase}
      style={{ left: spot.current.x, top: spot.current.y }}
    >
      <div className="dice-row">
        <Die value={current.values[0]} spin={seed % 3} delay={0} fromX={fromX} fromY={fromY} />
        <Die value={current.values[1]} spin={(seed >> 2) % 3} delay={110} fromX={fromX * 0.8} fromY={fromY * 1.1} />
      </div>
      <div className="dice-total" data-doubles={doubles}>
        {doubles ? `Double ${current.values[0]} — ${total}` : total}
      </div>
    </div>
  );
}
