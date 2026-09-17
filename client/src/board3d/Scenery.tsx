import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { rng } from '@/lib/cityPlan';
import { striped } from './textures';

/**
 * The island the board sits on: a lawn with a ring road and traffic, a sandy
 * shore, open sea with sailboats, a lighthouse, windmills, a village, palm
 * trees, balloons drifting overhead and mountains on the horizon.
 */

const GROUND_Y = 0;
const ISLAND_R = 27;
const SHORE_R = 32;
const ROAD_R = 16.5;
const SEA_Y = -0.6;

function Sky() {
  const uniforms = useMemo(() => ({
    top: { value: new THREE.Color('#3aa6f0') },
    bottom: { value: new THREE.Color('#dff4ff') },
  }), []);
  return (
    <mesh scale={600} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
        fragmentShader={[
          'uniform vec3 top;',
          'uniform vec3 bottom;',
          'varying vec3 vP;',
          'void main() {',
          '  float h = clamp(vP.y * 1.5 + 0.1, 0.0, 1.0);',
          '  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0);',
          '  #include <colorspace_fragment>',
          '}',
        ].join('\n')}
      />
    </mesh>
  );
}

function Sea({ animated }: { animated: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(420, animated ? 96 : 48, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [animated]);
  const inner = useMemo(() => {
    const g = new THREE.RingGeometry(SHORE_R - 2, 90, 96, 12);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(inner.attributes.position!.array), [inner]);
  const next = useRef(0);
  useFrame(({ clock }) => {
    if (!animated || !ref.current) return;
    // The waves only need ~30 updates a second. Rebuilding the normals is the
    // expensive part, so doing it every frame is what makes weaker machines
    // drop frames on the sea.
    const t = clock.elapsedTime;
    if (t < next.current) return;
    next.current = t + 1 / 30;
    const arr = inner.attributes.position!.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!, z = base[i + 2]!;
      arr[i + 1] = Math.sin(x * 0.22 + t * 1.3) * 0.12 + Math.cos(z * 0.19 + t) * 0.1;
    }
    inner.attributes.position!.needsUpdate = true;
    inner.computeVertexNormals();
  });
  return (
    <group position={[0, SEA_Y, 0]}>
      {/* Well below the waves: if the two water surfaces touch, the whole sea
          shimmers as the camera moves. The wave crests reach about 0.22. */}
      <mesh geometry={geo} position={[0, -0.45, 0]}>
        <meshStandardMaterial color="#1aa3cf" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh ref={ref} geometry={inner}>
        {/* Opaque: a see-through surface over the sea below it flickers where
            the two overlap, and costs a sorting pass every frame. */}
        <meshStandardMaterial color="#35c2df" roughness={0.18} metalness={0.05} flatShading />
      </mesh>
    </group>
  );
}

function Island() {
  return (
    <group>
      {/* sand shelf */}
      <mesh position={[0, GROUND_Y - 0.55, 0]} receiveShadow>
        <cylinderGeometry args={[SHORE_R, SHORE_R + 3, 1.1, 72]} />
        <meshStandardMaterial color="#f3dca4" roughness={1} />
      </mesh>
      {/* lawn */}
      <mesh position={[0, GROUND_Y - 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_R, ISLAND_R + 0.6, 0.4, 72]} />
        <meshStandardMaterial color="#7fcf6a" roughness={1} />
      </mesh>
      {/* plaza under the board */}
      <mesh position={[0, GROUND_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14.6, 64]} />
        <meshStandardMaterial color="#efe3c8" roughness={1} />
      </mesh>
      {/* ring road */}
      {/* polygonOffset pulls these flat layers towards the camera in the depth
          test, so the road sits on the plaza and the centre line on the road
          without the three of them fighting over the same pixels. */}
      <mesh position={[0, GROUND_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[ROAD_R - 1.1, ROAD_R + 1.1, 96]} />
        <meshStandardMaterial color="#465062" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ROAD_R - 0.04, ROAD_R + 0.04, 96]} />
        <meshBasicMaterial color="#ffe28a" polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    </group>
  );
}

