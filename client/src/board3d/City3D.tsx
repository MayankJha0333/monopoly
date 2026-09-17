import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TOP_Y } from '@/lib/layout';
import { BLOCKS, RING_ROAD, cityLots, type Lot } from '@/lib/cityPlan';
import { facade } from './textures';

const Y = TOP_Y;

function Building({ lot }: { lot: Lot }) {
  const mats = useMemo(() => {
    const map = facade(lot.glass).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const side = (w: number) => {
      const m = map.clone();
      m.needsUpdate = true;
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      m.repeat.set(Math.max(1, Math.round(w / 0.32)) / 4, Math.max(1, Math.round(lot.h / 0.36)) / 4);
      return new THREE.MeshStandardMaterial({ color: lot.color, map: m, roughness: lot.glass ? 0.25 : 0.7, metalness: lot.glass ? 0.2 : 0 });
    };
    const roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(lot.color).multiplyScalar(0.86), roughness: 0.8 });
    const sx = side(lot.d);
    const sz = side(lot.w);
    return [sx, sx, roof, roof, sz, sz];
  }, [lot]);

  const top = Y + lot.h;
  const accent = lot.color === '#fff4e0' ? '#ff8a7a' : '#fff4e0';
  return (
    <group position={[lot.x, 0, lot.z]}>
      <mesh position={[0, Y + lot.h / 2, 0]} material={mats} castShadow receiveShadow>
        <boxGeometry args={[lot.w, lot.h, lot.d]} />
      </mesh>
      {lot.roof === 'cone' && (
        <mesh position={[0, top + 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[Math.min(lot.w, lot.d) * 0.72, 0.6, 4]} />
          <meshStandardMaterial color="#ff7b5c" roughness={0.6} />
        </mesh>
      )}
      {lot.roof === 'dome' && (
        <mesh position={[0, top, 0]} castShadow>
          <sphereGeometry args={[Math.min(lot.w, lot.d) * 0.38, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={accent} roughness={0.3} />
        </mesh>
      )}
      {lot.roof === 'tank' && (
        <mesh position={[lot.w * 0.18, top + 0.18, -lot.d * 0.18]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.36, 12]} />
          <meshStandardMaterial color="#e9eef5" roughness={0.5} />
        </mesh>
      )}
      {lot.roof === 'spire' && (
        <>
          <mesh position={[0, top + 0.3, 0]} castShadow>
            <boxGeometry args={[lot.w * 0.6, 0.6, lot.d * 0.6]} />
            <meshStandardMaterial color={lot.color} roughness={0.4} />
          </mesh>
          <mesh position={[0, top + 1.0, 0]}>
            <cylinderGeometry args={[0.02, 0.04, 0.9, 6]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, top + 1.48, 0]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color="#ff5a4f" emissive="#ff5a4f" emissiveIntensity={1.2} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Trees({ spots }: { spots: [number, number, number][] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const greens = ['#46b95a', '#5fcf6a', '#2f9e52', '#7bd96b'];
    spots.forEach(([x, z, s], i) => {
      m.makeScale(s, s, s).setPosition(x, Y + 0.14 * s, z);
      trunks.current?.setMatrixAt(i, m);
      m.makeScale(s, s * 1.1, s).setPosition(x, Y + 0.42 * s, z);
      crowns.current?.setMatrixAt(i, m);
      crowns.current?.setColorAt(i, c.set(greens[i % greens.length]!));
    });
    if (crowns.current?.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    // Same as the island's forest: without this the town's trees are measured
    // as if they all stood in one spot, and they blink away when the camera
    // turns.
    for (const mesh of [trunks.current, crowns.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.28, 6]} />
        <meshStandardMaterial color="#8b5a2b" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} castShadow>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial color="#ffffff" flatShading roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Park({ x, z }: { x: number; z: number }) {
  const jet = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (jet.current) jet.current.scale.y = 1 + Math.sin(clock.elapsedTime * 5) * 0.12;
  });
  return (
    <group position={[x, Y, z]}>
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.16, 32]} />
        <meshStandardMaterial color="#f4f0e8" />
      </mesh>
      <mesh position={[0, 0.165, 0]}>
        <cylinderGeometry args={[0.47, 0.47, 0.02, 32]} />
        <meshStandardMaterial color="#39c5e6" roughness={0.1} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 0.3, 12]} />
        <meshStandardMaterial color="#f4f0e8" />
      </mesh>
      <mesh ref={jet} position={[0, 0.5, 0]}>
        <coneGeometry args={[0.12, 0.3, 12]} />
        <meshStandardMaterial color="#bff0ff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function Stadium({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, Y, z]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.28, 0.7, 40, 1, true]} />
        <meshStandardMaterial color="#3a86ff" side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.22, 0.05, 8, 48]} />
        <meshStandardMaterial color="#ffd43b" />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.18, 40]} />
        <meshStandardMaterial color="#48c774" />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.28, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.95, 1.05, s * 0.6]} castShadow>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
          <meshStandardMaterial color="#e9eef5" />
        </mesh>
      ))}
    </group>
  );
}

