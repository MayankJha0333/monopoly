import { GROUPS, tile } from '@shared/board';
import { money, unmortgageCost } from '@shared/rules';
import type { GameState, RailroadTile, StreetTile, UtilityTile } from '@shared/types';
import { isOwnable } from '@shared/types';
import { CharacterAvatar } from './characters';

/** A row of little houses, the way a printed deed shows what rent you pay. */
function Houses({ count }: { count: number }) {
  if (count === 0) return <span className="deed-rent-label">Rent</span>;
  if (count === 5) return <span className="deed-pips"><i className="hotel" /></span>;
  return (
    <span className="deed-pips">
      {Array.from({ length: count }, (_, i) => <i key={i} className="house" />)}
    </span>
  );
}

/** The classic title deed, used in the buy prompt, auctions and the inspector. */
export function DeedCard({ tileId, state }: { tileId: number; state: GameState }) {
  const t = tile(tileId);
  if (!isOwnable(t)) {
    return (
      <div className="deed">
        <div className="band" style={{ background: '#2b3a4a', color: '#f3ecdc' }}>
          <b>{t.name}</b>
        </div>
        <div className="rows"><div className="r"><span>No title deed for this space.</span></div></div>
      </div>
    );
  }

  const st = state.properties[tileId];
  const owner = state.players.find((p) => p.id === st?.owner);
  const band = t.type === 'street' ? GROUPS[(t as StreetTile).group].color : '#2b3a4a';
  const bandText = t.type === 'street' && (t as StreetTile).group === 'yellow' ? '#16202b' : '#f7f1e2';

  return (
    <div className="deed" data-mortgaged={st?.mortgaged || undefined}>
      <div className="band" style={{ background: band, color: bandText }}>
        <small>Title Deed</small>
        <b>{t.name}</b>
      </div>

      <div className="deed-price">
        <span>Price</span>
        <b>{money(t.price)}</b>
      </div>

      <div className="rows">
        {t.type === 'street' && <StreetRows t={t as StreetTile} />}
        {t.type === 'railroad' && <RailRows t={t as RailroadTile} />}
        {t.type === 'utility' && <UtilRows t={t as UtilityTile} />}

        <div className="r sep">
          <span>Mortgage value</span><b>{money(t.mortgage)}</b>
        </div>
        <div className="r">
          <span>Lift mortgage</span><b>{money(unmortgageCost(t))}</b>
        </div>
      </div>

      <div className="deed-foot">
        {owner ? (
          <span className="deed-owner">
            <CharacterAvatar token={owner.token} color={owner.color} size={20} />
            Owned by <b style={{ color: owner.color }}>{owner.name}</b>
            {st?.mortgaged ? ' · mortgaged' : ''}
          </span>
        ) : (
          <span className="deed-owner">Unowned — yours for {money(t.price)}</span>
        )}
      </div>
    </div>
  );
}

function StreetRows({ t }: { t: StreetTile }) {
  return (
    <>
      {t.rent.map((r, i) => (
        <div className="r rent" key={i}>
          <Houses count={i} />
          <b>{money(r)}</b>
        </div>
      ))}
      <div className="r sep"><span>House cost</span><b>{money(t.houseCost)} each</b></div>
      <div className="r"><span>Hotel cost</span><b>{money(t.houseCost)} + 4 houses</b></div>
    </>
  );
}

function RailRows({ t }: { t: RailroadTile }) {
  return (
    <>
      {t.rent.map((r, i) => (
        <div className="r" key={i}>
          <span>{i + 1} stop{i ? 's' : ''} owned</span><b>{money(r)}</b>
        </div>
      ))}
    </>
  );
}

function UtilRows({ t }: { t: UtilityTile }) {
  return (
    <>
      <div className="r"><span>One power farm owned</span><b>{t.multipliers[0]}× dice</b></div>
      <div className="r"><span>Both power farms owned</span><b>{t.multipliers[1]}× dice</b></div>
    </>
  );
}
