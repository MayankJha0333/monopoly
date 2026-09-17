import { useEffect, useState } from 'react';
import { levelProgress } from '@shared/progress';
import { money, netWorth } from '@shared/rules';
import type { GameState } from '@shared/types';
import { quickMatch } from '@/net/socket';
import { play } from '@/audio/sfx';
import { useAuth } from '@/store/auth';
import { leaveTable, saveSession, useGame } from '@/store/game';
import { AuthDialog } from './AuthDialog';
import { CharacterArt, CharacterAvatar } from './characters';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** End of match: podium, your place, and what you earned. */
export function Results({ state, playerId }: { state: GameState; playerId: string | null }) {
  const reward = useGame((s) => s.reward);
  const toast = useGame((s) => s.toast);
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fill, setFill] = useState(0);

  const order = state.standings?.length
    ? state.standings.map((id) => state.players.find((p) => p.id === id)!).filter(Boolean)
    : [...state.players].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id));
  const myPlace = order.findIndex((p) => p.id === playerId);
  const won = myPlace === 0;

  // Keep the menu's numbers in step with what was just earned.
  useEffect(() => {
    if (reward?.user) setUser(reward.user);
  }, [reward, setUser]);

  useEffect(() => { play(won ? 'win' : 'card'); }, [won]);

  const after = reward?.user?.xp ?? null;
  const before = after !== null && reward ? after - reward.xp : null;
  const lpAfter = after !== null ? levelProgress(after) : null;
  const levelledUp = before !== null && after !== null && levelProgress(before).level < levelProgress(after).level;

  useEffect(() => {
    if (!lpAfter || before === null) return;
    const start = levelProgress(before);
    setFill(levelledUp ? 0 : start.pct);
    const h = setTimeout(() => setFill(lpAfter.pct), 450);
    return () => clearTimeout(h);
  }, [after]);

  const again = async () => {
    setBusy(true);
    const me = state.players.find((p) => p.id === playerId);
    leaveTable();
    const r = await quickMatch({ name: me?.name ?? '', token: me?.token, color: me?.color });
    setBusy(false);
    if (!r.ok || !r.state || !r.playerId) { toast(r.error ?? 'Could not find a match. Try again.'); return; }
    saveSession({ code: r.state.code, sessionToken: r.sessionToken!, playerId: r.playerId });
    useGame.setState({ state: r.state, playerId: r.playerId, reward: null });
  };

  const reason = state.endReason === 'rounds'
    ? `Final round reached after ${state.round} round${state.round === 1 ? '' : 's'} — richest player wins.`
    : state.endReason === 'abandoned' ? 'The match ended early.' : 'Everyone else went bankrupt.';

  return (
    <div className="sp-results-scrim">
      <div className="sp-results sp-card" role="dialog" aria-label="Match results">
        <p className="sp-eyebrow">{reason}</p>
        <h1 className="sp-results-title" data-won={won}>
          {myPlace < 0 ? 'Match over' : won ? 'You won!' : `You finished ${ORDINAL[myPlace]}`}
        </h1>

        <div className="sp-podium">
          {[1, 0, 2].map((rank) => {
            const p = order[rank];
            if (!p) return <div key={rank} className="sp-step" data-rank={rank} />;
            return (
              <div key={p.id} className="sp-step" data-rank={rank} data-me={p.id === playerId || undefined}
                style={{ ['--pc' as string]: p.color }}>
                <CharacterArt token={p.token} color={p.color} size={rank === 0 ? 108 : 82} />
                <b>{p.name}</b>
                <small>{money(netWorth(state, p.id))}</small>
                <div className="sp-block">{rank + 1}</div>
              </div>
            );
          })}
        </div>

        {order.length > 3 && (
          <ol className="sp-rest">
            {order.slice(3).map((p, i) => (
              <li key={p.id} data-me={p.id === playerId || undefined}>
                <span className="sp-rest-rank">{i + 4}</span>
                <CharacterAvatar token={p.token} color={p.color} size={24} />
                <span className="grow">{p.name}</span>
                <span>{money(netWorth(state, p.id))}</span>
              </li>
            ))}
          </ol>
        )}

        {reward && (
          <div className="sp-earned">
            <div className="sp-earn"><span className="sp-earn-num">+{reward.xp}</span><small>XP</small></div>
            <div className="sp-earn"><span className="sp-earn-num coin">+{reward.coins}</span><small>Coins</small></div>
            {lpAfter && (
              <div className="sp-earn-bar grow">
                <div className="sp-level-row">
                  <span className="sp-level-badge">{lpAfter.level}</span>
                  {levelledUp && <span className="sp-levelup">Level up!</span>}
                </div>
                <div className="sp-bar"><i style={{ width: `${Math.round(fill * 100)}%` }} /></div>
                <small>{lpAfter.into} / {lpAfter.span} XP to level {lpAfter.level + 1}</small>
              </div>
            )}
          </div>
        )}

        {user?.isGuest && (
          <button className="sp-nudge" onClick={() => setSignup(true)}>
            Playing as a guest. <b>Create an account</b> to keep your level and coins on any device.
          </button>
        )}

        <div className="sp-results-actions">
          <button className="sp-btn sp-btn-sun sp-btn-lg" onClick={again} disabled={busy}>
            {busy ? 'Finding a match…' : 'Play again'}
          </button>
          <button className="sp-btn sp-btn-lg" onClick={leaveTable}>Back to menu</button>
        </div>
      </div>
      {signup && <AuthDialog initial="signup" onClose={() => setSignup(false)} />}
    </div>
  );
}
