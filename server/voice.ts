/**
 * Voice and video at private tables, through LiveKit.
 *
 * The server never carries audio or video itself: it only hands out a
 * short-lived pass (a signed token) that lets one player into one table's
 * call. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to switch the
 * feature on; with any of them missing the game simply hides it.
 */
import { AccessToken } from 'livekit-server-sdk';

const URL_ = process.env.LIVEKIT_URL?.trim() ?? '';
const KEY = process.env.LIVEKIT_API_KEY?.trim() ?? '';
const SECRET = process.env.LIVEKIT_API_SECRET?.trim() ?? '';

/** Passes are good for two hours, which outlasts any match. */
const TTL = '2h';

export const voiceConfigured = (): boolean => !!(URL_ && KEY && SECRET);

export const voiceUrl = (): string => URL_;

/** One LiveKit room per table, named after the table code. */
export const voiceRoom = (code: string): string => `rentrush-${code.toUpperCase()}`;

export async function voiceToken(opts: {
  code: string;
  playerId: string;
  name: string;
}): Promise<string> {
  const at = new AccessToken(KEY, SECRET, {
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