function Wheel({ x, z }: { x: number; z: number }) {
  const spin = useRef<THREE.Group>(null);
  const cabins = useRef<THREE.Group>(null);
  const colors = ['#ff5a4f', '#ffd43b', '#3ec1f3', '#5fdba7', '#b69cff', '#ff8fc7'];
  const R = 1.05;
  useFrame((_, dt) => {
    if (!spin.current || !cabins.current) return;
    spin.current.rotation.z += dt * 0.3;
    const a0 = spin.current.rotation.z;
    cabins.current.children.forEach((c, i) => {
      const a = a0 + (i / 10) * Math.PI * 2;
      c.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.12, 0);
    });
  });
  return (
    <group position={[x, Y, z]} rotation={[0, Math.PI / 4, 0]}>
      <group position={[0, 1.45, 0]}>
        <group ref={spin}>
          <mesh castShadow>
            <torusGeometry args={[R, 0.045, 8, 40]} />
            <meshStandardMaterial color="#ff5fa2" roughness={0.4} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} rotation={[0, 0, (i / 10) * Math.PI * 2]}>
              <boxGeometry args={[R * 2, 0.02, 0.02]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
        <group ref={cabins}>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} castShadow>
              <boxGeometry args={[0.2, 0.18, 0.2]} />
              <meshStandardMaterial color={colors[i % colors.length]} />
            </mesh>
          ))}
        </group>
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0.35 * s, 0.72, 0.22]} rotation={[-0.3, 0, 0.2 * -s]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 1.55, 6]} />
            <meshStandardMaterial color="#e9eef5" />
          </mesh>
          <mesh position={[0.35 * s, 0.72, -0.22]} rotation={[0.3, 0, 0.2 * -s]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 1.55, 6]} />
            <meshStandardMaterial color="#e9eef5" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Lagoon({ x, z }: { x: number; z: number }) {
  const boat = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!boat.current) return;
    const t = clock.elapsedTime * 0.35;
    boat.current.position.set(Math.cos(t) * 0.6, Y + 0.05 + Math.sin(t * 5) * 0.01, Math.sin(t) * 0.45);
    boat.current.rotation.y = -t;
  });
  return (
    <group position={[x, 0, z]}>
      <group ref={boat}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.08, 0.14]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.16, 0]} castShadow>
          <coneGeometry args={[0.1, 0.26, 3]} />
          <meshStandardMaterial color="#ff5a4f" />
        </mesh>
      </group>
      {[[-1.05, -0.95], [1.1, 0.9], [1.05, -1.0]].map(([px, pz], i) => (
        <group key={i} position={[px!, Y, pz!]}>
          <mesh position={[0, 0.4, 0]} rotation={[0, 0, 0.15]} castShadow>
            <cylinderGeometry args={[0.03, 0.05, 0.8, 6]} />
            <meshStandardMaterial color="#a0703a" />
          </mesh>
          {Array.from({ length: 5 }, (_, k) => (
            <mesh key={k} position={[0.06, 0.8, 0]} rotation={[0, (k / 5) * Math.PI * 2, -0.5]} castShadow>
              <boxGeometry args={[0.5, 0.02, 0.1]} />
              <meshStandardMaterial color="#2fa84f" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Little cars circling the ring road. */
function Traffic({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const cars = useMemo(() => Array.from({ length: count }, (_, i) => ({
    offset: i / count,
    speed: 0.022 + (i % 3) * 0.004,
    color: ['#ff5a4f', '#ffd43b', '#3ec1f3', '#ffffff', '#b69cff', '#5fdba7'][i % 6]!,
  })), [count]);
  const perimeter = RING_ROAD * 8;
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      const car = cars[i]!;
      const d = (((car.offset + clock.elapsedTime * car.speed) % 1) + 1) % 1 * perimeter;
      const side = Math.floor(d / (RING_ROAD * 2));
      const along = d - side * RING_ROAD * 2 - RING_ROAD;
      const lane = RING_ROAD - 0.12;
      const pos: [number, number, number][] = [[along, 0, lane], [lane, 0, -along], [-along, 0, -lane], [-lane, 0, along]];
      const [x, , z] = pos[side] ?? pos[0]!;
      c.position.set(x, Y + 0.07, z);
      c.rotation.y = -side * (Math.PI / 2);
    });
  });
  return (
    <group ref={group}>
      {cars.map((c, i) => (
        <group key={i}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.1, 0.16]} />
            <meshStandardMaterial color={c.color} roughness={0.3} />
          </mesh>
          <mesh position={[-0.02, 0.08, 0]}>
            <boxGeometry args={[0.15, 0.07, 0.14]} />
            <meshStandardMaterial color="#d8f1ff" roughness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function City3D({ quality }: { quality: 'high' | 'low' }) {
  const lots = useMemo(() => cityLots(7), []);
  const centre = (b: (typeof BLOCKS)[number]) => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2] as const;
  const trees = useMemo(() => {
    const out: [number, number, number][] = [];
    const park = BLOCKS.find((b) => b.special === 'park')!;
    for (const [fx, fz] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85], [0.3, 0.12], [0.7, 0.88], [0.12, 0.62], [0.88, 0.38]]) {
      out.push([park.x0 + (park.x1 - park.x0) * fx!, park.z0 + (park.z1 - park.z0) * fz!, 1.1]);
    }
    // Street trees along the inside of the ring road.
    for (let v = -4.6; v <= 4.6; v += 1.15) {
      if (Math.abs(Math.abs(v) - 1.9) < 0.4) continue;
      out.push([v, 4.72, 0.8], [v, -4.72, 0.8], [4.72, v, 0.8], [-4.72, v, 0.8]);
    }
    return out;
  }, []);

  return (
    <group>
      {lots.map((lot, i) => <Building key={i} lot={lot} />)}
      {BLOCKS.map((b) => {
        const [x, z] = centre(b);
        if (b.special === 'park') return <Park key="park" x={x} z={z} />;
        if (b.special === 'stadium') return <Stadium key="stadium" x={x} z={z} />;
        if (b.special === 'wheel') return <Wheel key="wheel" x={x} z={z} />;
        if (b.special === 'lagoon') return <Lagoon key="lagoon" x={x} z={z} />;
        return null;
      })}
      <Trees spots={trees} />
      <Traffic count={quality === 'high' ? 10 : 5} />
    </group>
  );
}
