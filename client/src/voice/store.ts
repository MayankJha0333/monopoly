/**
 * Voice and video at a private table, on top of LiveKit.
 *
 * The heavy LiveKit code is only fetched when someone actually joins a call,
 * so players who never use it never download it.
 *
 * Incoming *sound* is deliberately kept away from React: each voice is played
 * by its own hidden element parked in the page, made when the track arrives
 * and thrown away when it goes. Rebuilding those elements on every re-render —
 * and "who is speaking" changes several times a second — cuts the sound off
 * each time, which is the fault this fixes. Only the *picture* is handled by
 * the interface, where a re-render costs nothing.
 */
import { create } from 'zustand';
import type {
  LocalParticipant, Participant, RemoteTrack, Room, RoomEvent, Track, TrackPublication,
} from 'livekit-client';
import { socket } from '@/net/socket';
import { useGame } from '@/store/game';

export type VoiceStatus = 'off' | 'joining' | 'live' | 'error';

export interface VoicePeer {
  id: string;
  name: string;
  me: boolean;
  speaking: boolean;
  micOn: boolean;
}

interface VoiceStore {
  status: VoiceStatus;
  error: string | null;
  micOn: boolean;
  /** Set when the player chose to leave, so they are not put straight back. */
  optedOut: boolean;
  /** True while the browser holds the sound back until the player taps. */
  needsTap: boolean;
  /** How many other voices are actually arriving and playing. */
  voices: number;
  /** How loud your own microphone is, 0 to 1 — proof that it is working. */
  level: number;
  peers: VoicePeer[];
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  /** Host only: silences someone else at the table. */
  muteOther: (playerId: string) => void;
  /** Starts held-back sound. Must be called from a click. */
  allowSound: () => Promise<void>;
}

let room: Room | null = null;

/** Hidden <audio> elements, one per voice, outside React's reach. */
let sink: HTMLDivElement | null = null;
const playing = new Map<string, HTMLAudioElement>();

function sinkEl(): HTMLDivElement {
  if (!sink) {
    sink = document.createElement('div');
    sink.id = 'voice-audio';
    sink.style.display = 'none';
    document.body.appendChild(sink);
  }
  return sink;
}

function playTrack(track: RemoteTrack, id: string) {
  if (track.kind !== 'audio') return;
  stopTrack(id);
  const el = track.attach() as HTMLAudioElement;
  el.autoplay = true;
  el.dataset.voice = id;
  sinkEl().appendChild(el);
  void el.play().catch(() => useVoice.setState({ needsTap: true }));
  playing.set(id, el);
  useVoice.setState({ voices: playing.size });
}

function stopTrack(id: string) {
  const el = playing.get(id);
  if (!el) return;
  el.pause();
  el.srcObject = null;
  el.remove();
  playing.delete(id);
  useVoice.setState({ voices: playing.size });
}

function stopAllTracks() {
  for (const id of [...playing.keys()]) stopTrack(id);
}

/**
 * Watches how loud your own microphone is. Without this there is no way to
 * tell a silent call from a microphone that never opened.
 */
let meter: { ctx: AudioContext; timer: number } | null = null;

function startMeter(track: MediaStreamTrack) {
  stopMeter();
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const node = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    node.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      useVoice.setState({ level: Math.min(1, peak * 1.8) });
    }, 120);
    meter = { ctx, timer };
  } catch { /* the meter is a nicety */ }
}

function stopMeter() {
  if (!meter) return;
  clearInterval(meter.timer);
  void meter.ctx.close();
  meter = null;
  useVoice.setState({ level: 0 });
}

/** Asks the game server for a pass for the table we are sitting at. */
const ticket = () =>
  new Promise<{ ok: boolean; url?: string; token?: string; error?: string }>((resolve) => {
    const s = socket as unknown as { emit: (e: string, cb: (r: unknown) => void) => void };
    s.emit('voice:token', (r: unknown) => resolve((r ?? { ok: false }) as { ok: boolean }));
    setTimeout(() => resolve({ ok: false, error: 'The server did not answer. Try again.' }), 8000);
  });

function peersOf(r: Room): VoicePeer[] {
  const all: Participant[] = [r.localParticipant as LocalParticipant, ...r.remoteParticipants.values()];
  return all.map((p) => {
    const mic: TrackPublication | undefined = p.getTrackPublication('microphone' as Track.Source);
    return {
      id: p.identity,
      name: p.name || p.identity,
      me: p.isLocal,
      speaking: p.isSpeaking,
      // For someone else, a published and unmuted microphone counts even
      // before their sound has finished arriving.
      micOn: !!mic && !mic.isMuted && (!!mic.track || !p.isLocal),
    };
  });
}

const refresh = () => {
  if (room) useVoice.setState({ peers: peersOf(room) });
};

