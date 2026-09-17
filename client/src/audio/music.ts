/**
 * "Island Breeze" — the background music, played live with the Web Audio API.
 *
 * Nothing is loaded from disk. A small sequencer schedules notes a moment
 * ahead of time: a warm pad, a round bass, an off-beat ukulele strum, soft
 * percussion and a steel-drum melody that is made up fresh each time from
 * notes that always fit the chord, so the loop never sounds stuck.
 */

const BPM = 96;
const STEP = 60 / BPM / 4;          // one sixteenth note, in seconds
const LOOKAHEAD = 0.18;             // how far ahead to schedule, in seconds
const TICK_MS = 30;

/** MIDI note number to hertz. */
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Chord { root: number; tones: number[] }

// Key of F. Section A is sunny, section B lifts a little, then it comes home.
const A: Chord[] = [
  { root: 41, tones: [65, 69, 72, 76] },   // Fmaj7
  { root: 38, tones: [62, 65, 69, 72] },   // Dm7
  { root: 43, tones: [67, 70, 74, 77] },   // Gm7
  { root: 36, tones: [64, 67, 70, 72] },   // C7
];
const B: Chord[] = [
  { root: 46, tones: [65, 70, 74, 77] },   // Bbmaj7
  { root: 45, tones: [64, 67, 69, 72] },   // Am7
  { root: 43, tones: [65, 67, 70, 74] },   // Gm7
  { root: 36, tones: [65, 67, 70, 72] },   // C7sus
];
const FORM: Chord[] = [...A, ...A, ...B, ...A];

/** F major pentatonic across two octaves — every note sits well on every chord here. */
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

/** Melody rhythms for one bar: sixteenth positions and lengths (in steps). */
const RHYTHMS: [number, number][][] = [
  [[0, 3], [3, 3], [6, 2], [10, 4]],
  [[2, 2], [4, 2], [8, 6]],
  [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]],
  [[0, 6], [8, 2], [11, 3]],
  [[3, 3], [6, 3], [10, 2], [12, 2], [14, 2]],
  [[0, 4], [6, 2], [8, 8]],
];