function Forest({ count, seed }: { count: number; seed: number }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const pines = useRef<THREE.InstancedMesh>(null);
  const rounds = useRef<THREE.InstancedMesh>(null);
  const layout = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; z: number; s: number; pine: boolean; hue: number }[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const a = r() * Math.PI * 2;
      const d = 18.4 + r() * 7.8;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      // Keep the village, windmill meadow and lighthouse point clear.
      if (x < -14 && z > 8) continue;
      if (x < -16 && z < -4 && z > -18) continue;
      if (x > 14 && z < -12) continue;
      // Trees must not grow into each other: two crowns in the same place
      // share their surfaces, and the picture flickers between them.
      if (out.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 1.7 * 1.7)) continue;
      out.push({ x, z, s: 0.8 + r() * 0.9, pine: r() < 0.5, hue: Math.floor(r() * 5) });
    }
    return out;
  }, [count, seed]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const greens = ['#2f9e52', '#46b95a', '#1f7a43', '#68c95c', '#f0a04b'];
    let pi = 0, ri = 0;
    layout.forEach((t, i) => {
      // A hair into the lawn: a trunk resting exactly on it shares that
      // surface, which flickers as the camera moves.
      m.compose(new THREE.Vector3(t.x, GROUND_Y + 0.35 * t.s - 0.06, t.z), q.identity(), new THREE.Vector3(t.s, t.s, t.s));
      trunks.current?.setMatrixAt(i, m);
      if (t.pine) {
        m.compose(new THREE.Vector3(t.x, GROUND_Y + 1.5 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
        pines.current?.setMatrixAt(pi, m);
        pines.current?.setColorAt(pi++, c.set(greens[t.hue % 3]!));
      } else {
        q.setFromEuler(new THREE.Euler(t.s, t.x, 0));
        m.compose(new THREE.Vector3(t.x, GROUND_Y + 1.25 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
        rounds.current?.setMatrixAt(ri, m);
        rounds.current?.setColorAt(ri++, c.set(greens[t.hue]!));
      }
    });
    if (pines.current) { pines.current.count = pi; if (pines.current.instanceColor) pines.current.instanceColor.needsUpdate = true; }
    if (rounds.current) { rounds.current.count = ri; if (rounds.current.instanceColor) rounds.current.instanceColor.needsUpdate = true; }
    // Tell three.js the trees moved, and where they now are. Without this the
    // whole forest is measured as if it sat at the middle of the island, and
    // it blinks out of sight whenever the camera looks away from the middle.
    for (const mesh of [trunks.current, pines.current, rounds.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [layout]);

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, layout.length]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.7, 6]} />
        <meshStandardMaterial color="#8b5a2b" />
      </instancedMesh>
      <instancedMesh ref={pines} args={[undefined, undefined, layout.length]} castShadow>
        <coneGeometry args={[0.75, 2.0, 7]} />
        <meshStandardMaterial color="#ffffff" flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={rounds} args={[undefined, undefined, layout.length]} castShadow>
        <icosahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color="#ffffff" flatShading roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Palm({ position, lean = 0.2 }: { position: [number, number, number]; lean?: number }) {
  return (
    <group position={position} rotation={[0, lean * 10, 0]}>
      <mesh position={[0, 1.4, 0]} rotation={[0, 0, lean]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, 2.8, 7]} />
        <meshStandardMaterial color="#a8753c" />
      </mesh>
      {Array.from({ length: 6 }, (_, k) => (
        <mesh key={k} position={[-lean * 2.6, 2.8, 0]} rotation={[0, (k / 6) * Math.PI * 2, -0.45]} castShadow>
          <boxGeometry args={[1.6, 0.05, 0.34]} />
          <meshStandardMaterial color="#2fae5a" />
        </mesh>
      ))}
    </group>
  );
}

function Beach() {
  const spots = useMemo(() => {
    const r = rng(21);
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + r() * 0.2;
      const d = ISLAND_R + 2.2 + r() * 1.6;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, kind: i % 3, color: ['#ff5a4f', '#ffd43b', '#3ec1f3', '#b69cff'][i % 4]! };
    });
  }, []);
  return (
    <group>
      {spots.map((s, i) => s.kind === 0
        ? <Palm key={i} position={[s.x, GROUND_Y - 0.05, s.z]} lean={0.15 + (i % 3) * 0.08} />
        : (
          <group key={i} position={[s.x, GROUND_Y - 0.05, s.z]}>
            <mesh position={[0, 0.8, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 1.6, 6]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 1.6, 0]} castShadow>
              <coneGeometry args={[1.0, 0.45, 10]} />
              <meshStandardMaterial map={striped(s.color, '#ffffff', 10)} />
            </mesh>
            <mesh position={[0.7, 0.08, 0.3]} castShadow>
              <boxGeometry args={[0.5, 0.08, 1.1]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
    </group>
  );
}

function Lighthouse({ position }: { position: [number, number, number] }) {
  const beam = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (beam.current) beam.current.rotation.y += dt * 0.8; });
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.9, 0.6, 16]} />
        <meshStandardMaterial color="#9aa6b2" flatShading />
      </mesh>
      {Array.from({ length: 5 }, (_, k) => (
        <mesh key={k} position={[0, 1.2 + k * 1.3, 0]} castShadow>
          <cylinderGeometry args={[0.85 - k * 0.09, 0.93 - k * 0.09, 1.3, 20]} />
          <meshStandardMaterial color={k % 2 ? '#ffffff' : '#ff4d4d'} />
        </mesh>
      ))}
      <mesh position={[0, 7.45, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.8, 12]} />
        <meshStandardMaterial color="#fff6c8" emissive="#ffe27a" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 8.2, 0]} castShadow>
        <coneGeometry args={[0.7, 0.8, 12]} />
        <meshStandardMaterial color="#ff4d4d" />
      </mesh>
      <group ref={beam} position={[0, 7.45, 0]}>
        <mesh position={[7, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[1.4, 14, 16, 1, true]} />
          <meshBasicMaterial color="#fff3b0" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Windmill({ position, speed }: { position: [number, number, number]; speed: number }) {
  const hub = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (hub.current) hub.current.rotation.z += dt * speed; });
  return (
    <group position={position} rotation={[0, 0.6, 0]}>
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.3, 6, 10]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <group ref={hub} position={[0, 6, 0.32]}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} rotation={[0, 0, (k / 3) * Math.PI * 2]} castShadow>
            <boxGeometry args={[0.2, 3.2, 0.06]} />
            <meshStandardMaterial color="#ffffff" />
            <group position={[0, 1.6, 0]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Village() {
  const houses = useMemo(() => {
    const r = rng(33);
    return Array.from({ length: 9 }, () => ({
      x: -17 - r() * 7, z: 10 + r() * 9, w: 1.4 + r() * 1.0, d: 1.3 + r() * 0.8, h: 1.1 + r() * 0.7,
      wall: ['#fff6e6', '#ffe4cf', '#e6f4ff', '#fde7f3'][Math.floor(r() * 4)]!,
      roof: ['#ff6b5b', '#ff9f43', '#3a86ff', '#9b5de5'][Math.floor(r() * 4)]!,
      rot: r() * Math.PI,
    }));
  }, []);
  return (
    <group>
      {houses.map((h, i) => (
        <group key={i} position={[h.x, GROUND_Y, h.z]} rotation={[0, h.rot, 0]}>
          <mesh position={[0, h.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[h.w, h.h, h.d]} />
            <meshStandardMaterial color={h.wall} />
          </mesh>
          <mesh position={[0, h.h + 0.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[Math.max(h.w, h.d) * 0.78, 0.9, 4]} />
            <meshStandardMaterial color={h.roof} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Boats({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const boats = useMemo(() => {
    const r = rng(8);
    return Array.from({ length: count }, (_, i) => ({
      a: r() * Math.PI * 2, d: 40 + r() * 30, speed: (0.015 + r() * 0.02) * (i % 2 ? 1 : -1),
      sail: ['#ffffff', '#ff5a4f', '#ffd43b', '#3ec1f3'][i % 4]!, s: 1.4 + r() * 0.8,
    }));
  }, [count]);
  useFrame(({ clock }) => {
    group.current?.children.forEach((b, i) => {
      const o = boats[i]!;
      const a = o.a + clock.elapsedTime * o.speed;
      b.position.set(Math.cos(a) * o.d, SEA_Y + Math.sin(clock.elapsedTime * 1.4 + i) * 0.1, Math.sin(a) * o.d);
      b.rotation.y = -a + (o.speed > 0 ? Math.PI : 0);
      b.rotation.z = Math.sin(clock.elapsedTime + i) * 0.05;
    });
  });
  return (
    <group ref={group}>
      {boats.map((b, i) => (
        <group key={i} scale={b.s}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.5, 0.3, 1.6]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.9, 6]} />
            <meshStandardMaterial color="#8b5a2b" />
          </mesh>
          <mesh position={[0, 1.2, 0.35]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <coneGeometry args={[0.55, 1.7, 3]} />
            <meshStandardMaterial color={b.sail} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Balloons({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const list = useMemo(() => {
    const r = rng(5);
    const pairs: [string, string][] = [['#ff5a4f', '#ffd43b'], ['#3ec1f3', '#ffffff'], ['#b69cff', '#5fdba7'], ['#ff9f43', '#ff5a4f'], ['#5fdba7', '#ffd43b']];
    return Array.from({ length: count }, (_, i) => ({
      a: (i / count) * Math.PI * 2 + r(), d: 24 + r() * 22, y: 14 + r() * 10,
      speed: 0.01 + r() * 0.01, colors: pairs[i % pairs.length]!,
    }));
  }, [count]);
  useFrame(({ clock }) => {
    group.current?.children.forEach((b, i) => {
      const o = list[i]!;
      const a = o.a + clock.elapsedTime * o.speed;
      b.position.set(Math.cos(a) * o.d, o.y + Math.sin(clock.elapsedTime * 0.5 + i) * 0.8, Math.sin(a) * o.d);
    });
  });
  return (
    <group ref={group}>
      {list.map((b, i) => (
        <group key={i}>
          <mesh position={[0, 2.4, 0]} scale={[1, 1.18, 1]} castShadow>
            <sphereGeometry args={[1.5, 24, 16]} />
            <meshStandardMaterial map={striped(b.colors[0], b.colors[1], 12)} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.6, 0.45, 0.6]} />
            <meshStandardMaterial color="#9a5b2e" />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
            <mesh key={k} position={[sx! * 0.26, 0.95, sz! * 0.26]}>
              <cylinderGeometry args={[0.012, 0.012, 1.0, 4]} />
              <meshStandardMaterial color="#5a4030" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Clouds({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const list = useMemo(() => {
    const r = rng(12);
    return Array.from({ length: count }, () => ({
      x: -200 + r() * 400, y: 34 + r() * 20, z: -200 + r() * 400,
      puffs: Array.from({ length: 5 }, (_, k) => [k * 3.2 - 6.4 + r(), r() * 1.4, r() * 2 - 1, 2.4 + r() * 2.4] as const),
    }));
  }, [count]);
  useFrame((_, dt) => {
    group.current?.children.forEach((c) => {
      c.position.x += dt * 1.6;
      if (c.position.x > 220) c.position.x = -220;
    });
  });
  return (
    <group ref={group}>
      {list.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {c.puffs.map(([px, py, pz, s], k) => (
            <mesh key={k} position={[px, py, pz]} scale={[s, s * 0.72, s]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#ffffff" flatShading roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Mountains() {
  const list = useMemo(() => {
    const r = rng(44);
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + r() * 0.3;
      const d = 170 + r() * 90;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, rad: 22 + r() * 20, h: 26 + r() * 30 };
    });
  }, []);
  return (
    <group>
      {list.map((m, i) => (
        <group key={i} position={[m.x, SEA_Y - 1, m.z]}>
          <mesh position={[0, m.h / 2, 0]}>
            <coneGeometry args={[m.rad, m.h, 8]} />
            <meshStandardMaterial color={i % 2 ? '#6fae7f' : '#7e97b8'} flatShading />
          </mesh>
          <mesh position={[0, m.h * 0.84, 0]}>
            <coneGeometry args={[m.rad * 0.33, m.h * 0.33, 8]} />
            <meshStandardMaterial color="#ffffff" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function RoadTraffic({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const cars = useMemo(() => Array.from({ length: count }, (_, i) => ({
    a: (i / count) * Math.PI * 2, dir: i % 2 ? 1 : -1, speed: 0.08 + (i % 4) * 0.012,
    color: ['#ff5a4f', '#ffd43b', '#3ec1f3', '#ffffff', '#b69cff', '#5fdba7', '#ff9f43'][i % 7]!,
  })), [count]);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      const o = cars[i]!;
      const a = o.a + clock.elapsedTime * o.speed * o.dir;
      const r = ROAD_R + (o.dir > 0 ? -0.55 : 0.55);
      c.position.set(Math.cos(a) * r, GROUND_Y + 0.25, Math.sin(a) * r);
      c.rotation.y = -a + (o.dir > 0 ? Math.PI : 0);
    });
  });
  return (
    <group ref={group}>
      {cars.map((c, i) => (
        <group key={i}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.3, 1.1]} />
            <meshStandardMaterial color={c.color} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.24, -0.05]} castShadow>
            <boxGeometry args={[0.5, 0.22, 0.55]} />
            <meshStandardMaterial color="#d8f1ff" roughness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Scenery({ quality }: { quality: 'high' | 'low' }) {
  const high = quality === 'high';
  return (
    <group>
      <Sky />
      <Sea animated={high} />
      <Island />
      <Forest count={high ? 170 : 70} seed={3} />
      <Beach />
      <Village />
      <Lighthouse position={[20, 0, -19]} />
      <Windmill position={[-21, 0, -8]} speed={0.9} />
      <Windmill position={[-19, 0, -13]} speed={1.2} />
      <Windmill position={[-24, 0, -11]} speed={0.7} />
      <RoadTraffic count={high ? 12 : 6} />
      <Boats count={high ? 8 : 4} />
      <Balloons count={high ? 5 : 2} />
      <Clouds count={high ? 16 : 8} />
      <Mountains />
    </group>
  );
}
