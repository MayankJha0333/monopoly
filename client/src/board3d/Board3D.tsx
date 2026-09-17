import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import type CameraControlsImpl from 'camera-controls';
import { tile } from '@shared/board';
import { isOwnable } from '@shared/types';
import type { GameState, OwnableTile, TokenId } from '@shared/types';
import { paintBoard } from '@/lib/boardTexture';
import {
  BOARD_SIZE, BOARD_THICKNESS, HALF, LAYOUTS, TOP_Y, buildingSpots, inwardVector, tileLayout, tokenSpot,
} from '@/lib/layout';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { City3D } from './City3D';
import { Dice3D } from './Dice3D';
import { AvatarBadge, Flag, Hotel, House, Pawn, TileGlow } from './pieces';
import { Scenery } from './Scenery';

export interface Board3DProps {
  state: GameState | null;
  focusTile: number | null;
  quality: 'high' | 'low';
  onTile?: (id: number) => void;
  /** Home-screen mode: no game, a slow orbit and a few pieces wandering. */
  showcase?: boolean;
}

const WALK_TILES_PER_SEC = 6.5;
const MAX_WALK = 13;
const HOP = 0.55;
const FOV = 38;

// ------------------------------------------------------------------ helpers

const wrap40 = (n: number) => ((Math.round(n) % 40) + 40) % 40;

function tileAt(x: number, z: number): number | null {
  for (const t of LAYOUTS) {
    const horizontal = t.edge === 'bottom' || t.edge === 'top' || t.isCorner;
    const hx = (horizontal ? t.w : t.d) / 2;
    const hz = (horizontal ? t.d : t.w) / 2;
    if (Math.abs(x - t.x) <= hx && Math.abs(z - t.z) <= hz) return t.id;
  }
  return null;
}

/** Where the dice land for a roller: on the promenade just inside their edge. */
function diceSpot(tileId: number): { at: [number, number, number]; out: [number, number] } {
  const t = tileLayout(tileId);
  const [ix, iz] = inwardVector(t.edge);
  const clamp = (v: number) => Math.max(-4.6, Math.min(4.6, v));
  const x = ix !== 0 ? -ix * 6.0 : clamp(t.x);
  const z = iz !== 0 ? -iz * 6.0 : clamp(t.z);
  return { at: [x, TOP_Y, z], out: [-ix, -iz] };
}

function spotFor(state: GameState, playerId: string, index: number) {
  const id = wrap40(index);
  const here = state.players.filter((p) => !p.bankrupt && p.position === id);
  const slot = Math.max(0, here.findIndex((p) => p.id === playerId));
  return tokenSpot(id, slot, Math.max(1, here.length));
}

function pointAt(state: GameState, playerId: string, index: number) {
  const base = Math.floor(index);
  const frac = index - base;
  const a = spotFor(state, playerId, base);
  if (frac < 0.001) return { x: a[0], z: a[2], lift: 0 };
  const b = spotFor(state, playerId, base + 1);
  return {
    x: a[0] + (b[0] - a[0]) * frac,
    z: a[2] + (b[2] - a[2]) * frac,
    lift: Math.sin(frac * Math.PI) * HOP,
  };
}

function readPlayGap(): { t: number; r: number; b: number; l: number } {
  const cs = getComputedStyle(document.documentElement);
  const px = (name: string) => {
    const probe = cs.getPropertyValue(name).trim();
    if (!probe) return 0;
    if (probe.endsWith('px')) return parseFloat(probe);
    if (probe.endsWith('vh')) return (parseFloat(probe) / 100) * window.innerHeight;
    return parseFloat(probe) || 0;
  };
  return { t: px('--play-t'), r: px('--play-r'), b: px('--play-b'), l: px('--play-l') };
}

// ------------------------------------------------------------------ camera

interface Rig {
  overview: (instant?: boolean) => void;
  focus: (x: number, z: number, close?: boolean) => void;
  follow: (x: number, z: number) => void;
  focusTile: (id: number) => void;
  dolly: (amount: number) => void;
  isManual: () => boolean;
  setManual: (m: boolean) => void;
}

