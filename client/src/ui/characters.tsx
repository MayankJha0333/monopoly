import type { JSX } from 'react';
import type { TokenId } from '@shared/types';

/**
 * Original mascot art, drawn as SVG so the game still ships with no binary
 * assets. Every character wears the player's colour on its jersey and prop,
 * which is what ties the lobby portrait, the rail avatar and the 3D piece
 * together at a glance.
 */

export interface Character {
  id: TokenId;
  /** Mascot name shown under the portrait. */
  name: string;
  /** One line of personality for the picker. */
  tagline: string;
  /** Species colours: head, muzzle/underside, ink. */
  skin: string;
  patch: string;
}

export const CHARACTERS: Record<TokenId, Character> = {
  hat: { id: 'hat', name: 'Ace', tagline: 'Magpie. Collects shiny deeds.', skin: '#2c3648', patch: '#f2f5fa' },
  car: { id: 'car', name: 'Turbo', tagline: 'Fox. Never passes Start slowly.', skin: '#e08a45', patch: '#fbeedd' },
  ship: { id: 'ship', name: 'Pip', tagline: 'Penguin. Rules the ferry routes.', skin: '#232c3c', patch: '#f4f7fb' },
  dog: { id: 'dog', name: 'Scotty', tagline: 'Terrier. Digs up bargains.', skin: '#4d4a55', patch: '#c9c2b6' },
  boot: { id: 'boot', name: 'Trek', tagline: 'Bear. Walks the whole board.', skin: '#8a6547', patch: '#e0c39c' },
  thimble: { id: 'thimble', name: 'Pin', tagline: 'Hedgehog. Stitches tight deals.', skin: '#6d5644', patch: '#dcb68b' },
  barrow: { id: 'barrow', name: 'Sprout', tagline: 'Rabbit. Builds house by house.', skin: '#e7dfd2', patch: '#f6f1e8' },
  iron: { id: 'iron', name: 'Nimbus', tagline: 'Owl. Reads every rent table.', skin: '#59647a', patch: '#d9e1ee' },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

const INK = '#171d28';

/** Darkens a hex colour so shadow shapes stay in the same family. */
function shade(hex: string, amount = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function Eyes({ y = 64, dx = 12, r = 6 }: { y?: number; dx?: number; r?: number }) {
  return (
    <g>
      <circle cx={64 - dx} cy={y} r={r} fill="#fff" />
      <circle cx={64 + dx} cy={y} r={r} fill="#fff" />
      <circle cx={64 - dx + 0.8} cy={y + 0.8} r={r * 0.55} fill={INK} />
      <circle cx={64 + dx + 0.8} cy={y + 0.8} r={r * 0.55} fill={INK} />
      <circle cx={64 - dx + 2.2} cy={y - 1.6} r={r * 0.2} fill="#fff" />
      <circle cx={64 + dx + 2.2} cy={y - 1.6} r={r * 0.2} fill="#fff" />
    </g>
  );
}

/** Shoulders in the player's colour — the piece of every portrait that matches. */
function Jersey({ accent }: { accent: string }) {
  return (
    <g>
      <path d="M64 92c-19 0-32 10-36 22-1.4 4-2 8-2 14h76c0-6-.6-10-2-14-4-12-17-22-36-22Z" fill={accent} />
      <path d="M64 92c-6 0-11 1-15 2.6l15 12 15-12C75 93 70 92 64 92Z" fill={shade(accent, 0.78)} />
      <path d="M28 128c0-6 .6-10 2-14 1.6-4.6 4.6-8.6 8.6-11.6l4 25.6H28Z" fill={shade(accent, 0.86)} />
    </g>
  );
}

/** Soft light across the top of the head, so flat fills still read as volume. */
function Sheen({ cx = 64, cy = 52, rx = 22, ry = 13 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={0.09} />;
}

function Ace({ accent }: { accent: string }) {
  const c = CHARACTERS.hat;
  return (
    <g>
      <Jersey accent={accent} />
      <circle cx={64} cy={66} r={31} fill={c.skin} />
      <path d="M64 46a31 31 0 0 1 26 48 31 31 0 0 1-52 0 31 31 0 0 1 26-48Z" fill={c.patch} opacity={0.96} />
      <path d="M64 35c17 0 31 14 31 31 0 6-2 12-5 17-6-16-15-25-26-25s-20 9-26 25c-3-5-5-11-5-17 0-17 14-31 31-31Z" fill={c.skin} />
      <Sheen cy={50} />
      <Eyes y={66} dx={12} r={6.4} />
      <path d="M64 72l11 8-11 9-11-9 11-8Z" fill="#f0a03c" />
      <path d="M53 80l11 8 11-8-11 3-11-3Z" fill={shade('#f0a03c', 0.78)} />
      {/* top hat */}
      <ellipse cx={64} cy={40} rx={32} ry={6.5} fill={INK} />
      <path d="M45 40c0-20 1-30 19-30s19 10 19 30Z" fill="#222b3a" />
      <rect x={45} y={30} width={38} height={8} fill={accent} />
      <path d="M47 16c3-3 10-5 17-5s14 2 17 5c-3-2-9-3-17-3s-14 1-17 3Z" fill="#3a465c" />
    </g>
  );
}

function Turbo({ accent }: { accent: string }) {
  const c = CHARACTERS.car;
  return (
    <g>
      <Jersey accent={accent} />
      <path d="M34 44l6 22-14-16 8-6Z" fill={c.skin} />
      <path d="M94 44l-6 22 14-16-8-6Z" fill={c.skin} />
      <path d="M36 47l4 14-8-9 4-5Z" fill={shade(c.skin, 0.62)} />
      <path d="M92 47l-4 14 8-9-4-5Z" fill={shade(c.skin, 0.62)} />
      <circle cx={64} cy={66} r={31} fill={c.skin} />
      <path d="M64 70c12 0 20 7 20 16 0 8-9 13-20 13s-20-5-20-13c0-9 8-16 20-16Z" fill={c.patch} />
      <Sheen cy={52} />
      <Eyes y={62} dx={12} r={6} />
      <ellipse cx={64} cy={82} rx={5.4} ry={4.2} fill={INK} />
      <path d="M64 86v5m0 0c-2.5 0-4.5-1.4-5.5-3m5.5 3c2.5 0 4.5-1.4 5.5-3" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      {/* goggles pushed up on the forehead */}
      <path d="M30 50h68v9H30z" fill={shade(accent, 0.6)} />
      <rect x={38} y={42} width={22} height={16} rx={7} fill="#cfe3f2" stroke={INK} strokeWidth={2.4} />
      <rect x={68} y={42} width={22} height={16} rx={7} fill="#cfe3f2" stroke={INK} strokeWidth={2.4} />
      <path d="M60 48h8v5h-8z" fill={accent} />
      <path d="M42 45c4-2 9-2 12 0-4-1-8-1-12 0Z" fill="#fff" opacity={0.85} />
    </g>
  );
}

function Pip({ accent }: { accent: string }) {
  const c = CHARACTERS.ship;
  return (
    <g>
      <Jersey accent={accent} />
      <circle cx={64} cy={66} r={31} fill={c.skin} />
      <ellipse cx={64} cy={74} rx={18.5} ry={20} fill={c.patch} />
      <Sheen cy={50} />
      <Eyes y={64} dx={11} r={6.2} />
      <path d="M64 74c5 0 9 3 9 6s-4 6-9 6-9-3-9-6 4-6 9-6Z" fill="#f4a83a" />
      <path d="M55 80c2 2 5 3 9 3s7-1 9-3c0 3-4 6-9 6s-9-3-9-6Z" fill={shade('#f4a83a', 0.75)} />
      {/* sailor cap */}
      <path d="M33 44h62c0 4-2 6-6 6H39c-4 0-6-2-6-6Z" fill="#eef3f9" />
      <path d="M38 44c0-14 10-21 26-21s26 7 26 21Z" fill="#f7fafd" />
      <path d="M38 40h52v5H38z" fill={accent} />
      <circle cx={64} cy={30} r={5} fill={accent} />
      <path d="M61 30h6M64 27v6" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

function Scotty({ accent }: { accent: string }) {
  const c = CHARACTERS.dog;
  return (
    <g>
      <Jersey accent={accent} />
      <path d="M38 30c8 0 12 8 12 18l-14 6c-4-8-4-18 2-24Z" fill={c.skin} />
      <path d="M90 30c-8 0-12 8-12 18l14 6c4-8 4-18-2-24Z" fill={c.skin} />
      <circle cx={64} cy={64} r={30} fill={c.skin} />
      <path d="M64 66c13 0 21 8 21 18 0 7-9 12-21 12s-21-5-21-12c0-10 8-18 21-18Z" fill={c.patch} />
      <Sheen cy={50} />
      {/* shaggy brows */}
      <path d="M44 54c5-4 12-4 16 0-5-1.6-11-1.6-16 0Z" fill={c.patch} />
      <path d="M84 54c-5-4-12-4-16 0 5-1.6 11-1.6 16 0Z" fill={c.patch} />
      <Eyes y={62} dx={12} r={5.8} />
      <ellipse cx={64} cy={78} rx={6.4} ry={5} fill={INK} />
      <path d="M64 83v6" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M56 90c3 3 13 3 16 0" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      {/* bandana */}
      <path d="M40 96c14 7 34 7 48 0l4 10c-17 9-39 9-56 0Z" fill={accent} />
      <path d="M40 96c14 7 34 7 48 0l1 2c-15 8-35 8-50 0Z" fill="#fff" opacity={0.25} />
    </g>
  );
}

function Trek({ accent }: { accent: string }) {
  const c = CHARACTERS.boot;
  return (
    <g>
      <Jersey accent={accent} />
      <circle cx={38} cy={42} r={12} fill={c.skin} />
      <circle cx={90} cy={42} r={12} fill={c.skin} />
      <circle cx={38} cy={42} r={6} fill={shade(c.skin, 0.72)} />
      <circle cx={90} cy={42} r={6} fill={shade(c.skin, 0.72)} />
      <circle cx={64} cy={66} r={31} fill={c.skin} />
      <ellipse cx={64} cy={80} rx={19} ry={15} fill={c.patch} />
      <Sheen cy={52} />
      <Eyes y={62} dx={12} r={5.6} />
      <ellipse cx={64} cy={74} rx={6.6} ry={5} fill={INK} />
      <path d="M64 79v4m0 0c-2.6 0-5-1.6-6-3.4m6 3.4c2.6 0 5-1.6 6-3.4" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      {/* beanie */}
      <path d="M35 48c0-17 13-27 29-27s29 10 29 27Z" fill={accent} />
      <rect x={33} y={46} width={62} height={9} rx={4} fill={shade(accent, 0.74)} />
      <circle cx={64} cy={20} r={6} fill={shade(accent, 0.86)} />
      <path d="M46 30c4-5 11-8 18-8" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.35} fill="none" />
    </g>
  );
}

function Pin({ accent }: { accent: string }) {
  const c = CHARACTERS.thimble;
  return (
    <g>
      <Jersey accent={accent} />
      {/* spines */}
      <path d="M64 24 71 8l3 17 10-13 -1 17 14-10-7 15 17-4-13 12 17 3-16 7 13 11-17-2 7 15-14-10 1 17-10-13-3 17-7-16-7 16-3-17-10 13 1-17-14 10 7-15-17 2 13-11-16-7 17-3-13-12 17 4-7-15 14 10-1-17 10 13 3-17Z" fill={shade(c.skin, 0.74)} />
      <circle cx={64} cy={70} r={28} fill={c.patch} />
      <path d="M64 42c18 0 30 12 30 28 0 4-1 8-2 11-5-14-14-22-28-22s-23 8-28 22c-1-3-2-7-2-11 0-16 12-28 30-28Z" fill={c.skin} />
      <Sheen cy={58} rx={18} />
      <Eyes y={70} dx={11} r={5.6} />
      <path d="M64 78l7 6-7 6-7-6 7-6Z" fill={INK} />
      <path d="M57 90c4 3 10 3 14 0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      {/* thimble cap */}
      <path d="M48 36c0-9 7-15 16-15s16 6 16 15Z" fill={accent} />
      <path d="M46 36h36v7H46z" fill={shade(accent, 0.72)} />
      <g fill="#fff" opacity={0.35}>
        <circle cx={56} cy={30} r={1.6} /><circle cx={64} cy={27} r={1.6} /><circle cx={72} cy={30} r={1.6} />
        <circle cx={60} cy={34} r={1.6} /><circle cx={68} cy={34} r={1.6} />
      </g>
    </g>
  );
}

function Sprout({ accent }: { accent: string }) {
  const c = CHARACTERS.barrow;
  return (
    <g>
      <Jersey accent={accent} />
      <path d="M46 12c6 0 10 10 10 24s-4 20-10 20-10-6-10-20 4-24 10-24Z" fill={c.skin} />
      <path d="M82 12c6 0 10 10 10 24s-4 20-10 20-10-6-10-20 4-24 10-24Z" fill={c.skin} />
      <path d="M46 20c3 0 5 6 5 16s-2 13-5 13-5-3-5-13 2-16 5-16Z" fill="#f0b9c4" />
      <path d="M82 20c3 0 5 6 5 16s-2 13-5 13-5-3-5-13 2-16 5-16Z" fill="#f0b9c4" />
      <circle cx={64} cy={68} r={30} fill={c.skin} />
      <ellipse cx={64} cy={80} rx={17} ry={13} fill={c.patch} />
      <Sheen cy={56} />
      <Eyes y={66} dx={12} r={5.8} />
      <path d="M64 74l6 5-6 5-6-5 6-5Z" fill="#e08d9c" />
      <path d="M64 84v4m0 0c-3 0-5-1.6-6-3.4m6 3.4c3 0 5-1.6 6-3.4" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M52 88h-9m9 4h-8M76 88h9m-9 4h8" stroke={shade(c.skin, 0.72)} strokeWidth={2} strokeLinecap="round" />
      {/* sun hat */}
      <ellipse cx={64} cy={48} rx={38} ry={10} fill="#e7c987" />
      <path d="M44 48c0-13 9-20 20-20s20 7 20 20Z" fill="#f0d79b" />
      <path d="M44 44h40v6H44z" fill={accent} />
      <path d="M84 44l10 6-12 1Z" fill={shade(accent, 0.8)} />
    </g>
  );
}

function Nimbus({ accent }: { accent: string }) {
  const c = CHARACTERS.iron;
  return (
    <g>
      <Jersey accent={accent} />
      <path d="M34 44c-1-9 3-13 9-9l9 8-18 1Z" fill={c.skin} />
      <path d="M94 44c1-9-3-13-9-9l-9 8 18 1Z" fill={c.skin} />
      <circle cx={64} cy={66} r={31} fill={c.skin} />
      <path d="M64 40c14 0 24 8 24 20 0 9-6 15-14 15h-20c-8 0-14-6-14-15 0-12 10-20 24-20Z" fill={c.patch} />
      <Sheen cy={50} />
      <circle cx={52} cy={62} r={11} fill="#fff" />
      <circle cx={76} cy={62} r={11} fill="#fff" />
      <circle cx={53} cy={63} r={6} fill={INK} />
      <circle cx={77} cy={63} r={6} fill={INK} />
      <circle cx={55} cy={60} r={2} fill="#fff" />
      <circle cx={79} cy={60} r={2} fill="#fff" />
      <path d="M64 68l7 8-7 7-7-7 7-8Z" fill="#f4b23a" />
      <path d="M57 76l7 7 7-7-7 3-7-3Z" fill={shade('#f4b23a', 0.78)} />
      {/* scarf */}
      <path d="M38 94c16 8 36 8 52 0l3 8c-18 9-40 9-58 0Z" fill={accent} />
      <path d="M88 100l10 14-9 2-5-13Z" fill={shade(accent, 0.8)} />
    </g>
  );
}

const ART: Record<TokenId, (p: { accent: string }) => JSX.Element> = {
  hat: Ace, car: Turbo, ship: Pip, dog: Scotty,
  boot: Trek, thimble: Pin, barrow: Sprout, iron: Nimbus,
};

interface PortraitProps {
  token: TokenId;
  color: string;
  size?: number;
  /** Draws the rounded colour-washed plate behind the character. */
  plate?: boolean;
  className?: string;
}

export function CharacterArt({ token, color, size = 96, plate = true, className }: PortraitProps) {
  const Art = ART[token] ?? Ace;
  const id = `${token}-${color.replace('#', '')}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={CHARACTERS[token]?.name ?? 'Player character'}
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <rect x={0} y={0} width={128} height={128} rx={30} />
        </clipPath>
        <radialGradient id={`bg-${id}`} cx="50%" cy="26%" r="78%">
          <stop offset="0%" stopColor={color} stopOpacity={0.42} />
          <stop offset="100%" stopColor={color} stopOpacity={0.08} />
        </radialGradient>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        {plate && <rect width={128} height={128} fill={`url(#bg-${id})`} />}
        {plate && <circle cx={64} cy={70} r={44} fill="#000" opacity={0.14} />}
        <Art accent={color} />
      </g>
      {plate && <rect x={0.8} y={0.8} width={126.4} height={126.4} rx={29} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.6} />}
    </svg>
  );
}

/** Small round avatar for rails, seats and log lines. */
export function CharacterAvatar({ token, color, size = 30, className }: PortraitProps) {
  const Art = ART[token] ?? Ace;
  const id = `av-${token}-${color.replace('#', '')}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 128 128" role="img" aria-hidden="true">
      <defs>
        <clipPath id={`c-${id}`}><circle cx={64} cy={64} r={64} /></clipPath>
      </defs>
      <g clipPath={`url(#c-${id})`}>
        <rect width={128} height={128} fill={color} opacity={0.22} />
        <g transform="translate(0, 6) scale(1.04) translate(-2.5, -2.5)">
          <Art accent={color} />
        </g>
      </g>
      <circle cx={64} cy={64} r={62} fill="none" stroke={color} strokeWidth={5} />
    </svg>
  );
}
