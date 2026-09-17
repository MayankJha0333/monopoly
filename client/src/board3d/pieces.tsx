import { useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { TokenId } from '@shared/types';
import { CharacterAvatar } from '@/ui/characters';

/** A turned game pawn in the player's colour. */
const PAWN_PROFILE = [
  [0, 0], [0.42, 0], [0.44, 0.06], [0.4, 0.12], [0.26, 0.2], [0.2, 0.34], [0.16, 0.56],
  [0.28, 0.64], [0.28, 0.69], [0.14, 0.73], [0.2, 0.8], [0.25, 0.92], [0.22, 1.04],
  [0.13, 1.12], [0, 1.15],
].map(([x, y]) => new THREE.Vector2(x!, y!));

const pawnGeometry = new THREE.LatheGeometry(PAWN_PROFILE, 28);
pawnGeometry.computeVertexNormals();

export function Pawn({ color, active }: { color: string; active: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const k = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ring.current.scale.set(k, k, k);
  });
  return (
    <group>
      <mesh geometry={pawnGeometry} castShadow>
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.15} />
      </mesh>
      {active && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.5, 0.62, 40]} />
          <meshBasicMaterial color="#ffd43b" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const houseBody = new THREE.BoxGeometry(0.3, 0.26, 0.3);
const houseRoof = new THREE.ConeGeometry(0.26, 0.22, 4);
const hotelBody = new THREE.BoxGeometry(0.62, 0.42, 0.34);
const hotelRoof = new THREE.BoxGeometry(0.68, 0.08, 0.4);
const wallMat = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.6 });

export function House({ roof }: { roof: string }) {
  return (
    <group>
      <mesh geometry={houseBody} material={wallMat} position={[0, 0.13, 0]} castShadow />
      <mesh geometry={houseRoof} position={[0, 0.37, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <meshStandardMaterial color={roof} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Hotel({ roof }: { roof: string }) {
  return (
    <group>
      <mesh geometry={hotelBody} position={[0, 0.21, 0]} castShadow>
        <meshStandardMaterial color="#ff5a4f" roughness={0.5} />
      </mesh>
      <mesh geometry={hotelRoof} position={[0, 0.46, 0]} castShadow>
        <meshStandardMaterial color={roof} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, 0.175]}>
        <planeGeometry args={[0.44, 0.16]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#ffcf5a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

/** An owner's pennant planted on the board rim. */
export function Flag({ color, dim }: { color: string; dim: boolean }) {
  const cloth = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => Math.random() * 6, []);
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 2.4 + phase) * 0.25;
  });
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 1.1, 8]} />
        <meshStandardMaterial color="#e9eef5" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#ffd43b" metalness={0.4} roughness={0.3} />
      </mesh>
      <group position={[0, 0.9, 0]}>
        <mesh ref={cloth} position={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.4, 0.26, 0.02]} />
          <meshStandardMaterial color={dim ? '#8a94a3' : color} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/** A glowing plate over a tile, for highlights and the tile in play. */
export function TileGlow({ w, d, color, strong }: { w: number; d: number; color: string; strong?: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) {
      mat.current.opacity = (strong ? 0.42 : 0.3) + Math.sin(clock.elapsedTime * 4) * 0.12;
    }
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const badgeCache = new Map<string, THREE.CanvasTexture>();

/** The player's character, drawn once into a texture for a floating badge. */
function avatarTexture(token: TokenId, color: string): THREE.CanvasTexture {
  const key = `${token}-${color}`;
  const hit = badgeCache.get(key);
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const c = canvas.getContext('2d')!;
  const disc = () => {
    c.clearRect(0, 0, size, size);
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill();
  };
  disc();
  // Render the SVG avatar off-screen, then paint it into the texture.
  const host = document.createElement('div');
  const root = createRoot(host);
  root.render(<CharacterAvatar token={token} color={color} size={size - 48} />);
  let tries = 0;
  const paint = () => {
    const markup = host.innerHTML;
    if (!markup && tries++ < 60) { requestAnimationFrame(paint); return; }
    setTimeout(() => root.unmount(), 0);
    if (!markup) return;
    const svg = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    img.onload = () => {
      disc();
      c.drawImage(img, 24, 24, size - 48, size - 48);
      tex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  requestAnimationFrame(paint);
  badgeCache.set(key, tex);
  return tex;
}

/** A face above each pawn, always drawn on top so a piece is easy to find. */
export function AvatarBadge({ token, color, active }: { token: TokenId; color: string; active: boolean }) {
  const ref = useRef<THREE.Sprite>(null);
  const map = useMemo(() => avatarTexture(token, color), [token, color]);
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false, transparent: true }),
    [map],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    const s = ref.current;
    if (!s) return;
    const base = active ? 0.9 : 0.62;
    s.position.y = 1.7 + (active ? Math.sin(clock.elapsedTime * 3) * 0.08 : 0);
    s.scale.setScalar(base);
  });
  return <sprite ref={ref} material={material} renderOrder={10} position={[0, 1.85, 0]} />;
}
