import { Howl } from 'howler';

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

let muted = localStorage.getItem('sunnyport.muted') === '1';

/* ----------------------------------------------------------------- music */

const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOP = BAR * 4;

/** MIDI note number to hertz. */
const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Am7 - Fmaj7 - Cmaj7 - G6, one bar each: easy lounge harmony. */
const CHORDS: number[][] = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 55, 64, 67],
  [55, 59, 62, 64],
];

const pluck = (k: number) => (t: number, dur: number) =>
  Math.exp((-k * t) / dur) * Math.min(1, t * 90);

function musicBed(): Float32Array {
  const layers: Layer[] = [];

  CHORDS.forEach((chord, bar) => {
    const at = bar * BAR;

    // Pad: the chord held under everything, fading in and out of each bar.
    for (const note of chord) {
      const f = hz(note - 12);
      layers.push({
        shape: (t) => Math.sin(2 * Math.PI * f * t) + 0.34 * Math.sin(4 * Math.PI * f * t),
        env: (t, dur) => Math.sin((Math.PI * t) / dur) ** 1.4,
        gain: 0.07, delay: at, dur: BAR,
      });
    }

    // Bass on one and three.
    for (const beat of [0, 2]) {
      const f = hz(chord[0]! - 24);
      layers.push({
        shape: (t) => Math.sin(2 * Math.PI * f * t),
        env: pluck(6), gain: 0.16, delay: at + beat * BEAT, dur: BEAT * 1.6,
      });
    }

    // A soft arpeggio walking up the chord on the off-beats.
    for (let step = 0; step < 8; step++) {
      if (step % 2 === 1 && step !== 3) continue;
      const note = chord[(step + bar) % chord.length]! + (step > 4 ? 12 : 0);
      const f = hz(note);
      layers.push({
        shape: (t) => Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(6 * Math.PI * f * t),
        env: pluck(9), gain: 0.055, delay: at + step * (BEAT / 2), dur: BEAT * 0.9,
      });
    }

    // A brushed shaker keeps time without ever asking for attention.
    for (let beat = 0; beat < 4; beat++) {
      layers.push({
        shape: noise(), env: decay(26),
        gain: beat % 2 === 1 ? 0.05 : 0.028,
        delay: at + beat * BEAT, dur: 0.12,
      });
    }
  });

  return render(layers, LOOP);
}

const MUSIC_KEY = 'sunnyport.music';
let musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
let music: Howl | null = null;
let musicWanted = false;

const MUSIC_VOLUME = 0.2;

function ensureMusic(): Howl | null {
  if (music) return music;
  try {
    music = new Howl({
      src: [toWavUri(musicBed())],
      format: ['wav'],
      loop: true,
      volume: 0,
    });
  } catch {
    music = null;
  }
  return music;
}

/** Starts the loop, fading it in so it never barges into the room. */
export function startMusic() {
  musicWanted = true;
  if (!musicOn || muted) return;
  // Building the loop is a moment's work, so keep it off the first paint.
  setTimeout(() => {
    if (!musicWanted || !musicOn || muted) return;
    const howl = ensureMusic();
    if (!howl) return;
    if (!howl.playing()) howl.play();
    howl.fade(howl.volume(), MUSIC_VOLUME, 1400);
  }, 400);
}

export function stopMusic(keepWanted = false) {
  if (!keepWanted) musicWanted = false;
  if (!music || !music.playing()) return;
  music.fade(music.volume(), 0, 500);
  const handle = music;
  setTimeout(() => { if (handle.volume() < 0.02) handle.pause(); }, 560);
}

export function setMusicEnabled(on: boolean) {
  musicOn = on;
  localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  if (on) startMusic();
  else stopMusic(true);
}

export const isMusicOn = () => musicOn;

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
  localStorage.setItem('sunnyport.muted', next ? '1' : '0');
  if (next) stopMusic(true);
  else if (musicWanted) startMusic();
}

export const isMuted = () => muted;
