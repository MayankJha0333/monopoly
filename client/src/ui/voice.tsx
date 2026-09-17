import { useEffect, useRef } from 'react';
import { useGame } from '@/store/game';
import { play } from '@/audio/sfx';
import { useVoice } from '@/voice/store';

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

const ICON = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M9 9v3a3 3 0 0 0 4.7 2.5M15 11V6a3 3 0 0 0-5.9-.7M5 11a7 7 0 0 0 10.8 5.9M12 18v3M4 4l16 16',
  phone: 'M21 15.5v2a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 18.6 18.6 0 0 1-5.7-5.7 19 19 0 0 1-3-8.4A2 2 0 0 1 3.8 2h2a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7 9.7a15 15 0 0 0 5.7 5.7l1-1a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z',
};

/** True when this table has voice chat at all. */
export function useVoiceAvailable(): boolean {
  const state = useGame((s) => s.state);
  const ready = useGame((s) => s.voiceReady);
  return !!state && !state.quickMatch && ready;
}

/**
 * Puts everyone at a friends table into the call as they sit down — taking a
 * seat is itself the tap a browser needs before it will open a microphone —
 * and passes anything that goes wrong to the usual message strip, rather than
 * writing a running commentary on the page.
 */
export function useVoiceCall() {
  const available = useVoiceAvailable();
  const status = useVoice((s) => s.status);
  const optedOut = useVoice((s) => s.optedOut);
  const error = useVoice((s) => s.error);
  const needsTap = useVoice((s) => s.needsTap);
  const join = useVoice((s) => s.join);
  const allowSound = useVoice((s) => s.allowSound);
  const toast = useGame((s) => s.toast);
  const said = useRef<string | null>(null);

  useEffect(() => {
    if (available && status === 'off' && !optedOut) void join();
  }, [available, status, optedOut]);

  useEffect(() => {
    if (error && error !== said.current) { said.current = error; toast(error); }
    if (!error) said.current = null;
  }, [error]);

  // The browser can hold sound back until the page is touched; the next click
  // anywhere is a good enough moment to ask again.
  useEffect(() => {
    if (!needsTap) return undefined;
    const go = () => void allowSound();
    window.addEventListener('pointerdown', go, { once: true });
    return () => window.removeEventListener('pointerdown', go);
  }, [needsTap]);
}

/** What the call knows about one player, for their seat or player card. */
export function useVoiceOf(playerId: string) {
  const peers = useVoice((s) => s.peers);
  const level = useVoice((s) => s.level);
  const myMic = useVoice((s) => s.micOn);
  const peer = peers.find((p) => p.id === playerId);
  if (!peer) return null;
  return {
    inCall: true,
    me: peer.me,
    micOn: peer.me ? myMic : peer.micOn,
    speaking: peer.me ? myMic && level > 0.06 : peer.speaking,
  };
}

/**
 * The little microphone on a player's seat or card: filled while they talk,
 * crossed out when their microphone is off. The host gets a mute button on
 * everyone else.
 */
export function VoiceMark({ playerId, name }: { playerId: string; name: string }) {
  const state = useGame((s) => s.state);
  const me = useGame((s) => s.playerId);
  const muteOther = useVoice((s) => s.muteOther);
  const voice = useVoiceOf(playerId);
  const available = useVoiceAvailable();
  if (!available || !voice) return null;

  const iAmHost = !!state?.players.find((p) => p.id === me)?.isHost;
  const canMute = iAmHost && !voice.me && voice.micOn;

  if (canMute) {
    return (
      <button className="vmark" data-on={voice.micOn || undefined} data-loud={voice.speaking || undefined}
        title={`Mute ${name}`} aria-label={`Mute ${name}`}
        onClick={(e) => { e.stopPropagation(); play('click'); muteOther(playerId); }}>
        <Icon d={ICON.mic} size={13} />
      </button>
    );
  }
  return (
    <span className="vmark" data-on={voice.micOn || undefined} data-loud={voice.speaking || undefined}
      title={voice.micOn ? `${name} can talk` : `${name} is muted`}
      aria-label={voice.micOn ? `${name} is in the call` : `${name} is muted`}>
      <Icon d={voice.micOn ? ICON.mic : ICON.micOff} size={13} />
    </span>
  );
}

/**
 * Your own control: mute, and hang up or rejoin. Sits with the players, in
 * the lobby's Players card and in the game's top bar.
 */
export function VoiceControls({ compact = false }: { compact?: boolean }) {
  const available = useVoiceAvailable();
  const status = useVoice((s) => s.status);
  const micOn = useVoice((s) => s.micOn);
  const loud = useVoice((s) => s.level > 0.06);
  const peers = useVoice((s) => s.peers);
  const toggleMic = useVoice((s) => s.toggleMic);
  const leave = useVoice((s) => s.leave);
  const join = useVoice((s) => s.join);

  if (!available) return null;

  if (status !== 'live') {
    return (
      <button className="vc-pill" data-compact={compact || undefined} disabled={status === 'joining'}
        onClick={() => { play('click'); void join(); }}>
        <Icon d={ICON.phone} size={15} />
        <span>{status === 'joining' ? 'Connecting…' : 'Join voice'}</span>
      </button>
    );
  }

  return (
    <div className="vc-mine" data-compact={compact || undefined}>
      {!compact && <span className="vc-mine-count">{peers.length} in voice</span>}
      <button className="vc-btn" data-off={!micOn || undefined} data-loud={(micOn && loud) || undefined}
        title={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
        aria-label={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
        onClick={() => void toggleMic()}>
        <Icon d={micOn ? ICON.mic : ICON.micOff} size={16} />
      </button>
      <button className="vc-btn vc-hang" title="Leave the call" aria-label="Leave the call"
        onClick={() => { play('click'); void leave(); }}>
        <Icon d={ICON.phone} size={16} />
      </button>
    </div>
  );
}

/** The microphone button for the game's top bar. */
export function MicButton() {
  return <VoiceControls compact />;
}
