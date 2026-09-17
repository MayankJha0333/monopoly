import { useEffect, useRef, useState } from 'react';
import { JAIL_FINE, tile } from '@shared/board';
import { liquidValue, money } from '@shared/rules';
import type { GameState } from '@shared/types';
import { send } from '@/net/socket';
import { play } from '@/audio/sfx';
import { useUI } from '@/store/ui';

/** How long a finished turn lingers before it passes on by itself. */
const AUTO_END_SECONDS = 9;

interface Props {
  state: GameState;
  playerId: string | null;
  /** True while a dialog is open, which holds the auto-end countdown. */
  paused: boolean;
  onManage: () => void;
  onTrade: () => void;
}

export function ActionBar({ state, playerId, paused, onManage, onTrade }: Props) {
  const armed = useUI((s) => s.autoEndArmed);
  const setAutoEnd = useUI((s) => s.setAutoEnd);
  const [left, setLeft] = useState(AUTO_END_SECONDS);
  const sent = useRef(false);

  const me = state.players.find((p) => p.id === playerId);
  const turn = state.turn;
  const isMine = turn.playerId === playerId && state.status === 'playing';
  const current = state.players.find((p) => p.id === turn.playerId);
  const myDebt = state.debt?.debtorId === playerId ? state.debt : null;

  const settled =
    isMine && turn.phase === 'post-roll' &&
    !state.debt && !state.buyPrompt && !state.auction && !state.drawnCard;
  const counting = settled && armed && !paused;

  // Each new turn re-arms the countdown that a "Stay" click disarmed.
  useEffect(() => {
    setAutoEnd(true);
    sent.current = false;
  }, [turn.playerId, turn.rolled, setAutoEnd]);

  useEffect(() => {
    if (!counting) { setLeft(AUTO_END_SECONDS); return; }
    const startedAt = Date.now();
    const handle = setInterval(() => {
      const remaining = AUTO_END_SECONDS - (Date.now() - startedAt) / 1000;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !sent.current) {
        sent.current = true;
        send('game:endTurn');
      }
    }, 100);
    return () => clearInterval(handle);
  }, [counting]);

  if (!me || state.status !== 'playing') return null;

  // A debt blocks everything else until it is settled or the player resigns.
  if (myDebt) {
    const canPay = liquidValue(state, me.id) >= myDebt.amount;
    return (
      <div className="actions">
        <div className="action-pill is-alert">
          <span className="pill-note">
            You owe <b>{money(myDebt.amount)}</b> — {myDebt.reason}
          </span>
          <button className="btn btn-gold" onClick={onManage}>
            {canPay ? 'Raise the cash' : 'Review assets'}
          </button>
          <button className="btn btn-danger" onClick={() => send('game:bankrupt')}>
            Declare bankruptcy
          </button>
        </div>
      </div>
    );
  }

  if (!isMine) {
    return (
      <div className="actions">
        <div className="action-pill">
          <span className="pill-note">
            <span className="pip" style={{ background: current?.color }} />
            Waiting for <b>{current?.name ?? '…'}</b>
          </span>
          <button className="btn btn-sm" onClick={onManage}>Manage</button>
          <button className="btn btn-sm" onClick={onTrade}>Trade</button>
        </div>
      </div>
    );
  }

  return (
    <div className="actions">
      <div className="action-pill">
        {turn.phase === 'pre-roll' && me.inJail && (
          <>
            <button className="btn btn-gold" onClick={() => { play('click'); send('game:roll'); }}>
              Roll for doubles
            </button>
            <button className="btn" disabled={me.cash < JAIL_FINE}
              onClick={() => { play('click'); send('game:payJail'); }}>
              Pay {money(JAIL_FINE)}
            </button>
            {me.jailCards > 0 && (
              <button className="btn btn-good" onClick={() => { play('click'); send('game:useJailCard'); }}>
                Use Free Pass
              </button>
            )}
          </>
        )}

        {turn.phase === 'pre-roll' && !me.inJail && (
          <button className="btn btn-gold btn-primary" data-pulse="true"
            onClick={() => { play('click'); send('game:roll'); }}>
            {turn.doubles > 0 ? 'Roll again — doubles' : 'Roll the dice'}
            <kbd>R</kbd>
          </button>
        )}

        {turn.phase === 'post-roll' && (
          <>
            <button className="btn btn-gold btn-primary" onClick={() => { play('click'); send('game:endTurn'); }}>
              End turn
              {counting && <span className="countdown" style={{ animationDuration: `${AUTO_END_SECONDS}s` }} />}
              <kbd>{counting ? Math.ceil(left) : 'E'}</kbd>
            </button>
            {counting && (
              <button className="btn btn-sm btn-ghost" title="Stay on this turn"
                onClick={() => setAutoEnd(false)}>
                Stay
              </button>
            )}
          </>
        )}

        <button className="btn btn-sm" onClick={onManage}>Manage</button>
        <button className="btn btn-sm" onClick={onTrade}>Trade</button>

        {turn.dice && (
          <span className="pill-note">
            <b className="dice-read">{turn.dice[0]}·{turn.dice[1]}</b>
            {tile(me.position).name}
          </span>
        )}
      </div>
    </div>
  );
}
