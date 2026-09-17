import { useEffect, useRef, useState } from 'react';
import type { Announcement, GameState } from '@shared/types';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { CharacterAvatar } from './characters';

const SHOW_MS = 4200;
const MAX_VISIBLE = 3;

const ICON: Partial<Record<Announcement['kind'], string>> = {
  buy: '🏷️', build: '🏠', auction: '🔨', trade: '🤝', jail: '🚨',
  bankrupt: '💥', mortgage: '🏦', rent: '💸', win: '🏆',
};

const TITLE: Partial<Record<Announcement['kind'], string>> = {
  buy: 'New owner', build: 'Construction', auction: 'Sold at auction', trade: 'Deal done',
  jail: 'Lockup', bankrupt: 'Out of the game', mortgage: 'Mortgage', rent: 'Big rent', win: 'Winner',
};

interface Shown extends Announcement { at: number }

/** Rewrites a line about you in the second person. */
function youify(text: string, name: string): string {
  const i = text.indexOf(name);
  if (i < 0) return text;
  let out = text.slice(0, i) + 'You' + text.slice(i + name.length);
  out = out
    .replace(/\bYou is\b/, 'You are').replace(/\bYou wins\b/, 'You win')
    .replace(/\bYou pays\b/, 'You pay').replace(/\bYou collects\b/, 'You collect');
  if (out.startsWith('You ')) out = out.replace(' and is ', ' and are ').replace(' and pays ', ' and pay ');
  return out.replace(/^(.+) and You /, 'You and $1 ');
}

/**
 * Banners every player sees for the big moments: purchases, houses, deals,
 * someone heading to Lockup. They wait until the dice and pawn have finished
 * moving, so they never give away where a roll lands.
 */
export function Announcer({ state, playerId }: { state: GameState; playerId: string | null }) {
  const queue = useGame((s) => s.announcements);
  const busy = useUI((s) => s.boardBusy);
  const [shown, setShown] = useState<Shown[]>([]);
  const taken = useRef(new Set<string>());

  // Move waiting announcements onto the screen once the board is still.
  useEffect(() => {
    if (busy) return;
    const fresh = queue.filter((a) => !taken.current.has(a.id));
    if (!fresh.length) return;
    const now = Date.now();
    fresh.forEach((a) => taken.current.add(a.id));
    setShown((cur) => [...cur, ...fresh.map((a, i) => ({ ...a, at: now + i * 350 }))].slice(-MAX_VISIBLE));
    useGame.setState((st) => ({ announcements: st.announcements.filter((a) => !taken.current.has(a.id)) }));
  }, [queue, busy]);

  // Retire each banner after its time is up.
  useEffect(() => {
    if (!shown.length) return;
    const next = Math.min(...shown.map((a) => a.at + SHOW_MS)) - Date.now();
    const h = setTimeout(() => {
      const now = Date.now();
      setShown((cur) => cur.filter((a) => a.at + SHOW_MS > now));
    }, Math.max(50, next));
    return () => clearTimeout(h);
  }, [shown]);

  if (!shown.length) return null;

  return (
    <div className="announcer" aria-live="polite">
      {shown.map((a) => {
        const who = state.players.find((p) => p.id === a.playerId);
        const mine = a.playerId === playerId;
        const text = who && mine ? youify(a.text, who.name) : a.text;
        const wait = Math.max(0, a.at - Date.now());
        return (
          <div
            key={a.id}
            className="announce"
            data-tone={a.tone}
            data-mine={mine || undefined}
            style={{ ['--pc' as string]: who?.color ?? '#ffc93c', animationDelay: `${wait}ms, ${wait + SHOW_MS - 400}ms` }}
          >
            <span className="announce-face">
              {who ? <CharacterAvatar token={who.token} color={who.color} size={40} /> : <span className="announce-icon">{ICON[a.kind] ?? '📣'}</span>}
              {who && <span className="announce-badge" aria-hidden="true">{ICON[a.kind] ?? '📣'}</span>}
            </span>
            <span className="announce-body">
              <small>{TITLE[a.kind] ?? 'Update'}</small>
              <b>{text}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}