const VOLUME_KEY = 'rentrush.musicVolume';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class IslandBreeze {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private reverbSend!: GainNode;
  private echoSend!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private melodyNote = 4;
  private rand = mulberry(Date.now() & 0xffff);
  private playing = false;
  private volume = (() => {
    try { const v = Number(localStorage.getItem(VOLUME_KEY)); return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.6; } catch { return 0.6; }
  })();

  getVolume() { return this.volume; }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOLUME_KEY, String(this.volume)); } catch { /* private mode */ }
    if (this.ctx && this.playing) {
      this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.1);
    }
  }

  private level() { return 0.62 * this.volume; }

  private setup(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass'; warm.frequency.value = 9000;
    this.master.connect(warm).connect(comp).connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.connect(this.master);

    // A soft room: a generated impulse response, no files needed.
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(verb).connect(this.master);

    // A dotted-eighth echo for the melody.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass'; echoTone.frequency.value = 2600;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.3;
    this.echoSend.connect(echo);
    echo.connect(echoTone).connect(fb).connect(echo);
    echoTone.connect(this.master);

    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = n.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = n;

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.playing) void this.ctx.resume();
    });
    return true;
  }

  start() {
    if (!this.setup() || !this.ctx) return;
    const ctx = this.ctx;
    void ctx.resume();
    if (this.playing) return;
    this.playing = true;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.level(), now + 2.5);
    if (this.timer === null) {
      this.step = 0;
      this.nextTime = now + 0.08;
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    }
  }

  stop(fade = 0.8) {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + fade);
    window.setTimeout(() => {
      if (this.playing) return;
      if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
      void this.ctx?.suspend();
    }, fade * 1000 + 100);
  }

  /** Unlocks audio on the first tap, as browsers require. */
  unlock() { if (this.ctx && this.playing) void this.ctx.resume(); }

  // ------------------------------------------------------------ sequencer

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    // After a long pause (tab in background), skip ahead instead of catching up.
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += STEP * (this.step % 2 === 1 ? 1.06 : 0.94); // a light swing
    }
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const chord = FORM[bar % FORM.length]!;
    const loop = Math.floor(bar / FORM.length);
    const intro = bar < 4;
    const sectionB = bar % FORM.length >= 8 && bar % FORM.length < 12;

    if (pos === 0) this.pad(chord, t, STEP * 16);

    // Bass: root on one, a pickup and the fifth.
    if (pos === 0) this.bass(chord.root, t, STEP * 5);
    if (pos === 6) this.bass(chord.root + 7, t, STEP * 2);
    if (pos === 10) this.bass(chord.root + 12, t, STEP * 2);
    if (pos === 12 && !intro) this.bass(chord.root + 7, t, STEP * 3);

    if (intro && bar < 2) return;

    // Off-beat ukulele strums.
    if (pos === 4 || pos === 12 || (pos === 14 && this.rand() < 0.4)) {
      this.strum(chord, t, pos === 14 ? 0.5 : 1);
    }

    if (intro) return;

    // Percussion.
    if (pos === 0 || pos === 8) this.kick(t);
    if (pos === 10 && this.rand() < 0.5) this.kick(t, 0.5);
    if (pos % 2 === 0) this.shaker(t, pos % 4 === 2 ? 0.9 : 0.45);
    else if (this.rand() < 0.35) this.shaker(t, 0.25);
    if (pos === 12 || (pos === 7 && this.rand() < 0.3)) this.rim(t);

    // Melody: rest now and then so the tune can breathe.
    if (pos === 0) this.barRhythm = (loop + bar) % 8 === 7 || this.rand() < 0.12
      ? [] : RHYTHMS[Math.floor(this.rand() * RHYTHMS.length)]!;
    for (const [at, len] of this.barRhythm) {
      if (at !== pos) continue;
      const note = this.pickNote(chord, at === 0);
      this.pan(note, t, STEP * len, sectionB ? 0.9 : 1);
      // Now and then, a little harmony a third below.
      if (len >= 4 && this.rand() < 0.3) this.pan(this.below(note), t + 0.02, STEP * len, 0.45);
    }
  }

  private barRhythm: [number, number][] = [];

  private pickNote(chord: Chord, strong: boolean): number {
    if (strong) {
      // Land on a chord tone near where the tune already is.
      const targets = SCALE.map((n, i) => ({ i, n })).filter(({ n }) => chord.tones.some((c) => (c - n) % 12 === 0));
      if (targets.length) {
        targets.sort((a, b) => Math.abs(a.i - this.melodyNote) - Math.abs(b.i - this.melodyNote));
        this.melodyNote = targets[Math.floor(this.rand() * Math.min(2, targets.length))]!.i;
        return SCALE[this.melodyNote]!;
      }
    }
    const move = [-2, -1, -1, 1, 1, 2, 0][Math.floor(this.rand() * 7)]!;
    this.melodyNote = Math.max(0, Math.min(SCALE.length - 1, this.melodyNote + move));
    if (this.melodyNote >= SCALE.length - 1 || this.melodyNote <= 0) this.melodyNote = 4;
    return SCALE[this.melodyNote]!;
  }

  private below(note: number): number {
    const i = SCALE.indexOf(note);
    return i >= 2 ? SCALE[i - 2]! : note - 5;
  }

  // ------------------------------------------------------------ instruments

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number, release: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur), release);
  }

  private pad(chord: Chord, t: number, dur: number) {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.8);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    filter.connect(g);
    g.connect(this.bus);
    g.connect(this.reverbSend);
    for (const n of chord.tones) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n - 12);
        o.detune.value = detune;
        o.connect(filter);
        o.start(t);
        o.stop(t + dur + 0.7);
      }
    }
  }

  private bass(note: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(note);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = hz(note);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    const g = ctx.createGain();
    this.env(g, t, 0.26, 0.01, dur * 0.6, 0.12);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.bus);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }

  private strum(chord: Chord, t: number, level: number) {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.6;
    filter.connect(this.bus);
    filter.connect(this.reverbSend);
    chord.tones.forEach((n, i) => {
      const at = t + i * 0.014;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      const g = ctx.createGain();
      this.env(g, at, 0.028 * level, 0.004, 0.02, 0.07);
      o.connect(g).connect(filter);
      o.start(at);
      o.stop(at + 0.5);
    });
  }

  private pan(note: number, t: number, dur: number, level = 1) {
    const ctx = this.ctx!;
    const f = hz(note);
    const g = ctx.createGain();
    this.env(g, t, 0.11 * level, 0.006, 0.02, Math.min(0.5, dur * 0.8));
    // A steel-drum colour: the fundamental plus a bright, slightly sharp overtone.
    for (const [mult, amp, type] of [[1, 1, 'sine'], [2.01, 0.35, 'sine'], [3.98, 0.12, 'triangle']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + dur + 1.2);
    }
    g.connect(this.bus);
    g.connect(this.echoSend);
    g.connect(this.reverbSend);
  }

  private kick(t: number, level = 1) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const g = ctx.createGain();
    this.env(g, t, 0.32 * level, 0.004, 0.03, 0.08);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.5);
  }

  private shaker(t: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    this.env(g, t, 0.05 * level, 0.008, 0.01, 0.025);
    src.connect(hp).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.15);
  }

  private rim(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, 0.12, 0.002, 0.005, 0.02);
    src.connect(bp).connect(g);
    g.connect(this.bus);
    g.connect(this.reverbSend);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.1);
  }
}

export const islandBreeze = new IslandBreeze();