export const useVoice = create<VoiceStore>((set, get) => ({
  status: 'off',
  error: null,
  micOn: true,
  optedOut: false,
  needsTap: false,
  voices: 0,
  level: 0,
  peers: [],

  join: async () => {
    if (get().status === 'joining' || get().status === 'live') return;
    set({ status: 'joining', error: null, needsTap: false, optedOut: false });
    const pass = await ticket();
    if (!pass.ok || !pass.url || !pass.token) {
      set({ status: 'error', error: pass.error ?? 'Voice chat is not available right now.' });
      return;
    }
    try {
      const lk = await import('livekit-client');
      const r = new lk.Room({ adaptiveStream: true, dynacast: true });
      room = r;
      const ev = lk.RoomEvent as typeof RoomEvent;

      // Sound: play each voice as it arrives, drop it when it leaves.
      r.on(ev.TrackSubscribed as never, ((track: RemoteTrack, pub: TrackPublication, who: Participant) => {
        if (track.kind === 'audio') playTrack(track, `${who.identity}:${pub.trackSid}`);
        refresh();
      }) as never);
      r.on(ev.TrackUnsubscribed as never, ((_t: RemoteTrack, pub: TrackPublication, who: Participant) => {
        stopTrack(`${who.identity}:${pub.trackSid}`);
        refresh();
      }) as never);

      // Faces and names only.
      for (const e of [
        ev.ParticipantConnected, ev.ParticipantDisconnected, ev.TrackMuted, ev.TrackUnmuted,
        ev.LocalTrackPublished, ev.LocalTrackUnpublished, ev.ActiveSpeakersChanged,
      ]) r.on(e as never, refresh as never);

      // The host can silence you from their side; the button must follow.
      r.on(ev.TrackMuted as never, ((_pub: TrackPublication, who: Participant) => {
        if (who.isLocal) { set({ micOn: false }); stopMeter(); }
      }) as never);

      // Browsers can hold sound back until the page has been interacted with.
      r.on(ev.AudioPlaybackStatusChanged as never, (() => {
        set({ needsTap: !r.canPlaybackAudio });
      }) as never);

      r.on(ev.Disconnected as never, (() => {
        room = null;
        stopAllTracks();
        stopMeter();
        set({ status: 'off', peers: [], needsTap: false, voices: 0 });
      }) as never);

      await r.connect(pass.url, pass.token);
      // Joining was a click, which is the moment browsers accept sound.
      try { await r.startAudio(); } catch { /* the Hear everyone button asks again */ }

      // A microphone that will not open must not keep you out of the call:
      // you can still hear everyone, and the bar says your microphone is off.
      let micError: string | null = null;
      try {
        await r.localParticipant.setMicrophoneEnabled(get().micOn);
      } catch (e) {
        const m = (e as Error).message || '';
        micError = /not found|NotFound/i.test(m)
          ? 'No microphone found. You can hear everyone, but they cannot hear you.'
          : 'Your browser blocked the microphone. You can hear everyone; allow it in the address bar to talk.';
      }
      const mine = r.localParticipant.getTrackPublication('microphone' as Track.Source)?.track
        ?.mediaStreamTrack;
      if (mine) startMeter(mine);
      set({
        status: 'live',
        peers: peersOf(r),
        needsTap: !r.canPlaybackAudio,
        micOn: micError ? false : get().micOn,
        error: micError,
        voices: playing.size,
      });
    } catch (e) {
      const failed = room;
      room = null;
      stopAllTracks();
      // Let go of a half-open call, so it does not sit there holding a seat.
      try { await failed?.disconnect(); } catch { /* already gone */ }
      const msg = (e as Error).message || 'Could not join the call.';
      set({
        status: 'error',
        error: /permission|denied|NotAllowed/i.test(msg)
          ? 'Your browser blocked the microphone. Allow it in the address bar and try again.'
          : msg,
      });
    }
  },

  leave: async () => {
    const r = room;
    room = null;
    stopAllTracks();
    stopMeter();
    set({ status: 'off', peers: [], error: null, needsTap: false, voices: 0, level: 0, optedOut: true });
    await r?.disconnect();
  },

  toggleMic: async () => {
    const on = !get().micOn;
    set({ micOn: on });
    try {
      await room?.localParticipant.setMicrophoneEnabled(on);
      const mine = room?.localParticipant.getTrackPublication('microphone' as Track.Source)?.track
        ?.mediaStreamTrack;
      if (on && mine) startMeter(mine); else stopMeter();
      if (on) set({ error: null });
    } catch {
      set({ micOn: false, error: 'Your browser will not open the microphone. Check its site settings.' });
      stopMeter();
    }
    refresh();
  },

  muteOther: (playerId: string) => {
    const s = socket as unknown as { emit: (e: string, p: unknown) => void };
    s.emit('voice:mute', { playerId });
  },


  allowSound: async () => {
    try {
      await room?.startAudio();
      for (const el of playing.values()) await el.play().catch(() => undefined);
    } catch { /* leave the button up */ }
    set({ needsTap: room ? !room.canPlaybackAudio : false });
  },
}));

/** Leaving the table also leaves the call. */
useGame.subscribe((s, prev) => {
  if (prev.state && !s.state && useVoice.getState().status !== 'off') void useVoice.getState().leave();
});

// Closing the tab or navigating away hangs up too, so the microphone light
// goes out and nobody is left as a silent face in the call.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (useVoice.getState().status !== 'off') void useVoice.getState().leave();
  });
}
