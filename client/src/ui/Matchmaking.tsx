import { useEffect, useState } from 'react';
import type { GameState } from '@shared/types';
import { play } from '@/audio/sfx';
import { leaveTable } from '@/store/game';
import { Backdrop } from './Backdrop';
import { CHARACTERS, CharacterAvatar } from './characters';

const SEATS = 4;
const TIPS = [
  'Own every street of one colour to double its rent.',
  'Transit stops pay more the more of them you own.',
  'Houses are where the money is — build as soon as you have a set.',
  'Short on cash? Mortgage a street instead of selling a house.',
  'Trades win games. Offer a swap that finishes both your sets.',
  'The richest player wins when the final round ends.',
];

/** The Quick Play waiting room: seats fill up, then a countdown. */
export function Matchmaking({ state, playerId }: { state: GameState; playerId: string }) {
  const [now, setNow] = useState(Date.now());
  const [since] = useState(Date.now());
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]!);
  const count = state.players.length;

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, []);

  useEffect(() => { if (count > 1) play('click'); }, [count]);

  const countdown = state.startsAt ? Math.max(0, Math.ceil((state.startsAt - now) / 1000)) : null;
  useEffect(() => { if (countdown !== null && countdown > 0) play('step'); }, [countdown]);

  const waited = Math.floor((now - since) / 1000);
  const seats = Array.from({ length: SEATS }, (_, i) => state.players[i] ?? null);

  return (
    <div className="sp-home sp-mm">
      <Backdrop />
      <div className="sp-mm-card sp-card" role="status" aria-live="polite">
        <h1 className="sp-mm-title">
          {countdown !== null ? (countdown > 0 ? `Starting in ${countdown}` : 'Here we go!') : 'Finding players'}
        </h1>
        <p className="sp-muted">
          {countdown !== null
            ? 'Get ready — the dice are warming up.'
            : `${count} of ${SEATS} players · ${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, '0')}`}
        </p>

        <div className="sp-seats">
          {seats.map((p, i) => (
            <div className="sp-seat" key={p?.id ?? `empty-${i}`} data-filled={!!p} data-me={p?.id === playerId || undefined}
              style={p ? { ['--pc' as string]: p.color } : undefined}>
              {p ? (
                <>
                  <CharacterAvatar token={p.token} color={p.color} size={64} />
                  <b>{p.name}</b>
                  <small>{p.id === playerId ? 'You' : CHARACTERS[p.token]?.name}</small>
                </>
              ) : (
                <>
                  <span className="sp-seat-spin" />
                  <b>Searching…</b>
                  <small>&nbsp;</small>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="sp-tip"><b>Tip:</b> {tip}</p>
        {countdown === null && (
          <button className="sp-btn" onClick={() => { play('click'); leaveTable(); }}>Cancel</button>
        )}
      </div>
    </div>
  );
}
