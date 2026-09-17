import { useEffect, useState } from 'react';
import { tile } from '@shared/board';
import { money } from '@shared/rules';
import type { GameState } from '@shared/types';
import { send } from '@/net/socket';
import { useUI } from '@/store/ui';
import { play } from '@/audio/sfx';
import { DeedCard } from './DeedCard';
import { CharacterAvatar } from './characters';

/** Seconds left on a server deadline, ticking locally between state pushes. */
function useCountdown(deadline: number | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) { setLeft(null); return; }
    const update = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const handle = setInterval(update, 250);
    return () => clearInterval(handle);
  }, [deadline]);
  return left;
}

export function BuyModal({ state, playerId }: { state: GameState; playerId: string | null }) {
  const busy = useUI((s) => s.boardBusy);
  const bp = state.buyPrompt;
  // The throw and the walk play out first; the deed follows the token.
  if (!bp || state.turn.playerId !== playerId || busy) return null;
  const me = state.players.find((p) => p.id === playerId)!;

  return (
    <div className="scrim is-prompt">
      <div className="card modal buy-modal">
        <div className="for-sale">
          <span className="fs-flag" />
          For sale
        </div>

        <DeedCard tileId={bp.tileId} state={state} />

        <div className="buy-wallet">
          <CharacterAvatar token={me.token} color={me.color} size={26} />
          <span className="grow">
            {money(me.cash)}
            <i className="arrow">→</i>
            <b className={me.cash - bp.price < 200 ? 'danger' : ''}>{money(me.cash - bp.price)}</b>
          </span>
          <span className="buy-price">−{money(bp.price)}</span>
        </div>

        <div className="modal-actions buy-actions">
          <button className="btn btn-gold btn-buy" disabled={me.cash < bp.price}
            onClick={() => { play('buy'); send('game:buy'); }}>
            Buy for {money(bp.price)}
          </button>
          <button className="btn btn-pass" onClick={() => send('game:declineBuy')}>
            {state.settings.auctions ? 'Send to auction' : 'Pass'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuctionModal({ state, playerId }: { state: GameState; playerId: string | null }) {
  const a = state.auction;
  const left = useCountdown(a?.deadline ?? null);
  const [custom, setCustom] = useState('');

  if (!a) return null;
  const me = state.players.find((p) => p.id === playerId);
  const inIt = !!me && a.active.includes(me.id);
  const high = state.players.find((p) => p.id === a.highBidder);
  const t = tile(a.tileId);

  const bid = (amount: number) => {
    if (amount <= a.highBid || !me || amount > me.cash) return;
    play('click');
    send('game:bid', { amount });
    setCustom('');
  };

  const steps = [10, 50, 100].map((s) => a.highBid + s);
  const opening = a.highBid === 0 ? 10 : steps[0]!;

  return (
    <div className="scrim">
      <div className="card modal">
        <h3>Auction — {t.name}</h3>
        <p className="sub">
          Highest bid {a.highBid > 0 ? <b style={{ color: high?.color }}>{money(a.highBid)} by {high?.name}</b> : 'none yet'}
          {left !== null && ` · closes in ${left}s`}
        </p>
        <DeedCard tileId={a.tileId} state={state} />

        {inIt ? (
          <>
            <div className="row row-wrap">
              <button className="btn btn-sm" disabled={!me || opening > me.cash} onClick={() => bid(opening)}>
                Bid {money(opening)}
              </button>
              {steps.slice(1).map((s) => (
                <button key={s} className="btn btn-sm" disabled={!me || s > me.cash} onClick={() => bid(s)}>
                  {money(s)}
                </button>
              ))}
            </div>
            <div className="row">
              <input className="input grow" type="number" placeholder="Custom amount" value={custom}
                min={a.highBid + 1} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn" onClick={() => bid(Number(custom))}>Bid</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => send('game:passBid')}>Pass</button>
            </div>
            <p className="sub center">
              You have {money(me!.cash)} · {a.active.length} bidder{a.active.length === 1 ? '' : 's'} left
            </p>
          </>
        ) : (
          <p className="sub center">
            {me ? 'You passed on this lot.' : 'Watching the auction.'}
          </p>
        )}
      </div>
    </div>
  );
}

const CARD_SECONDS = 3.6;

export function CardModal({ state, playerId }: { state: GameState; playerId: string | null }) {
  const busy = useUI((s) => s.boardBusy);
  const drawn = state.drawnCard;
  const mine = drawn?.playerId === playerId;

  // The card reads itself out and clears; the turn carries on without a click.
  // Its clock only starts once the board has finished moving.
  useEffect(() => {
    if (!drawn || !mine || busy) return;
    const handle = setTimeout(() => send('game:acknowledgeCard'), CARD_SECONDS * 1000);
    return () => clearTimeout(handle);
  }, [drawn, mine, busy]);

  if (!drawn || busy) return null;
  const who = state.players.find((p) => p.id === drawn.playerId);

  return (
    <div className="scrim is-card" onClick={() => mine && send('game:acknowledgeCard')}>
      <div className="card-stage">
        <div className={`chance-card ${drawn.deck}`}>
          <div className="kind">{drawn.deck === 'chance' ? 'SURPRISE' : 'TREASURE'}</div>
          <div className="txt">{drawn.text}</div>
          <span className="card-timer" style={{ animationDuration: `${CARD_SECONDS}s` }} />
        </div>
        <p className="card-by" style={{ color: who?.color }}>
          {mine ? 'Tap to continue' : `Drawn by ${who?.name}`}
        </p>
      </div>
    </div>
  );
}

export function InspectModal({ state, tileId, onClose }: {
  state: GameState; tileId: number | null; onClose: () => void;
}) {
  if (tileId === null) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="card modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <DeedCard tileId={tileId} state={state} />
        <button className="btn btn-block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
