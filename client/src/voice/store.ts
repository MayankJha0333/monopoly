/**
 * Voice and video at a private table, on top of LiveKit.
 *
 * The heavy LiveKit code is only fetched when someone actually joins a call,
 * so players who never use it never download it. Everything the interface
 * needs — who is in the call, who is speaking, whose camera is on — is kept
 * in this small store.
 */
import { create } from 'zustand';
import type {
  LocalParticipant, Participant, Room, RoomEvent, Track,
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
  camOn: boolean;
  /** Set on the <video> element by the tile that shows this peer. */
  attachVideo: (el: HTMLVideoElement | null) => void;
  attachAudio: (el: HTMLAudioElement | null) => void;
}

interface VoiceStore {
  status: VoiceStatus;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  peers: VoicePeer[];
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
}

let room: Room | null = null;

/** Asks the game server for a pass for the table we are sitting at. */
const ticket = () =>
  new Promise<{ ok: boolean; url?: string; token?: string; error?: string }>((resolve) => {
    const s = socket as unknown as { emit: (e: string, cb: (r: unknown) => void) => void };
    const done = (r: unknown) => resolve((r ?? { ok: false }) as { ok: boolean });
    s.emit('voice:token', done);
    setTimeout(() => resolve({ ok: false, error: 'The server did not answer. Try again.' }), 8000);
  });

function peersOf(r: Room): VoicePeer[] {
  const all: Participant[] = [r.localParticipant as LocalParticipant, ...r.remoteParticipants.values()];
  return all.map((p) => {
    const cam = p.getTrackPublication('camera' as Track.Source);
    const mic = p.getTrackPublication('microphone' as Track.Source);
    return {
      id: p.identity,
      name: p.name || p.identity,
      me: p.isLocal,
      speaking: p.isSpeaking,
      micOn: !!mic && !mic.isMuted && !!mic.track,
      camOn: !!cam && !cam.isMuted && !!cam.track,
      attachVideo: (el) => {
        const t = cam?.track;
        if (!t) return;
        if (el) t.attach(el); else t.detach();
      },
      attachAudio: (el) => {
        // Your own microphone is never played back to you.
        const t = p.isLocal ? null : mic?.track;
        if (!t) return;
        if (el) t.attach(el); else t.detach();
      },
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
  camOn: false,
  peers: [],

  join: async () => {
    if (get().status === 'joining' || get().status === 'live') return;
    set({ status: 'joining', error: null });
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
      for (const e of [
        ev.ParticipantConnected, ev.ParticipantDisconnected, ev.TrackSubscribed,
        ev.TrackUnsubscribed, ev.TrackMuted, ev.TrackUnmuted, ev.LocalTrackPublished,
        ev.LocalTrackUnpublished, ev.ActiveSpeakersChanged,
      ]) r.on(e as never, refresh as never);
      r.on(ev.Disconnected as never, (() => {
        room = null;
        set({ status: 'off', peers: [], camOn: false });
      }) as never);

      await r.connect(pass.url, pass.token);
      await r.localParticipant.setMicrophoneEnabled(get().micOn);
      set({ status: 'live', peers: peersOf(r) });
    } catch (e) {
      room = null;
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
    set({ status: 'off', peers: [], camOn: false, error: null });
    await r?.disconnect();
  },

  toggleMic: async () => {
    const on = !get().micOn;
    set({ micOn: on });
    await room?.localParticipant.setMicrophoneEnabled(on);
    refresh();
  },

  toggleCam: async () => {
    const on = !get().camOn;
    set({ camOn: on });
    try {
      await room?.localParticipant.setCameraEnabled(on);
    } catch {
      set({ camOn: false, error: 'Your browser blocked the camera.' });
    }
    refresh();
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