function CameraRig({ rig, showcase }: { rig: React.RefObject<Rig | null>; showcase: boolean }) {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const manual = useRef(false);
  const gap = useRef({ t: 0, r: 0, b: 0, l: 0 });
  const lastFollow = useRef(0);

  // Centre the picture in the space the HUD leaves free.
  useEffect(() => {
    gap.current = showcase ? { t: 0, r: 0, b: 0, l: 0 } : readPlayGap();
    const g = gap.current;
    const w = size.width, h = size.height;
    camera.setViewOffset(w, h, -(g.l - g.r) / 2, -(g.t - g.b) / 2, w, h);
    camera.updateProjectionMatrix();
    rig.current?.overview(true);
  }, [size.width, size.height, camera, showcase, rig]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => { manual.current = true; };
    c.addEventListener('controlstart', onStart);

    const fitDistance = () => {
      const g = gap.current;
      const w = Math.max(160, size.width - g.l - g.r);
      const h = Math.max(160, size.height - g.t - g.b);
      const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const extent = BOARD_SIZE + 5;
      const byHeight = (extent * 0.8) / (2 * tan * (h / size.height));
      const byWidth = extent / (2 * tan * (w / size.height));
      return Math.min(70, Math.max(byHeight, byWidth));
    };

    rig.current = {
      overview: (instant = false) => {
        const d = fitDistance() * (showcase ? 1.05 : 1);
        const polar = THREE.MathUtils.degToRad(showcase ? 52 : 44);
        const azimuth = showcase ? c.azimuthAngle : 0;
        const y = Math.cos(polar) * d;
        const flat = Math.sin(polar) * d;
        c.setLookAt(Math.sin(azimuth) * flat, y, Math.cos(azimuth) * flat, 0, 0, 0.6, !instant);
      },
      focus: (x, z, close = true) => {
        const d = close ? 13.5 : 18;
        // Look at the spot from outside the board, a little from above.
        const len = Math.hypot(x, z) || 1;
        const ox = x / len, oz = z / len;
        c.setLookAt(x + ox * d * 0.55, d * 0.82, z + oz * d * 0.55 + 1.2, x * 0.92, TOP_Y, z * 0.92, true);
      },
      follow: (x, z) => {
        const now = performance.now();
        if (now - lastFollow.current < 120) return;
        lastFollow.current = now;
        rig.current?.focus(x, z, true);
      },
      focusTile: (id) => {
        const t = tileLayout(id);
        rig.current?.focus(t.x, t.z, true);
      },
      dolly: (amount) => { void c.dolly(amount, true); },
      isManual: () => manual.current,
      setManual: (m) => { manual.current = m; },
    };
    rig.current.overview(true);
    return () => c.removeEventListener('controlstart', onStart);
  }, [rig, showcase, size.width, size.height]);

  useFrame((_, dt) => {
    if (showcase && controls.current) void controls.current.rotate(dt * 0.06, 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!showcase}
      minDistance={6}
      maxDistance={80}
      minPolarAngle={0.05}
      maxPolarAngle={1.32}
      smoothTime={0.45}
      draggingSmoothTime={0.12}
    />
  );
}

// ------------------------------------------------------------------- board

