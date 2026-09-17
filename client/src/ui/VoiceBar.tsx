import { useEffect, useRef } from 'react';
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
  cam: 'M4 7h10v10H4zM14 11l6-3v8l-6-3',
  camOff: 'M4 7h7v10H4zM14 11l6-3v8l-3-1.5M4 4l16 16',
  leave: 'M21 15.5v2a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 18.6 18.6 0 0 1-5.7-5.7 19 19 0 0 1-3-8.4A2 2 0 0 1 3.8 0M4 20 20 4',
  phone: 'M21 15.5v2a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 18.6 18.6 0 0 1-5.7-5.7 19 19 0 0 1-3-8.4A2 2 0 0 1 3.8 2h2a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7 9.7a15 15 0 0 0 5.7 5.7l1-1a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z',
};

/** One person in the call: their face, or their camera when it is on. */
function Tile({ peer, token, color }: { peer: VoicePeer; token?: TokenId; color?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    peer.attachVideo(video.current);
    return () => peer.attachVideo(null);
  }, [peer, peer.camOn]);

  useEffect(() => {
    peer.attachAudio(audio.current);
    return () => peer.attachAudio(null);
  }, [peer, peer.micOn]);

  return (
    <div className="vc-tile" data-speaking={peer.speaking || undefined} title={peer.name}>
      {peer.camOn ? (
        <video ref={video} className="vc-video" autoPlay playsInline muted={peer.me} />
      ) : (
        <CharacterAvatar token={(token ?? 'hat') as TokenId} color={color ?? '#19b3d1'} size={38} />
      )}
      {!peer.me && <audio ref={audio} autoPlay />}
      <span className="vc-name">{peer.me ? 'You' : peer.name}</span>
      {!peer.micOn && <span className="vc-muted" aria-label="microphone off"><Icon d={ICON.micOff} size={13} /></span>}
    </div>
  );
}

/**
 * Voice and video for a table you made with friends. It is hidden at Quick
 * Play tables and on servers with no LiveKit keys, so nothing appears unless
 * it can actually work.
 */
export function VoiceBar({ compact = false }: { compact?: boolean }) {
  const state = useGame((s) => s.state);
  const voiceReady = useGame((s) => s.voiceReady);
  const { status, error, micOn, camOn, peers, join, leave, toggleMic, toggleCam } = useVoice();

  if (!state || state.quickMatch || !voiceReady) return null;

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
          {status === 'joining' ? 'Joining…' : 'Join call'}
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
          return <Tile key={p.id} peer={p} token={seat?.token} color={seat?.color} />;
        })}
      </div>

      <div className="vc-controls">
        <button className="vc-btn" data-off={!micOn || undefined} onClick={() => void toggleMic()}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} title={micOn ? 'Mute' : 'Unmute'}>
          <Icon d={micOn ? ICON.mic : ICON.micOff} />
        </button>
        <button className="vc-btn" data-off={!camOn || undefined} onClick={() => void toggleCam()}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} title={camOn ? 'Camera off' : 'Camera on'}>
          <Icon d={camOn ? ICON.cam : ICON.camOff} />
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
