import { useEffect, useMemo, useState } from 'react';
import { GROUPS, tile } from '@shared/board';
import { money, ownedIds } from '@shared/rules';
import type { GameState, OwnableTile, TradeSide } from '@shared/types';
import { send } from '@/net/socket';
import { play } from '@/audio/sfx';
import { useUI } from '@/store/ui';

interface Props {
  state: GameState;
  playerId: string;
  initialPartner: string | null;
  onClose: () => void;
}

const emptySide = (): TradeSide => ({ cash: 0, properties: [], jailCards: 0 });

export function TradeDialog({ state, playerId, initialPartner, onClose }: Props) {
  const me = state.players.find((p) => p.id === playerId)!;
  const candidates = state.players.filter((p) => p.id !== playerId && !p.bankrupt);
  const [partnerId, setPartnerId] = useState(initialPartner ?? candidates[0]?.id ?? '');
  const [give, setGive] = useState<TradeSide>(emptySide);
  const [want, setWant] = useState<TradeSide>(emptySide);

  const partner = state.players.find((p) => p.id === partnerId);
  const setHighlight = useUI((s) => s.setHighlight);
  const setBoardInset = useUI((s) => s.setBoardInset);

  // Dock as a sheet and lift the board above it, so the highlights stay in view.
  useEffect(() => {
    setBoardInset(Math.round(Math.min(window.innerHeight * 0.42, 340)));
    return () => setBoardInset(0);
  }, [setBoardInset]);

  // Everything on the table lights up on the board as you pick it.
  useEffect(() => {
    setHighlight([...give.properties, ...want.properties], me.color);
  }, [give.properties, want.properties, me.color, setHighlight]);

  // Streets carrying buildings cannot change hands, so they are not offered.
  const tradable = (owner: string) =>
    ownedIds(state, owner).filter((id) => state.properties[id]!.houses === 0).sort((a, b) => a - b);

  const mine = useMemo(() => tradable(playerId), [state.properties, playerId]);
  const theirs = useMemo(() => (partnerId ? tradable(partnerId) : []), [state.properties, partnerId]);

  const toggle = (side: TradeSide, setSide: (s: TradeSide) => void, id: number) => {
    play('click');
    setSide({
      ...side,
      properties: side.properties.includes(id)
        ? side.properties.filter((x) => x !== id)
        : [...side.properties, id],
    });
  };

  const submit = () => {
    if (!partner) return;
    const clamp = (n: number, max: number) => Math.max(0, Math.min(Math.floor(n || 0), max));
    send('trade:offer', {
      to: partner.id,
      give: { ...give, cash: clamp(give.cash, me.cash), jailCards: clamp(give.jailCards, me.jailCards) },
      want: { ...want, cash: clamp(want.cash, partner.cash), jailCards: clamp(want.jailCards, partner.jailCards) },
    });
    play('trade');
    onClose();
  };

  const empty = give.properties.length + want.properties.length === 0
    && give.cash <= 0 && want.cash <= 0 && give.jailCards <= 0 && want.jailCards <= 0;

  const column = (
    title: string, holder: typeof me, ids: number[], side: TradeSide, setSide: (s: TradeSide) => void,
  ) => (
    <div className="trade-col">
      <h4>{title}</h4>
      <div className="prop-pick">
        {ids.length === 0 && <div className="empty">Nothing tradable.</div>}
        {ids.map((id) => {
          const t = tile(id) as OwnableTile;
          const on = side.properties.includes(id);
          return (
            <button key={id} className="prop-item" data-on={on} onClick={() => toggle(side, setSide, id)}>
              <span className="sw" style={{ background: GROUPS[t.group].color }} />
              <span className="nm">{t.name}</span>
              <span style={{ color: 'var(--muted)' }}>{money(t.price)}</span>
            </button>
          );
        })}
      </div>
      <div className="field">
        <span className="label">Cash (max {money(holder.cash)})</span>
        <input className="input" type="number" min={0} max={holder.cash} value={side.cash || ''}
          placeholder="0" onChange={(e) => setSide({ ...side, cash: Number(e.target.value) })} />
      </div>
      {holder.jailCards > 0 && (
        <div className="field">
          <span className="label">Jail cards (has {holder.jailCards})</span>
          <input className="input" type="number" min={0} max={holder.jailCards} value={side.jailCards || ''}
            placeholder="0" onChange={(e) => setSide({ ...side, jailCards: Number(e.target.value) })} />
        </div>
      )}
    </div>
  );

  return (
    <div className="scrim is-sheet" onClick={onClose}>
      <div className="card modal sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 className="grow">Propose a trade</h3>
          <select className="select" style={{ width: 180 }} value={partnerId}
            onChange={(e) => { setPartnerId(e.target.value); setWant(emptySide()); }}>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {!partner ? (
          <div className="empty">No one to trade with.</div>
        ) : (
          <>
            <div className="trade-grid">
              {column('You give', me, mine, give, setGive)}
              <div className="swap">⇄</div>
              {column(`${partner.name} gives`, partner, theirs, want, setWant)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-gold" disabled={empty} onClick={submit}>Send offer</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