function BoardBody({ onTile }: { onTile?: (id: number) => void }) {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    paintBoard(canvas, () => { t.needsUpdate = true; }, 'ground');
    t.needsUpdate = true;
    return t;
  }, [gl]);
  useEffect(() => () => texture.dispose(), [texture]);

  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: '#0e8a97', roughness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78 });
    return [side, side, top, side, side, side];
  }, [texture]);

  const down = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: ThreeEvent<PointerEvent>) => { down.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = down.current;
    down.current = null;
    if (!d || !onTile) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    const id = tileAt(e.point.x, e.point.z);
    if (id !== null) { e.stopPropagation(); onTile(id); }
  };

  const rim = HALF + 0.3;
  return (
    <group>
      <mesh position={[0, BOARD_THICKNESS / 2, 0]} material={materials} receiveShadow castShadow
        onPointerDown={onDown} onPointerUp={onUp}>
        <boxGeometry args={[BOARD_SIZE, BOARD_THICKNESS, BOARD_SIZE]} />
      </mesh>
      {/* sunny rim */}
      {[[0, rim, BOARD_SIZE + 1.2, 0.6], [0, -rim, BOARD_SIZE + 1.2, 0.6]].map(([x, z, w, d], i) => (
        <mesh key={`h${i}`} position={[x!, 0.34, z!]} castShadow receiveShadow>
          <boxGeometry args={[w!, 0.68, d!]} />
          <meshStandardMaterial color="#ffc93c" roughness={0.45} />
        </mesh>
      ))}
      {[[rim, 0, 0.6, BOARD_SIZE], [-rim, 0, 0.6, BOARD_SIZE]].map(([x, z, w, d], i) => (
        <mesh key={`v${i}`} position={[x!, 0.34, z!]} castShadow receiveShadow>
          <boxGeometry args={[w!, 0.68, d!]} />
          <meshStandardMaterial color="#ffc93c" roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 2.4, 0.12, BOARD_SIZE + 2.4]} />
        <meshStandardMaterial color="#0a6b78" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ live pieces

interface Choreo {
  following: boolean;
  holdFocus: boolean;
  busyUntil: number;
  walkGate: number;
}

interface Motion { shown: number; dir: 1 | -1; leaping: boolean }

function Tokens({ state, rig, choreo }: {
  state: GameState;
  rig: React.RefObject<Rig | null>;
  choreo: React.RefObject<Choreo>;
}) {
  const groups = useRef(new Map<string, THREE.Group>());
  const motions = useRef(new Map<string, Motion>());
  const stateRef = useRef(state);
  stateRef.current = state;
  const setBoardBusy = useUI((s) => s.setBoardBusy);

  useFrame((_, delta) => {
    const now = performance.now();
    const st = stateRef.current;
    const ch = choreo.current;
    const gated = now < ch.walkGate;
    let moving = gated;
    const dt = Math.min(0.25, delta);

    for (const p of st.players) {
      if (p.bankrupt) continue;
      const g = groups.current.get(p.id);
      if (!g) continue;
      let m = motions.current.get(p.id);
      if (!m) {
        m = { shown: p.position, dir: 1, leaping: false };
        motions.current.set(p.id, m);
      }

      const shownTile = wrap40(m.shown);
      if (!gated && (shownTile !== p.position || m.shown % 1 !== 0)) {
        moving = true;
        const forward = (p.position - m.shown + 40) % 40;
        const backward = (m.shown - p.position + 40) % 40;
        if (!m.leaping && Math.abs(m.shown % 1) < 0.001) {
          m.leaping = forward > MAX_WALK && backward > 4;
          m.dir = forward <= MAX_WALK || forward <= backward ? 1 : -1;
        }
        const speed = m.leaping ? WALK_TILES_PER_SEC * 3.4 : WALK_TILES_PER_SEC;
        const remaining = m.dir === 1 ? forward : backward;
        const step = Math.min(remaining, speed * dt);
        m.shown = (m.shown + step * m.dir + 40) % 40;
        if (remaining - step < 0.002) { m.shown = p.position; m.leaping = false; }
      }

      const at = pointAt(st, p.id, m.shown);
      const jailed = p.inJail && p.position === 10 && m.shown === 10;
      const x = at.x + (jailed ? 0.6 : 0);
      const z = at.z + (jailed ? -0.6 : 0);
      g.position.set(x, TOP_Y + at.lift * (m.leaping ? 3 : 1), z);

      if (ch.following && p.id === st.turn.playerId && rig.current && !rig.current.isManual()) {
        if (gated) {
          const d = diceSpot(p.position).at;
          rig.current.follow((x + d[0]) / 2, (z + d[2]) / 2);
        } else {
          rig.current.follow(x, z);
        }
      }
    }

    if (moving) ch.busyUntil = Math.max(ch.busyUntil, now);
    if (ch.following && now - ch.busyUntil > 700) {
      ch.following = false;
      setBoardBusy(false);
      if (rig.current && !rig.current.isManual() && !ch.holdFocus) rig.current.overview();
    }
  });

  const turnId = state.status === 'playing' ? state.turn.playerId : null;
  return (
    <group>
      {state.players.filter((p) => !p.bankrupt).map((p) => (
        <group
          key={p.id}
          ref={(el) => { if (el) groups.current.set(p.id, el); else groups.current.delete(p.id); }}
        >
          <Pawn color={p.color} active={p.id === turnId} />
          <AvatarBadge token={p.token as TokenId} color={p.color} active={p.id === turnId} />
        </group>
      ))}
    </group>
  );
}

function Holdings({ state }: { state: GameState }) {
  const items = useMemo(() => {
    const out: { key: string; kind: 'house' | 'hotel' | 'flag'; pos: [number, number, number]; rot: number; color: string; dim: boolean }[] = [];
    for (const key of Object.keys(state.properties)) {
      const id = Number(key);
      const st = state.properties[id]!;
      if (!st.owner) continue;
      const owner = state.players.find((p) => p.id === st.owner);
      if (!owner) continue;
      const t = tileLayout(id);
      const [ix, iz] = inwardVector(t.edge);
      out.push({
        key: `f${id}`, kind: 'flag',
        pos: [t.x - ix * (t.d / 2 + 0.3), 0.68, t.z - iz * (t.d / 2 + 0.3)],
        rot: -t.rot, color: owner.color, dim: st.mortgaged,
      });
      const tl = tile(id);
      if (!isOwnable(tl) || !st.houses) continue;
      const group = (tl as OwnableTile).group;
      if (group === 'railroad' || group === 'utility') continue;
      buildingSpots(id, st.houses).forEach((p, i) => {
        out.push({
          key: `b${id}-${i}`, kind: st.houses >= 5 ? 'hotel' : 'house',
          pos: [p[0], TOP_Y, p[2]], rot: -t.rot, color: owner.color, dim: false,
        });
      });
    }
    return out;
  }, [state.properties, state.players]);

  return (
    <group>
      {items.map((it) => (
        <group key={it.key} position={it.pos} rotation={[0, it.rot, 0]}>
          {it.kind === 'flag' && <Flag color={it.color} dim={it.dim} />}
          {it.kind === 'house' && <House roof={it.color} />}
          {it.kind === 'hotel' && <Hotel roof={it.color} />}
        </group>
      ))}
    </group>
  );
}

function Glows({ ids, color, landed }: { ids: number[]; color: string; landed: number | null }) {
  const plate = (id: number, c: string, strong: boolean) => {
    const t = tileLayout(id);
    const horizontal = t.edge === 'bottom' || t.edge === 'top' || t.isCorner;
    return (
      <group key={`${id}-${strong}`} position={[t.x, TOP_Y + 0.012, t.z]}>
        <TileGlow w={horizontal ? t.w : t.d} d={horizontal ? t.d : t.w} color={c} strong={strong} />
      </group>
    );
  };
  return (
    <group>
      {ids.map((id) => plate(id, color, false))}
      {landed !== null && plate(landed, '#ffd43b', true)}
    </group>
  );
}

function LiveGame({ state, focusTile, onTile, rig }: {
  state: GameState;
  focusTile: number | null;
  onTile?: (id: number) => void;
  rig: React.RefObject<Rig | null>;
}) {
  const choreo = useRef<Choreo>({ following: false, holdFocus: false, busyUntil: 0, walkGate: 0 });
  const throwEvent = useGame((s) => s.throwEvent);
  const highlight = useUI((s) => s.highlight);
  const highlightColor = useUI((s) => s.highlightColor);
  const camCmd = useUI((s) => s.camCmd);
  const setBoardBusy = useUI((s) => s.setBoardBusy);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Never leave prompts waiting on a board that is gone.
  useEffect(() => () => setBoardBusy(false), [setBoardBusy]);

  // A throw pulls the camera in on whoever is rolling.
  useEffect(() => {
    if (!throwEvent || !rig.current) return;
    const st = stateRef.current;
    const active = st.players.find((p) => p.id === st.turn.playerId);
    if (!active) return;
    const now = performance.now();
    rig.current.setManual(false);
    choreo.current.following = true;
    choreo.current.busyUntil = now + 2000;
    choreo.current.walkGate = now + 1150;
    setBoardBusy(true);
    const d = diceSpot(active.position).at;
    const t = tileLayout(active.position);
    rig.current.focus((t.x + d[0]) / 2, (t.z + d[2]) / 2, true);
  }, [throwEvent?.at, rig, setBoardBusy]);

  // A live prompt holds the camera on its tile.
  const landed = state.buyPrompt?.tileId ?? state.auction?.tileId ?? null;
  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    if (landed === null) {
      if (choreo.current.holdFocus) {
        choreo.current.holdFocus = false;
        if (!r.isManual() && !choreo.current.following) r.overview();
      }
      return;
    }
    choreo.current.holdFocus = true;
    if (!r.isManual()) r.focusTile(landed);
  }, [landed, rig]);

  useEffect(() => {
    if (focusTile === null || !rig.current) return;
    choreo.current.following = false;
    rig.current.setManual(false);
    rig.current.focusTile(focusTile);
  }, [focusTile, rig]);

  useEffect(() => {
    const r = rig.current;
    if (!r || camCmd.seq === 0) return;
    if (camCmd.kind === 'in') r.dolly(3);
    else if (camCmd.kind === 'out') r.dolly(-3);
    else { choreo.current.following = false; r.setManual(false); r.overview(); }
  }, [camCmd, rig]);

  const roller = state.players.find((p) => p.id === state.turn.playerId);
  const spot = diceSpot(roller?.position ?? 0);

  return (
    <group>
      <BoardBody onTile={onTile} />
      <Holdings state={state} />
      <Glows ids={highlight} color={highlightColor ?? '#ffd43b'} landed={landed} />
      <Tokens state={state} rig={rig} choreo={choreo} />
      <Dice3D roll={throwEvent} spot={spot.at} outward={spot.out} />
    </group>
  );
}

