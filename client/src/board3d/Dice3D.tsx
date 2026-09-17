import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { play } from '@/audio/sfx';
import { rng } from '@/lib/cityPlan';
import { dieFace } from './textures';

export interface DiceRoll { values: [number, number]; seed: number; at: number }

const SIZE = 0.62;
const THROW_MS = 1300;
const HOLD_MS = 1900;
/** Box face order is +x, -x, +y, -y, +z, -z. Opposite faces add to seven. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const TOP: Record<number, [number, number, number]> = {
  1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0],
};

const geometry = new THREE.BoxGeometry(SIZE, SIZE, SIZE);

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: THREE.Quaternion;
  axis: THREE.Vector3;
  turns: number;
  delay: number;
}

function Die({ flight, start, faces }: { flight: Flight; start: number; faces: THREE.Material[] }) {
  const ref = useRef<THREE.Mesh>(null);
  const spin = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = Math.max(0, Math.min(1, (performance.now() - start - flight.delay) / THROW_MS));
    const e = 1 - Math.pow(1 - t, 3);
    m.position.lerpVectors(flight.from, flight.to, e);
    // A main arc, then two small bounces.
    const arc = t < 0.62 ? Math.sin((t / 0.62) * Math.PI) * 2.6 * (1 - t)
      : t < 0.84 ? Math.sin(((t - 0.62) / 0.22) * Math.PI) * 0.34
        : Math.sin(((t - 0.84) / 0.16) * Math.PI) * 0.08;
    m.position.y = flight.to.y + arc + (1 - e) * flight.from.y * 0.2;
    spin.setFromAxisAngle(flight.axis, Math.pow(1 - t, 2) * flight.turns * Math.PI * 2);
    m.quaternion.copy(spin).multiply(flight.target);
  });

  return <mesh ref={ref} geometry={geometry} material={faces} castShadow position={flight.from} />;
}

/**
 * Two dice thrown onto the promenade beside the player who is rolling. The
 * server decides the values; the seed only shapes the tumble.
 */
export function Dice3D({ roll, spot, outward }: {
  roll: DiceRoll | null;
  spot: [number, number, number];
  outward: [number, number];
}) {
  const faces = useMemo(
    () => FACE_VALUES.map((n) => new THREE.MeshStandardMaterial({ map: dieFace(n), roughness: 0.35 })),
    [],
  );
  const [shown, setShown] = useState<{ roll: DiceRoll; flights: Flight[] } | null>(null);
  const [landed, setLanded] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    if (!roll || roll.at === last.current) return;
    last.current = roll.at;
    const r = rng(roll.seed || 1);
    const [sx, sy, sz] = spot;
    const side = new THREE.Vector3(-outward[1], 0, outward[0]);
    const flights = roll.values.map((v, i) => {
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(...TOP[v]!));
      const to = new THREE.Vector3(sx, sy + SIZE / 2, sz).addScaledVector(side, (i - 0.5) * 0.95);
      const from = to.clone()
        .add(new THREE.Vector3(outward[0] * 3.2, 3.4, outward[1] * 3.2))
        .addScaledVector(side, (r() - 0.5) * 2);
      return {
        from, to,
        target: yaw.multiply(face),
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        turns: 2 + Math.floor(r() * 2),
        delay: i * 90,
      };
    });
    setShown({ roll, flights });
    setLanded(false);
    play('dice');
    const a = setTimeout(() => setLanded(true), THROW_MS + 120);
    const b = setTimeout(() => setShown(null), THROW_MS + HOLD_MS + 600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [roll?.at]);

  if (!shown) return null;
  const [v1, v2] = shown.roll.values;
  const mid = shown.flights[0]!.to.clone().add(shown.flights[1]!.to).multiplyScalar(0.5);

  return (
    <group>
      {shown.flights.map((f, i) => (
        <Die key={`${shown.roll.at}-${i}`} flight={f} start={shown.roll.at} faces={faces} />
      ))}
      {landed && (
        <Html position={[mid.x, mid.y + 1.2, mid.z]} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
          <div className="dice3d-total" data-doubles={v1 === v2}>
            {v1 === v2 ? `Double ${v1}!` : v1 + v2}
          </div>
        </Html>
      )}
    </group>
  );
}
