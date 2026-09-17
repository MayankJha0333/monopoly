import { useEffect, useRef } from 'react';
import type { GameState } from '@shared/types';
import { clearNotifications, notify } from './notify';

/**
 * Watches the table and raises a desktop notification for the things worth
 * interrupting someone for, while they are on another tab or window.
 */
export function useNotifications(state: GameState | null, playerId: string | null) {
  const seenChat = useRef(state?.chat.length ?? 0);
  const seenTrade = useRef<string | null>(null);
  const seenTurn = useRef<string | null>(null);
  const seenStatus = useRef(state?.status);
  const seats = useRef(state?.players.length ?? 0);

  // Once the player is back, anything still on screen is stale.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') clearNotifications(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  useEffect(() => {
    if (!state || !playerId) return;
    const me = state.players.find((p) => p.id === playerId);

    // The game starting.
    if (seenStatus.current !== state.status && state.status === 'playing') {
      notify({ tag: 'start', title: 'The game has started', body: 'Rent Rush is waiting for you.' });
    }
    seenStatus.current = state.status;

    // Your turn.
    if (state.status === 'playing' && state.turn.playerId !== seenTurn.current) {
      seenTurn.current = state.turn.playerId;
      if (state.turn.playerId === playerId) {
        notify({ tag: 'turn', title: 'Your turn', body: `Roll the dice — ${me?.name ?? 'you'} are up.` });
      }
    }

    // A trade offer waiting on you.
    const offer = state.trades.find((t) => t.status === 'open' && t.to === playerId);
    if (offer && offer.id !== seenTrade.current) {
      seenTrade.current = offer.id;
      const from = state.players.find((p) => p.id === offer.from)?.name ?? 'Someone';
      notify({ tag: 'trade', title: `${from} sent you an offer`, body: 'Open the table to accept or decline.' });
    }
    if (!offer) seenTrade.current = null;

    // Chat.
    if (state.chat.length > seenChat.current) {
      const m = state.chat[state.chat.length - 1];
      if (m && m.playerId !== playerId) {
        notify({ tag: 'chat', title: `${m.name} says`, body: m.text });
      }
    }
    seenChat.current = state.chat.length;

    // Someone taking a seat while you wait in a private table.
    if (state.status === 'lobby' && state.players.length > seats.current) {
      const who = state.players[state.players.length - 1]?.name;
      if (who && who !== me?.name) {
        notify({ tag: 'seat', title: `${who} joined your table`, body: `${state.players.length} players seated.` });
      }
    }
    seats.current = state.players.length;
  }, [state, playerId]);
}
