import { useEffect } from 'react';
import type { TokenId } from '@shared/types';
import { useGame } from '@/store/game';
import { play } from '@/audio/sfx';
import { useVoice, type VoicePeer } from '@/voice/store';
import { CharacterAvatar } from './characters';

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

/** One person in the call. Voices play outside the interface, in the store. */
function Tile({ peer, token, color, canMute, onMute }: {
  peer: VoicePeer; token?: TokenId; color?: string; canMute: boolean; onMute: () => void;
}) {
  return (
    <div className="vc-tile" data-speaking={peer.speaking || undefined} title={peer.name}>
      <CharacterAvatar token={(token ?? 'hat') as TokenId} color={color ?? '#19b3d1'} size={38} />
      <span className="vc-name">{peer.me ? 'You' : peer.name}</span>
      {!peer.micOn && <span className="vc-muted" aria-label="microphone off"><Icon d={ICON.micOff} size={13} /></span>}
      {canMute && peer.micOn && (
        <button className="vc-silence" onClick={onMute} title={`Mute ${peer.name}`} aria-label={`Mute ${peer.name}`}>
          <Icon d={ICON.micOff} size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Voice chat for a table made with friends. Everyone is put into the call as
 * they sit down, so a conversation can simply start; the microphone can be
 * switched off at any time, and the host can silence anyone. Quick Play tables
 * and servers with no LiveKit keys never show this.
 */
export function VoiceBar({ compact = false }: { compact?: boolean }) {
  const state = useGame((s) => s.state);
  const playerId = useGame((s) => s.playerId);
  const voiceReady = useGame((s) => s.voiceReady);
  const {
    status, error, micOn, peers, needsTap, voices, level, optedOut,
    join, leave, toggleMic, allowSound, muteOther,
  } = useVoice();

  const canUse = !!state && !state.quickMatch && voiceReady;
  const iAmHost = !!state?.players.find((p) => p.id === playerId)?.isHost;

  // Taking a seat was itself a tap, which is what a browser needs before it
  // will open a microphone — so the call can start on its own. Anyone who
  // hangs up stays out until they ask to rejoin.
  useEffect(() => {
    if (canUse && status === 'off' && !optedOut) void join();
  }, [canUse, status, optedOut]);

  if (!state || state.quickMatch) return null;

  if (!voiceReady) {
    return (
      <div className="vc-bar vc-off" data-compact={compact || undefined}>
        <div className="vc-head"><Icon d={ICON.phone} /><span>Voice chat</span></div>
        <p className="vc-hint">
          Off on this server. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to
          its .env file and restart it.
        </p>
      </div>
    );
  }

  const look = (id: string) => state.players.find((p) => p.id === id);

  if (status !== 'live') {
    return (
      <div className="vc-bar" data-compact={compact || undefined}>
        <div className="vc-head">
          <Icon d={ICON.phone} />
          <span>Voice chat</span>
        </div>
        <button className="btn btn-sm btn-good" disabled={status === 'joining'}
          onClick={() => { play('click'); void join(); }}>
          {status === 'joining' ? 'Connecting…' : 'Rejoin call'}
        </button>
        {error && <p className="vc-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="vc-bar" data-live="true" data-compact={compact || undefined}>
      <div className="vc-head">
        <Icon d={ICON.phone} />
        <span>Voice chat</span>
        <span className="vc-count">{peers.length} in call</span>
      </div>

      <div className="vc-tiles">
        {peers.map((p) => {
          const seat = look(p.id);
          return (
            <Tile key={p.id} peer={p} token={seat?.token} color={seat?.color}
              canMute={iAmHost && !p.me} onMute={() => { play('click'); muteOther(p.id); }} />
          );
        })}
      </div>

      <div className="vc-status">
        <span className="vc-meter" aria-hidden="true">
          <i style={{ width: `${Math.round((micOn ? level : 0) * 100)}%` }} />
        </span>
        <span>
          {!micOn ? 'Your microphone is off.'
            : level > 0.06 ? 'Your microphone is picking you up.'
              : 'Say something — the bar should move.'}
        </span>
      </div>
      <p className="vc-hint">
        {peers.length < 2 ? 'Nobody else is in the call yet.'
          : voices === 0 ? 'Connected. Waiting for their microphone…'
            : `Hearing ${voices} ${voices === 1 ? 'person' : 'people'}.`}
      </p>

      {needsTap && (
        <button className="btn btn-sm btn-good vc-tap" onClick={() => void allowSound()}>
          Tap to hear everyone
        </button>
      )}

      <div className="vc-controls">
        <button className="vc-btn" data-off={!micOn || undefined} onClick={() => void toggleMic()}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} title={micOn ? 'Mute' : 'Unmute'}>
          <Icon d={micOn ? ICON.mic : ICON.micOff} />
        </button>
        <button className="vc-btn vc-hang" onClick={() => { play('click'); void leave(); }}
          aria-label="Leave call" title="Leave call">
          <Icon d={ICON.phone} />
        </button>
      </div>
      {error && <p className="vc-error">{error}</p>}
    </div>
  );
}

/** The microphone button for the game's top bar. */
export function MicButton() {
  const state = useGame((s) => s.state);
  const voiceReady = useGame((s) => s.voiceReady);
  const status = useVoice((s) => s.status);
  const micOn = useVoice((s) => s.micOn);
  const loud = useVoice((s) => s.level > 0.06);
  const toggleMic = useVoice((s) => s.toggleMic);

  if (!state || state.quickMatch || !voiceReady || status !== 'live') return null;

  return (
    <button className="btn btn-sm vc-mic-btn" data-off={!micOn || undefined} data-live={(micOn && loud) || undefined}
      title={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
      aria-label={micOn ? 'Mute your microphone' : 'Unmute your microphone'}
      onClick={() => void toggleMic()}>
      <Icon d={micOn ? ICON.mic : ICON.micOff} size={16} />
    </button>
  );
}