/** A few pawns hopping about for the home screen. */
function Showcase() {
  const pawns = useMemo(() => [
    { color: '#ff5a4f', start: 0 }, { color: '#3ec1f3', start: 11 },
    { color: '#ffd43b', start: 23 }, { color: '#5fdba7', start: 32 },
  ], []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    pawns.forEach((p, i) => {
      const g = refs.current[i];
      if (!g) return;
      // Hop a tile every 0.45s for a few tiles, then rest.
      const cycle = (t + i * 1.3) % 4;
      const hops = Math.min(5, cycle / 0.45);
      const base = p.start + Math.floor((t + i * 1.3) / 4) * 5;
      const idx = base + hops;
      const f = idx - Math.floor(idx);
      const a = tokenSpot(wrap40(Math.floor(idx)), i % 2, 2);
      const b = tokenSpot(wrap40(Math.floor(idx) + 1), i % 2, 2);
      g.position.set(a[0] + (b[0] - a[0]) * f, TOP_Y + Math.sin(f * Math.PI) * HOP, a[2] + (b[2] - a[2]) * f);
    });
  });
  return (
    <group>
      <BoardBody />
      {pawns.map((p, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <Pawn color={p.color} active={false} />
        </group>
      ))}
      <Holdings state={DEMO_STATE} />
    </group>
  );
}

