import { useState } from 'react';
import { PLAYER_COLORS, TOKENS } from '@shared/board';
import type { GameState, RoomSettings, TokenId } from '@shared/types';
import { send } from '@/net/socket';
import { play } from '@/audio/sfx';
import { saveSession, useGame } from '@/store/game';
import { CHARACTERS, CharacterArt, CharacterAvatar } from './characters';

interface Props { state: GameState; playerId: string }

export function Lobby({ state, playerId }: Props) {
  const toast = useGame((s) => s.toast);
  const setState = useGame((s) => s.setState);
  const [copied, setCopied] = useState(false);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const s = state.settings;
  const everyoneReady = state.players.every((p) => p.ready || p.isHost);

  const patch = (p: Partial<RoomSettings>) => { send('room:settings', p); play('click'); };

  const copyInvite = async () => {
    const link = `${location.origin}/?room=${state.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(`Invite link: ${link}`);
    }
  };

  const leave = () => {
    send('room:leave');
    saveSession(null);
    setState(null as unknown as GameState);
    useGame.setState({ state: null, playerId: null });
  };

  const takenToken = (t: string) => state.players.some((p) => p.id !== playerId && p.token === t);
  const takenColor = (c: string) => state.players.some((p) => p.id !== playerId && p.color === c);

  return (
    <div className="screen">
      <div className="lobby">
        <header className="brand lobby-brand">
          {me && (
            <div className="lobby-me">
              <CharacterArt token={me.token} color={me.color} size={92} />
            </div>
          )}
          <div>
            <h1 className="display" style={{ fontSize: 'clamp(26px, 4.4vw, 40px)' }}>{s.name}</h1>
            <p>
              You are <b style={{ color: me?.color }}>{CHARACTERS[me?.token ?? 'hat']?.name}</b> at this table.
              Share the code below — anyone with it can take a seat.
            </p>
          </div>
        </header>

        <div className="card pane">
          <div className="row row-wrap">
            <div className="code-badge grow">
              <div className="grow">
                <div className="label">Room code</div>
                <div className="code">{state.code}</div>
              </div>
              <button className="btn btn-sm" onClick={copyInvite}>{copied ? 'Copied' : 'Copy invite'}</button>
            </div>
            <button className="btn" onClick={leave}>Leave</button>
          </div>
        </div>

        <div className="lobby-grid">
          <section className="card pane">
            <h2>Players ({state.players.length}/{s.maxPlayers})</h2>
            <div className="settings">
              {state.players.map((p) => (
                <div className="seat" key={p.id}>
                  <CharacterAvatar token={p.token} color={p.color} size={34} />
                  <span className="seat-who grow">
                    <span className="nm">{p.name}{p.id === playerId ? ' (you)' : ''}</span>
                    <small className="faint">{CHARACTERS[p.token]?.name}</small>
                  </span>
                  {p.isHost && <span className="tag tag-gold">Host</span>}
                  {!p.isHost && p.ready && <span className="tag tag-good">Ready</span>}
                  {isHost && p.id !== playerId && (
                    <button className="btn btn-sm btn-danger" onClick={() => send('room:kick', { playerId: p.id })}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isHost && state.players.length < s.maxPlayers && (
              <button className="btn btn-block" onClick={() => { send('room:addBot'); play('click'); }}>
                + Fill a seat
              </button>
            )}

            <div className="field">
              <span className="label">Change your character</span>
              <div className="tokens">
                {TOKENS.map((t) => (
                  <button
                    key={t.id}
                    className="token-btn"
                    data-on={me?.token === t.id}
                    disabled={takenToken(t.id)}
                    style={{ opacity: takenToken(t.id) ? 0.32 : 1 }}
                    onClick={() => send('room:appearance', { token: t.id as TokenId })}
                  >
                    <CharacterAvatar
                      token={t.id as TokenId}
                      color={me?.token === t.id ? (me?.color ?? '#64748b') : '#64748b'}
                      size={38}
                    />
                    {CHARACTERS[t.id as TokenId]?.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="label">Change your colour</span>
              <div className="swatches">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    className="swatch"
                    style={{ background: c, opacity: takenColor(c) ? 0.3 : 1 }}
                    data-on={me?.color === c}
                    disabled={takenColor(c)}
                    aria-label={`Colour ${c}`}
                    onClick={() => send('room:appearance', { color: c })}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="card pane">
            <h2>House rules</h2>
            {!isHost && <p className="hint">Only the host can change these.</p>}

            <div className="settings">
              <Setting label="Private table" hint="Hidden from the public list." on={s.isPrivate}
                disabled={!isHost} onChange={(v) => patch({ isPrivate: v })} />
              <Setting label="Auctions" hint="Declined properties go to the highest bidder." on={s.auctions}
                disabled={!isHost} onChange={(v) => patch({ auctions: v })} />
              <Setting label="Beach Break pot" hint="Taxes and fines pile up on Beach Break." on={s.freeParkingPot}
                disabled={!isHost} onChange={(v) => patch({ freeParkingPot: v })} />
              <Setting label="Double rent on full sets" hint="Unimproved colour sets charge double." on={s.doubleRentOnFullSet}
                disabled={!isHost} onChange={(v) => patch({ doubleRentOnFullSet: v })} />
              <Setting label="Build evenly" hint="Houses must be spread across a set." on={s.evenBuild}
                disabled={!isHost} onChange={(v) => patch({ evenBuild: v })} />
              <Setting label="Limited buildings" hint="The bank holds only 32 houses and 12 hotels." on={s.limitedHouses}
                disabled={!isHost} onChange={(v) => patch({ limitedHouses: v })} />
              <Setting label="Double pay on Start" hint="Landing exactly on Start pays $400." on={s.doubleGoSalary}
                disabled={!isHost} onChange={(v) => patch({ doubleGoSalary: v })} />
              <Setting label="Collect rent in Lockup" hint="Owners still collect while in Lockup." on={s.rentInJail}
                disabled={!isHost} onChange={(v) => patch({ rentInJail: v })} />

              <div className="setting">
                <div className="txt"><b>Starting cash</b><small>Everyone begins with this.</small></div>
                <input className="input num" type="number" min={500} max={50000} step={100}
                  value={s.startingCash} disabled={!isHost}
                  onChange={(e) => patch({ startingCash: Number(e.target.value) })} />
              </div>

              <div className="setting">
                <div className="txt"><b>Turn timer</b><small>Seconds per turn, 0 to disable.</small></div>
                <input className="input num" type="number" min={0} max={600} step={10}
                  value={s.turnSeconds} disabled={!isHost}
                  onChange={(e) => patch({ turnSeconds: Number(e.target.value) })} />
              </div>

              <div className="setting">
                <div className="txt"><b>Match length</b><small>Rounds before the richest player wins. 0 plays to the end.</small></div>
                <input className="input num" type="number" min={0} max={200} step={5}
                  value={s.maxRounds} disabled={!isHost}
                  onChange={(e) => patch({ maxRounds: Number(e.target.value) })} />
              </div>

              <div className="setting">
                <div className="txt"><b>Max players</b><small>Between 2 and 8.</small></div>
                <input className="input num" type="number" min={2} max={8}
                  value={s.maxPlayers} disabled={!isHost}
                  onChange={(e) => patch({ maxPlayers: Number(e.target.value) })} />
              </div>
            </div>

            {isHost ? (
              <button
                className="btn btn-gold btn-block"
                disabled={state.players.length < 2 || !everyoneReady}
                onClick={() => send('room:start')}
              >
                {state.players.length < 2
                  ? 'Waiting for players…'
                  : everyoneReady ? 'Start the game' : 'Waiting for everyone to be ready'}
              </button>
            ) : (
              <button
                className={me?.ready ? 'btn btn-good btn-block' : 'btn btn-gold btn-block'}
                onClick={() => send('room:ready', { ready: !me?.ready })}
              >
                {me?.ready ? "You're ready — click to undo" : "I'm ready"}
              </button>
            )}
            <p className="hint">{state.players.length} of {s.maxPlayers} seats taken. Empty seats can be filled so you can start right away.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Setting({ label, hint, on, disabled, onChange }: {
  label: string; hint: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting">
      <div className="txt"><b>{label}</b><small>{hint}</small></div>
      <button className="toggle" data-on={on} disabled={disabled} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  );
}
