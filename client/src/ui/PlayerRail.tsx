import { useEffect, useRef, useState } from 'react';
import { GROUPS, GROUP_MEMBERS, tile } from '@shared/board';
import { money, netWorth, ownedIds, ownsWholeGroup } from '@shared/rules';
import type { GameState, OwnableTile, Player } from '@shared/types';
import { useUI } from '@/store/ui';
import { CharacterAvatar } from './characters';

interface Props {
  state: GameState;
  playerId: string | null;
  onTile: (id: number) => void;
  onTrade: (withPlayerId: string) => void;
}

/**
 * Counts a balance up or down instead of snapping, so a rent hit is something
 * you watch happen rather than a number that was suddenly different.
 */
function useRollingCash(value: number): { shown: number; delta: number | null } {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<number | null>(null);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setDelta(value - start);
    const began = performance.now();
    const span = Math.min(900, 260 + Math.abs(value - start) * 0.35);

    const step = (now: number) => {
      const t = Math.min(1, (now - began) / span);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    const clear = setTimeout(() => setDelta(null), 1700);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(clear); from.current = value; };
  }, [value]);

  return { shown, delta };
}

function PlayerCard({ state, player: p, playerId, onTile, onTrade }: Props & { player: Player }) {
  const setHighlight = useUI((s) => s.setHighlight);
  const clearHighlight = useUI((s) => s.clearHighlight);
  const { shown, delta } = useRollingCash(p.cash);

  const owned = ownedIds(state, p.id).sort((a, b) => a - b);
  const isTurn = state.turn.playerId === p.id && state.status === 'playing';
  const sets = Object.keys(GROUP_MEMBERS).filter((g) => ownsWholeGroup(state, p.id, g)).length;

  return (
    <div
      className="pcard"
      data-turn={isTurn}
      data-out={p.bankrupt}
      data-me={p.id === playerId}
      data-flash={delta ? (delta > 0 ? 'up' : 'down') : undefined}
      style={{ ['--pc' as string]: p.color }}
      onMouseEnter={() => owned.length > 0 && setHighlight(owned, p.color)}
      onMouseLeave={clearHighlight}
    >
      <span className="bar" style={{ background: p.color }} />

      <div className="head">
        <span className="avatar-wrap" data-turn={isTurn}>
          <CharacterAvatar token={p.token} color={p.color} size={34} className="avatar" />
        </span>
        <span className="nm grow">
          {p.name}
          {p.id === playerId && <span className="you">you</span>}
        </span>
        <span className="cash-wrap">
          <span className="cash">{money(shown)}</span>
          {delta !== null && (
            <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? '+' : '−'}{money(Math.abs(delta))}
            </span>
          )}
        </span>
      </div>

      <div className="meta">
        <span>{owned.length} propert{owned.length === 1 ? 'y' : 'ies'}</span>
        {sets > 0 && <span className="gold">· {sets} set{sets > 1 ? 's' : ''}</span>}
        <span>· {money(netWorth(state, p.id))} net</span>
        {p.inJail && <span className="danger">· jailed</span>}
        {p.jailCards > 0 && <span>· 🔑{p.jailCards}</span>}
        {!p.connected && !p.bankrupt && <span className="faint">· offline</span>}
        {p.bankrupt && <span className="danger">· bankrupt</span>}
      </div>

      {owned.length > 0 && (
        <div className="chips">
          {owned.map((id) => {
            const t = tile(id) as OwnableTile;
            const st = state.properties[id]!;
            return (
              <button
                key={id}
                className="chip"
                data-mortgaged={st.mortgaged}
                title={`${t.name}${st.mortgaged ? ' — mortgaged' : ''}`}
                style={{ background: GROUPS[t.group].color }}
                onClick={(e) => { e.stopPropagation(); onTile(id); }}
                onMouseEnter={(e) => { e.stopPropagation(); setHighlight([id], p.color); }}
              >
                {st.houses > 0 && <span className="lvl">{st.houses === 5 ? 'H' : st.houses}</span>}
              </button>
            );
          })}
        </div>
      )}

      {playerId && p.id !== playerId && !p.bankrupt && state.status === 'playing' && (
        <button className="btn btn-sm trade-btn" onClick={() => onTrade(p.id)}>
          Trade with {p.name.split(' ')[0]}
        </button>
      )}
    </div>
  );
}

export function PlayerRail(props: Props) {
  return (
    <div className="rail">
      {props.state.players.map((p) => (
        <PlayerCard key={p.id} player={p} {...props} />
      ))}
    </div>
  );
}
