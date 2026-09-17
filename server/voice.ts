/**
 * Voice and video at private tables, through LiveKit.
 *
 * The server never carries audio or video itself: it only hands out a
 * short-lived pass (a signed token) that lets one player into one table's
 * call. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to switch the
 * feature on; with any of them missing the game simply hides it.
 */
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

// Read when asked, never cached at load time: a setting read too early is a
// setting that is still empty.
const env = (name: string) => process.env[name]?.trim() ?? '';
const url = () => env('LIVEKIT_URL');
const key = () => env('LIVEKIT_API_KEY');
const secret = () => env('LIVEKIT_API_SECRET');

/** Passes are good for two hours, which outlasts any match. */
const TTL = '2h';

export const voiceConfigured = (): boolean => !!(url() && key() && secret());

export const voiceUrl = (): string => url();

/** One LiveKit room per table, named after the table code. */
export const voiceRoom = (code: string): string => `rentrush-${code.toUpperCase()}`;

export async function voiceToken(opts: {
  code: string;
  playerId: string;
  name: string;
}): Promise<string> {
  const at = new AccessToken(key(), secret(), {
    identity: opts.playerId,
    name: opts.name.slice(0, 32),
    ttl: TTL,
  });
  at.addGrant({
    room: voiceRoom(opts.code),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    // Players may not create or manage rooms, only join their own table's.
    roomCreate: false,
    roomAdmin: false,
  });
  return at.toJwt();
}

/** The plain web address of the LiveKit server, for managing a call. */
function httpUrl(): string {
  return url().replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

/**
 * Silences one player's microphone, for the host. The player can turn their
 * own microphone back on; the host can always silence it again.
 */
export async function silence(code: string, playerId: string): Promise<boolean> {
  if (!voiceConfigured()) return false;
  const svc = new RoomServiceClient(httpUrl(), key(), secret());
  const room = voiceRoom(code);
  const who = await svc.getParticipant(room, playerId).catch(() => null);
  if (!who) return false;
  const mic = who.tracks.find((t) => t.source === 2 /* MICROPHONE */ || t.type === 0 /* AUDIO */);
  if (!mic) return false;
  await svc.mutePublishedTrack(room, playerId, mic.sid, true);
  return true;
}
