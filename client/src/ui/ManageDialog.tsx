import { GROUPS, tile } from '@shared/board';
import {
  canBuild, canMortgage, canSellHouse, canUnmortgage, liquidValue, money, ownedIds, unmortgageCost,
} from '@shared/rules';
import type { GameState, OwnableTile, StreetTile } from '@shared/types';
import { send } from '@/net/socket';
import { play } from '@/audio/sfx';

interface Props {
  state: GameState;
  playerId: string;
  onClose: () => void;
  onTile: (id: number) => void;
}

/** Build, sell, mortgage and lift mortgages across everything you own. */
export function ManageDialog({ state, playerId, onClose, onTile }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;

  const owned = ownedIds(state, playerId).sort((a, b) => a - b);
  const debt = state.debt?.debtorId === playerId ? state.debt : null;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="card modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 className="grow">Your properties</h3>
          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{money(me.cash)}</span>
        </div>

        {debt && (
          <p className="sub" style={{ color: 'var(--danger)' }}>
            You owe {money(debt.amount)}. You can raise up to {money(liquidValue(state, playerId))}.
          </p>
        )}

        {owned.length === 0 ? (
          <div className="empty">You do not own anything yet.</div>
        ) : (
          <div className="manage-list">
            {owned.map((id) => {
              const t = tile(id) as OwnableTile;
              const st = state.properties[id]!;
              const build = canBuild(state, playerId, id);
              const sell = canSellHouse(state, playerId, id);
              const mort = canMortgage(state, playerId, id);
              const unmort = canUnmortgage(state, playerId, id);
              const isStreet = t.type === 'street';

              return (
                <div className="manage-row" key={id}>
                  <span className="sw" style={{ background: GROUPS[t.group].color }} />
                  <button className="nm" style={{ textAlign: 'left' }} onClick={() => onTile(id)}>
                    {t.name}
                    <span className="lv">
                      {st.mortgaged
                        ? ' · mortgaged'
                        : isStreet && st.houses === 5 ? ' · hotel'
                        : isStreet && st.houses > 0 ? ` · ${st.houses} house${st.houses > 1 ? 's' : ''}` : ''}
                    </span>
                  </button>

                  {isStreet && (
                    <>
                      <button className="btn btn-sm btn-good" disabled={!build.ok} title={build.reason ?? ''}
                        onClick={() => { play('build'); send('game:build', { tileId: id }); }}>
                        + {money((t as StreetTile).houseCost)}
                      </button>
                      <button className="btn btn-sm" disabled={!sell.ok} title={sell.reason ?? ''}
                        onClick={() => send('game:sellHouse', { tileId: id })}>
                        − {money((t as StreetTile).houseCost / 2)}
                      </button>
                    </>
                  )}

                  {st.mortgaged ? (
                    <button className="btn btn-sm" disabled={!unmort.ok} title={unmort.reason ?? ''}
                      onClick={() => send('game:unmortgage', { tileId: id })}>
                      Lift {money(unmortgageCost(t))}
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-danger" disabled={!mort.ok} title={mort.reason ?? ''}
                      onClick={() => send('game:mortgage', { tileId: id })}>
                      Mortgage {money(t.mortgage)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button className="btn btn-block" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
