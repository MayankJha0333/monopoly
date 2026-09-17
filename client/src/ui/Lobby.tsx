import { useEffect, useState } from 'react';
import { PLAYER_COLORS, TOKENS } from '@shared/board';
import type { GameState, RoomSettings, TokenId } from '@shared/types';
import { send } from '@/net/socket';
import { play } from '@/audio/sfx';
import { leaveTable, useGame } from '@/store/game';
import { Backdrop } from './Backdrop';
import { VoiceBar } from './VoiceBar';
import { CHARACTERS, CharacterArt, CharacterAvatar } from './characters';

interface Props { state: GameState; playerId: string }

const IDS = TOKENS.map((t) => t.id as TokenId);

/** The private table: friends arrive here, the host sets the rules and starts. */
export function Lobby({ state, playerId }: Props) {
  const toast = useGame((s) => s.toast);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const s = state.settings;
  const everyoneReady = state.players.every((p) => p.ready || p.isHost);
  const link = `${location.origin}/?room=${state.code}`;
  const seats = Array.from({ length: s.maxPlayers }, (_, i) => state.players[i] ?? null);
  const readyCount = state.players.filter((p) => p.ready || p.isHost).length;

  const patch = (p: Partial<RoomSettings>) => { send('room:settings', p); play('click'); };

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? state.code : link;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      play('click');
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast(what === 'code' ? `Table code: ${state.code}` : `Invite link: ${link}`);
    }
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: 'Join my Rent Rush table', text: `Join my table on Rent Rush — code ${state.code}`, url: link }); } catch { /* closed */ }
    } else {
      await copy('link');
    }
  };

  const takenToken = (t: string) => state.players.some((p) => p.id !== playerId && p.token === t);
  const takenColor = (c: string) => state.players.some((p) => p.id !== playerId && p.color === c);
  const idx = IDS.indexOf(me?.token ?? 'hat');
  const cycle = (dir: number) => {
    for (let k = 1; k <= IDS.length; k++) {
      const next = IDS[(idx + dir * k + IDS.length * 2) % IDS.length]!;
      if (!takenToken(next)) { send('room:appearance', { token: next }); play('click'); return; }
    }
  };

  const startLabel = state.players.length < 2
    ? 'Waiting for players…'
    : everyoneReady ? 'Start the game' : 'Waiting for everyone to be ready';

  return (
    <div className="sp-home sp-lobby">
      <Backdrop />

      <header className="sp-top">
        <div className="sp-logo" aria-label="Rent Rush">
          <span className="sp-logo-sun" aria-hidden="true" />
          <span className="sp-logo-word">RENT RUSH</span>
        </div>
        <div className="sp-top-right">
          <span className="sp-chip">{state.players.length} / {s.maxPlayers} seated</span>
          <button className="sp-btn sp-btn-sm sp-btn-ghost" onClick={() => { play('click'); leaveTable(); }}>
            Leave table
          </button>
        </div>
      </header>

      <main className="lb-main">
        {/* Invite */}
        <section className="sp-card lb-invite">
          <div className="lb-invite-copy">
            <p className="lb-eyebrow">{isHost ? 'Your table' : `${state.players.find((p) => p.isHost)?.name ?? 'The host'}'s table`}</p>
            <h1 className="lb-title">{s.name}</h1>
            <p className="sp-muted">Friends join with this code, or with the invite link.</p>
          </div>
          <div className="code-badge lb-code">
            <span className="lb-code-label">Table code</span>
            <span className="code" aria-label={`Table code ${state.code.split('').join(' ')}`}>{state.code}</span>
          </div>
          <div className="lb-invite-actions">
            <button className="sp-btn sp-btn-sm" onClick={() => copy('code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
            <button className="sp-btn sp-btn-sm" onClick={() => copy('link')}>{copied === 'link' ? 'Copied!' : 'Copy invite'}</button>
            <button className="sp-btn sp-btn-sm sp-btn-sea" onClick={share}>Share</button>
          </div>
        </section>

        {/* Voice and video — only at tables made with friends */}
        <section className="sp-card lb-voice-card" aria-label="Voice chat">
          <VoiceBar />
        </section>

        {/* Seats */}
        <section className="sp-card lb-seats-card" aria-label="Players">
          <div className="lb-head">
            <h2>Players</h2>
            <span className="sp-muted">{readyCount} of {state.players.length} ready</span>
          </div>
          <div className="lb-seats">
            {seats.map((p, i) => p ? (
              <div className="seat lb-seat" key={p.id} data-filled="true" data-me={p.id === playerId || undefined}
                style={{ ['--pc' as string]: p.color }}>
                <CharacterAvatar token={p.token} color={p.color} size={58} />
                <b className="nm">{p.name}</b>
                <small>{p.id === playerId ? 'You' : CHARACTERS[p.token]?.name}</small>
                <span className="lb-tags">
                  {p.isHost && <span className="lb-tag lb-tag-host">Host</span>}
                  {!p.isHost && (p.ready
                    ? <span className="lb-tag lb-tag-ready">Ready</span>
                    : <span className="lb-tag">Not ready</span>)}
                </span>
                {isHost && p.id !== playerId && (
                  <button className="lb-kick" aria-label={`Remove ${p.name}`} title="Remove"
                    onClick={() => send('room:kick', { playerId: p.id })}>Remove</button>
                )}
              </div>
            ) : (
              <div className="lb-seat lb-empty" key={`empty-${i}`}>
                <span className="lb-empty-ring" aria-hidden="true">+</span>
                <b>Open seat</b>
                <small>Waiting for a friend</small>
              </div>
            ))}
          </div>
          {isHost && state.players.length < s.maxPlayers && (
            <button className="sp-btn sp-btn-block lb-fill" onClick={() => { send('room:addBot'); play('click'); }}>
              + Fill a seat
            </button>
          )}
        </section>

        {/* You */}
        {me && (
          <section className="sp-card lb-you" aria-label="Your look">
            <div className="lb-head"><h2>You</h2></div>
            <div className="sp-carousel">
              <button className="sp-arrow" onClick={() => cycle(-1)} aria-label="Previous character">‹</button>
              <div className="sp-hero" style={{ ['--pc' as string]: me.color }}>
                <CharacterArt token={me.token} color={me.color} size={120} />
              </div>
              <button className="sp-arrow" onClick={() => cycle(1)} aria-label="Next character">›</button>
            </div>
            <div className="sp-hero-name">{CHARACTERS[me.token]?.name}</div>
            <div className="sp-swatches" role="radiogroup" aria-label="Colour">
              {PLAYER_COLORS.map((c) => (
                <button key={c} role="radio" aria-checked={me.color === c} aria-label={`Colour ${c}`}
                  data-on={me.color === c} disabled={takenColor(c)} style={{ background: c }}
                  onClick={() => { send('room:appearance', { color: c }); play('click'); }} />
              ))}
            </div>
          </section>
        )}

        {/* Rules */}
        <section className="sp-card lb-rules" aria-label="House rules">
          <div className="lb-head">
            <h2>House rules</h2>
            {!isHost && <span className="sp-muted">Set by the host</span>}
          </div>
          <div className="lb-rule-list">
            <Rule label="Private table" hint="Hidden from the open tables list." on={s.isPrivate}
              disabled={!isHost} onChange={(v) => patch({ isPrivate: v })} />
            <Rule label="Auctions" hint="A passed street goes to the highest bidder." on={s.auctions}
              disabled={!isHost} onChange={(v) => patch({ auctions: v })} />
            <Rule label="Beach Break pot" hint="Taxes and fines pile up on Beach Break." on={s.freeParkingPot}
              disabled={!isHost} onChange={(v) => patch({ freeParkingPot: v })} />
            <Rule label="Double rent on full sets" hint="Own a whole colour, charge double." on={s.doubleRentOnFullSet}
              disabled={!isHost} onChange={(v) => patch({ doubleRentOnFullSet: v })} />
            <Rule label="Build evenly" hint="Spread houses across a set." on={s.evenBuild}
              disabled={!isHost} onChange={(v) => patch({ evenBuild: v })} />
            <Rule label="Limited buildings" hint="Only 32 houses and 12 hotels." on={s.limitedHouses}
              disabled={!isHost} onChange={(v) => patch({ limitedHouses: v })} />
            <Rule label="Double pay on Start" hint="Land exactly on Start for $400." on={s.doubleGoSalary}
              disabled={!isHost} onChange={(v) => patch({ doubleGoSalary: v })} />
            <Rule label="Collect rent in Lockup" hint="Owners still collect while in Lockup." on={s.rentInJail}
              disabled={!isHost} onChange={(v) => patch({ rentInJail: v })} />
          </div>
          <div className="lb-numbers">
            <NumberRule label="Match length" unit="rounds" hint="0 plays to the end" value={s.maxRounds}
              min={0} max={200} step={5} disabled={!isHost} onChange={(v) => patch({ maxRounds: v })} />
            <NumberRule label="Turn timer" unit="sec" hint="0 turns it off" value={s.turnSeconds}
              min={0} max={600} step={15} disabled={!isHost} onChange={(v) => patch({ turnSeconds: v })} />
            <NumberRule label="Starting cash" unit="$" hint="Everyone begins with this" value={s.startingCash}
              min={500} max={50000} step={100} disabled={!isHost} onChange={(v) => patch({ startingCash: v })} />
            <NumberRule label="Max players" unit="" hint="Between 2 and 8" value={s.maxPlayers}
              min={2} max={8} step={1} disabled={!isHost} onChange={(v) => patch({ maxPlayers: v })} />
          </div>
        </section>
      </main>

      <footer className="lb-bar">
        <p className="lb-bar-note">
          {isHost
            ? state.players.length < 2
              ? 'Share the code, or fill a seat to start right away.'
              : everyoneReady ? 'Everyone is ready.' : 'Waiting for everyone to press Ready.'
            : me?.ready ? 'You are ready. The host will start soon.' : 'Press Ready when you are set.'}
        </p>
        {isHost ? (
          <button
            className="sp-btn sp-btn-sun sp-btn-lg lb-go"
            disabled={state.players.length < 2 || !everyoneReady}
            onClick={() => { play('click'); send('room:start'); }}
          >
            {startLabel}
          </button>
        ) : (
          <button
            className={`sp-btn sp-btn-lg lb-go ${me?.ready ? 'sp-btn-leaf' : 'sp-btn-sun'}`}
            onClick={() => { play('click'); send('room:ready', { ready: !me?.ready }); }}
          >
            {me?.ready ? "You're ready — tap to undo" : "I'm ready"}
          </button>
        )}
      </footer>
    </div>
  );
}

function Rule({ label, hint, on, disabled, onChange }: {
  label: string; hint: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting lb-rule">
      <div className="txt"><b>{label}</b><small>{hint}</small></div>
      <button className="sp-toggle" data-on={on} aria-pressed={on} disabled={disabled} aria-label={label}
        onClick={() => onChange(!on)} />
    </div>
  );
}

function NumberRule({ label, unit, hint, value, min, max, step, disabled, onChange }: {
  label: string; unit: string; hint: string; value: number; min: number; max: number; step: number;
  disabled: boolean; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Number.isFinite(v) ? v : value)));
  return (
    <div className="setting lb-number">
      <div className="txt"><b>{label}</b><small>{hint}</small></div>
      <div className="lb-stepper">
        <button disabled={disabled || value <= min} aria-label={`Less ${label.toLowerCase()}`} onClick={() => set(value - step)}>−</button>
        <label className="lb-num">
          {unit === '$' && <span>$</span>}
          <input type="number" min={min} max={max} step={step} value={draft} disabled={disabled}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => set(Number(draft))}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          {unit && unit !== '$' && <span>{unit}</span>}
        </label>
        <button disabled={disabled || value >= max} aria-label={`More ${label.toLowerCase()}`} onClick={() => set(value + step)}>+</button>
      </div>
    </div>
  );
}
