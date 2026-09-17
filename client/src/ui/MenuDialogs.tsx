import { useEffect, useState } from 'react';
import { levelProgress, type LeaderRow } from '@shared/progress';
import type { JoinResult, RoomSummary, TokenId } from '@shared/types';
import { api } from '@/net/api';
import { createRoom, joinRoom, listRooms } from '@/net/socket';
import { isMuted, isMusicOn, play, setMuted, setMusicEnabled } from '@/audio/sfx';
import { useAuth } from '@/store/auth';
import { useGame } from '@/store/game';
import { usePrefs, webglAvailable } from '@/store/prefs';
import { CharacterAvatar } from './characters';
import { Dialog } from './Dialog';

export interface Look { name: string; token: TokenId; color: string }

export function PrivateTableDialog({ look, initialCode, onClose, onJoined, ensure }: {
  look: Look;
  initialCode: string;
  onClose: () => void;
  onJoined: (r: JoinResult) => void;
  ensure: () => Promise<boolean>;
}) {
  const connected = useGame((s) => s.connected);
  const toast = useGame((s) => s.toast);
  const [code, setCode] = useState(initialCode);
  const [isPrivate, setPrivate] = useState(true);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const refresh = () => listRooms().then(setRooms).catch(() => undefined);
    refresh();
    const h = setInterval(refresh, 5000);
    return () => clearInterval(h);
  }, [connected]);

  const create = async () => {
    setBusy(true);
    if (await ensure()) {
      onJoined(await createRoom({ ...look, settings: { name: `${look.name}'s table`, isPrivate } }));
    }
    setBusy(false);
  };

  const join = async (c: string) => {
    if (c.trim().length < 5) { toast('Enter the five-character table code.'); return; }
    setBusy(true);
    if (await ensure()) onJoined(await joinRoom({ ...look, code: c.trim().toUpperCase() }));
    setBusy(false);
  };

  return (
    <Dialog title="Play with friends" onClose={onClose}>
      <div className="sp-stack">
        <section className="sp-panel">
          <h3>Create a table</h3>
          <p className="sp-muted">You pick the rules, then share the code with your friends.</p>
          <label className="sp-check">
            <input type="checkbox" checked={!isPrivate} onChange={(e) => setPrivate(!e.target.checked)} />
            <span>List it publicly so anyone can join</span>
          </label>
          <button className="sp-btn sp-btn-sun sp-btn-block" disabled={busy || !connected} onClick={create}>
            Create table
          </button>
        </section>

        <section className="sp-panel">
          <h3>Join with a code</h3>
          <form className="sp-row" onSubmit={(e) => { e.preventDefault(); void join(code); }}>
            <input className="sp-code" value={code} maxLength={5} placeholder="ABC12" aria-label="Table code"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button className="sp-btn sp-btn-sea" disabled={busy || !connected} type="submit">Join</button>
          </form>
        </section>

        <section className="sp-panel">
          <h3>Open tables</h3>
          {rooms.length === 0 ? (
            <p className="sp-muted">No open tables right now. Create one and list it publicly.</p>
          ) : (
            <ul className="sp-rooms">
              {rooms.map((r) => (
                <li key={r.code}>
                  <div className="grow">
                    <b>{r.name}</b>
                    <small>{r.hostName} · {r.players}/{r.maxPlayers} players</small>
                  </div>
                  <button className="sp-btn sp-btn-sm" disabled={busy} onClick={() => join(r.code)}>Join</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}

export function LeaderboardDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState('');
  const me = useAuth((s) => s.user);
  useEffect(() => {
    api.leaderboard().then((r) => setRows(r.rows)).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <Dialog title="Leaderboard" onClose={onClose} wide>
      {error && <div className="sp-banner">{error}</div>}
      {!rows && !error && <p className="sp-muted">Loading the top players…</p>}
      {rows && rows.length === 0 && (
        <p className="sp-muted">No ranked players yet. Create an account and win a match to take the top spot.</p>
      )}
      {rows && rows.length > 0 && (
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr><th>#</th><th>Player</th><th>Level</th><th>Wins</th><th>Games</th><th>Win rate</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} data-me={me?.username === r.name || undefined}>
                  <td className="rank" data-top={i < 3 || undefined}>{i + 1}</td>
                  <td>
                    <span className="sp-who">
                      <CharacterAvatar token={r.token as TokenId} color={r.color} size={28} />
                      {r.name}
                    </span>
                  </td>
                  <td>{levelProgress(r.xp).level}</td>
                  <td>{r.wins}</td>
                  <td>{r.games}</td>
                  <td>{r.games ? Math.round((r.wins / r.games) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {me?.isGuest && <p className="sp-muted">Guests are not ranked. Sign up to appear here.</p>}
    </Dialog>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const view = usePrefs((s) => s.view);
  const quality = usePrefs((s) => s.quality);
  const setView = usePrefs((s) => s.setView);
  const setQuality = usePrefs((s) => s.setQuality);
  const [muted, setM] = useState(isMuted());
  const [music, setMu] = useState(isMusicOn());
  const can3d = webglAvailable();

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="sp-settings">
        <div className="sp-setting">
          <div><b>Board view</b><small>{can3d ? '3D looks best. 2D is lighter on older phones.' : 'This device cannot show 3D, so the 2D board is used.'}</small></div>
          <div className="sp-seg" role="radiogroup" aria-label="Board view">
            <button role="radio" aria-checked={view === '3d'} data-on={view === '3d'} disabled={!can3d} onClick={() => setView('3d')}>3D</button>
            <button role="radio" aria-checked={view === '2d'} data-on={view === '2d'} onClick={() => setView('2d')}>2D</button>
          </div>
        </div>
        <div className="sp-setting">
          <div><b>Graphics</b><small>Low turns off shadows and some scenery for smoother play.</small></div>
          <div className="sp-seg" role="radiogroup" aria-label="Graphics">
            <button role="radio" aria-checked={quality === 'high'} data-on={quality === 'high'} onClick={() => setQuality('high')}>High</button>
            <button role="radio" aria-checked={quality === 'low'} data-on={quality === 'low'} onClick={() => setQuality('low')}>Low</button>
          </div>
        </div>
        <div className="sp-setting">
          <div><b>Sound effects</b><small>Dice, coins and card sounds.</small></div>
          <button className="sp-toggle" role="switch" aria-checked={!muted} data-on={!muted}
            onClick={() => { const n = !muted; setMuted(n); setM(n); if (!n) play('click'); }} />
        </div>
        <div className="sp-setting">
          <div><b>Music</b><small>The background tune during a match.</small></div>
          <button className="sp-toggle" role="switch" aria-checked={music} data-on={music}
            onClick={() => { const n = !music; setMusicEnabled(n); setMu(n); }} />
        </div>
      </div>
    </Dialog>
  );
}

export function HowToDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How to play" onClose={onClose}>
      <ol className="sp-howto">
        <li><b>Roll and move.</b> Press Roll (or R). Your piece walks around the island board.</li>
        <li><b>Buy streets.</b> Land on an unowned street and buy it. Other players pay you rent when they land there.</li>
        <li><b>Collect a colour set.</b> Own every street of one colour to double the rent and start building houses.</li>
        <li><b>Build and trade.</b> Houses and hotels raise rent a lot. Trade streets with other players to finish your sets.</li>
        <li><b>Win.</b> Be the last player standing, or the richest when the final round ends.</li>
      </ol>
      <div className="sp-keys">
        <span><kbd>R</kbd> roll</span><span><kbd>E</kbd> end turn</span><span><kbd>M</kbd> manage</span><span><kbd>T</kbd> trade</span>
      </div>
    </Dialog>
  );
}

export function ProfileDialog({ onClose, onSignup }: { onClose: () => void; onSignup: () => void }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const toast = useGame((s) => s.toast);
  if (!user) return null;
  const lp = levelProgress(user.xp);
  const rate = user.games ? Math.round((user.wins / user.games) * 100) : 0;
  return (
    <Dialog onClose={onClose} label="Your profile">
      <div className="sp-profile">
        <CharacterAvatar token={user.token as TokenId} color={user.color} size={84} />
        <div>
          <h2 className="sp-dialog-title">{user.name}</h2>
          <p className="sp-muted">{user.isGuest ? 'Guest player — progress is saved on this device only.' : `Signed in as ${user.username}`}</p>
        </div>
      </div>
      <div className="sp-level">
        <span className="sp-level-badge">{lp.level}</span>
        <div className="grow">
          <div className="sp-bar"><i style={{ width: `${Math.round(lp.pct * 100)}%` }} /></div>
          <small>{lp.into} / {lp.span} XP to level {lp.level + 1}</small>
        </div>
      </div>
      <div className="sp-stats">
        <div><b>{user.games}</b><small>Games</small></div>
        <div><b>{user.wins}</b><small>Wins</small></div>
        <div><b>{rate}%</b><small>Win rate</small></div>
        <div><b>{user.coins}</b><small>Coins</small></div>
      </div>
      {user.isGuest ? (
        <button className="sp-btn sp-btn-sun sp-btn-block" onClick={onSignup}>Create an account to keep your progress</button>
      ) : (
        <button className="sp-btn sp-btn-block" onClick={async () => { await logout(); toast('Logged out.'); onClose(); }}>
          Log out
        </button>
      )}
    </Dialog>
  );
}
