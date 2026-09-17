import { Howl, Howler } from 'howler';
import { islandBreeze } from './music';

/**
 * Sounds are synthesised into WAV data URIs at load time, so the game ships
 * with no binary audio assets and still has a full sound bed.
 */

const RATE = 22050;

type Shape = (t: number, dur: number) => number;

const noise = (): Shape => () => Math.random() * 2 - 1;
const sine = (freq: number): Shape => (t) => Math.sin(2 * Math.PI * freq * t);
const sweep = (from: number, to: number): Shape => (t, dur) => {
  const f = from + (to - from) * (t / dur);
  return Math.sin(2 * Math.PI * f * t);
};
const decay = (k: number) => (t: number, dur: number) => Math.exp((-k * t) / dur);

interface Layer {
  shape: Shape;
  env?: (t: number, dur: number) => number;
  gain?: number;
  delay?: number;
  dur?: number;
}

function render(layers: Layer[], total: number): Float32Array {
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  for (const layer of layers) {
    const start = Math.floor((layer.delay ?? 0) * RATE);
    const dur = layer.dur ?? total - (layer.delay ?? 0);
    const len = Math.min(n - start, Math.ceil(dur * RATE));
    const env = layer.env ?? decay(5);
    const gain = layer.gain ?? 1;
    for (let i = 0; i < len; i++) {
      const t = i / RATE;
      out[start + i]! += layer.shape(t, dur) * env(t, dur) * gain;
    }
  }
  // Soft clip so stacked layers never crackle.
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i]! * 0.9);
  return out;
}

function toWavUri(samples: Float32Array): string {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 32767, true);
  }
  let binary = '';
  const raw = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 4096) {
    binary += String.fromCharCode(...raw.subarray(i, i + 4096));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const RECIPES: Record<string, () => Float32Array> = {
  dice: () => render(
    [0, 0.09, 0.17, 0.26].map((delay, i) => ({
      shape: noise(), delay, dur: 0.09, gain: 0.5 - i * 0.08, env: decay(14),
    })),
    0.45,
  ),
  step: () => render([{ shape: noise(), dur: 0.04, gain: 0.35, env: decay(18) }], 0.05),
  cash: () => render([
    { shape: sine(1180), gain: 0.35, env: decay(7) },
    { shape: sine(1760), gain: 0.28, delay: 0.06, env: decay(7) },
    { shape: sine(2360), gain: 0.18, delay: 0.12, env: decay(8) },
  ], 0.42),
  buy: () => render([{ shape: sweep(420, 900), gain: 0.4, env: decay(6) }], 0.3),
  build: () => render([
    { shape: noise(), dur: 0.05, gain: 0.4, env: decay(20) },
    { shape: sine(220), gain: 0.4, env: decay(9) },
  ], 0.25),
  card: () => render([{ shape: sweep(2600, 600), gain: 0.22, env: decay(6) }], 0.3),
  jail: () => render([
    { shape: sine(150), gain: 0.5, env: decay(4) },
    { shape: sine(226), gain: 0.3, env: decay(5) },
    { shape: noise(), dur: 0.08, gain: 0.25, env: decay(12) },
  ], 0.7),
  unlock: () => render([
    { shape: sine(880), gain: 0.3, env: decay(8) },
    { shape: sine(1320), gain: 0.25, delay: 0.07, env: decay(8) },
  ], 0.4),
  gavel: () => render([
    { shape: sine(180), dur: 0.09, gain: 0.5, env: decay(16) },
    { shape: sine(180), delay: 0.13, dur: 0.09, gain: 0.45, env: decay(16) },
  ], 0.3),
  trade: () => render([
    { shape: sine(660), gain: 0.3, env: decay(9) },
    { shape: sine(990), gain: 0.3, delay: 0.09, env: decay(9) },
  ], 0.35),
  bankrupt: () => render([{ shape: sweep(520, 90), gain: 0.4, env: decay(3) }], 0.9),
  win: () => render(
    [523, 659, 784, 1047].map((f, i) => ({
      shape: sine(f), delay: i * 0.11, dur: 0.5, gain: 0.3, env: decay(5),
    })),
    1.1,
  ),
  click: () => render([{ shape: sine(1400), dur: 0.03, gain: 0.22, env: decay(16) }], 0.05),
};

let muted = (() => { try { return localStorage.getItem('rentrush.muted') === '1'; } catch { return false; } })();

/* ----------------------------------------------------------------- music */

const MUSIC_KEY = 'rentrush.music';
let musicOn = (() => { try { return localStorage.getItem(MUSIC_KEY) !== '0'; } catch { return true; } })();
let musicWanted = false;

/** Browsers only allow sound after a tap or key press, so start on the first one. */
function armUnlock() {
  const go = () => {
    if (musicWanted && musicOn && !muted) islandBreeze.start();
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}
if (typeof window !== 'undefined') armUnlock();

/** Starts the background tune, fading it in. */
export function startMusic() {
  musicWanted = true;
  if (!musicOn || muted) return;
  islandBreeze.start();
}

export function stopMusic(keepWanted = false) {
  if (!keepWanted) musicWanted = false;
  islandBreeze.stop();
}

export function setMusicEnabled(on: boolean) {
  musicOn = on;
  try { localStorage.setItem(MUSIC_KEY, on ? '1' : '0'); } catch { /* private mode */ }
  if (on) { musicWanted = true; startMusic(); }
  else stopMusic(true);
}

export const isMusicOn = () => musicOn;
export const getMusicVolume = () => islandBreeze.getVolume();
export const setMusicVolume = (v: number) => islandBreeze.setVolume(v);

const cache = new Map<string, Howl>();

function get(name: string): Howl | null {
  const recipe = RECIPES[name];
  if (!recipe) return null;
  let howl = cache.get(name);
  if (!howl) {
    howl = new Howl({ src: [toWavUri(recipe())], format: ['wav'], volume: 0.6 });
    cache.set(name, howl);
  }
  return howl;
}

export function play(name: string) {
  if (muted) return;
  try { get(name)?.play(); } catch { /* audio is a nicety, never fatal */ }
}

export function setMuted(next: boolean) {
  muted = next;
  try { localStorage.setItem('rentrush.muted', next ? '1' : '0'); } catch { /* private mode */ }
  if (next) stopMusic(true);
  else if (musicWanted) startMusic();
}

export const isMuted = () => muted;

/**
 * No sound at all while the game is not the window in use — another tab,
 * another app in front, or a page being closed.
 */
if (typeof window !== 'undefined') {
  const sync = () => {
    const active = document.visibilityState === 'visible' && document.hasFocus();
    try { Howler.mute(!active || muted); } catch { /* audio is a nicety */ }
  };
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('blur', sync);
  window.addEventListener('pagehide', () => { try { Howler.mute(true); } catch { /* ignore */ } });
  sync();
}