const DEMO_STATE = (() => {
  const props: GameState['properties'] = {};
  const owners: [number, string, number][] = [
    [1, 'a', 2], [3, 'a', 2], [6, 'b', 1], [8, 'b', 1], [9, 'b', 1], [16, 'c', 3], [18, 'c', 3],
    [19, 'c', 5], [21, 'd', 1], [26, 'a', 0], [31, 'd', 4], [32, 'd', 4], [34, 'd', 5], [39, 'b', 0], [5, 'c', 0],
  ];
  for (const [id, owner, houses] of owners) props[id] = { owner, houses, mortgaged: false };
  const player = (id: string, color: string) => ({ id, color } as GameState['players'][number]);
  return {
    properties: props,
    players: [player('a', '#ff5a4f'), player('b', '#3ec1f3'), player('c', '#ffd43b'), player('d', '#5fdba7')],
  } as unknown as GameState;
})();

function Lights({ quality }: { quality: 'high' | 'low' }) {
  const high = quality === 'high';
  return (
    <>
      <hemisphereLight args={['#e8f6ff', '#6aa35a', 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[-18, 30, 14]}
        intensity={2.3}
        color="#fff3dc"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-19}
        shadow-camera-right={19}
        shadow-camera-top={19}
        shadow-camera-bottom={-19}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
    </>
  );
}

export function Board3D({ state, focusTile, quality, onTile, showcase = false }: Board3DProps) {
  const rig = useRef<Rig | null>(null);
  const high = quality === 'high';
  return (
    <div className="board-3d" data-quality={quality} data-showcase={showcase}>
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : [1, 1.25]}
        camera={{ fov: FOV, position: [0, 30, 26], near: 0.5, far: 1600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMappingExposure = 1.05; }}
      >
        <fog attach="fog" args={['#d4efff', 90, 420]} />
        <Lights quality={quality} />
        <Suspense fallback={null}>
          <Scenery quality={quality} />
          <City3D quality={quality} />
          {showcase || !state ? <Showcase /> : (
            <LiveGame state={state} focusTile={focusTile} onTile={onTile} rig={rig} />
          )}
        </Suspense>
        <CameraRig rig={rig} showcase={showcase || !state} />
      </Canvas>
    </div>
  );
}

export default Board3D;
