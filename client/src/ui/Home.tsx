import { useEffect, useState } from 'react';
import { PLAYER_COLORS, TOKENS } from '@shared/board';
import { levelProgress } from '@shared/progress';
import type { JoinResult, TokenId } from '@shared/types';
import { quickMatch } from '@/net/socket';
import { useAuth } from '@/store/auth';
import { saveSession, useGame } from '@/store/game';
import { play } from '@/audio/sfx';
import { AuthDialog } from './AuthDialog';
import { Backdrop } from './Backdrop';
import { CHARACTERS, CharacterArt, CharacterAvatar } from './characters';
import {
  HowToDialog, LeaderboardDialog, PrivateTableDialog, ProfileDialog, SettingsDialog,
} from './MenuDialogs';

const LOOK_KEY = 'sunnyport.look';
const IDS = TOKENS.map((t) => t.id as TokenId);

type Open = null | 'login' | 'signup' | 'private' | 'leaders' | 'settings' | 'howto' | 'profile';

function loadLook(): { name: string; token: TokenId; color: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as Partial<{ name: string; token: TokenId; color: string }> | null;
    return {
      name: saved?.name ?? '',
      token: saved?.token && IDS.includes(saved.token) ? saved.token : IDS[Math.floor(Math.random() * IDS.length)]!,
      color: saved?.color && PLAYER_COLORS.includes(saved.color) ? saved.color : PLAYER_COLORS[0]!,
    };
  } catch {
    return { name: '', token: 'hat', color: PLAYER_COLORS[0]! };
  }
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

const ICONS = {
  friends: 'M16 11a4 4 0 1 0-8 0M3 20c1.5-3.5 4.7-5 9-5s7.5 1.5 9 5M19 8v6M16 11h6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
};

export function Home() {
  const connected = useGame((s) => s.connected);
  const online = useGame((s) => s.online);
  const toast = useGame((s) => s.toast);
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const ensureAccount = useAuth((s) => s.ensureAccount);
  const saveLook = useAuth((s) => s.saveLook);

  const [look, setLook] = useState(loadLook);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const invite = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

  // An account's saved look wins over the one on this device.
  useEffect(() => {
    if (!user) return;
    setLook((l) => ({ name: user.isGuest ? (l.name || user.name) : user.name, token: user.token as TokenId, color: user.color }));
  }, [user?.id]);

  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* private mode */ }
  }, [look]);

  useEffect(() => { if (invite) setOpen('private'); }, [invite]);

  const update = (patch: Partial<typeof look>) => {
    setLook((l) => ({ ...l, ...patch }));
    saveLook(patch);
  };

  const member = user && !user.isGuest;
  const name = member ? user.name : look.name;
  const idx = IDS.indexOf(look.token);
  const cycle = (dir: number) => { update({ token: IDS[(idx + dir + IDS.length) % IDS.length]! }); play('click'); };

  const ensure = async (): Promise<boolean> => {
    const clean = name.trim();
    if (!member && clean.length > 0 && clean.length < 2) {
      toast('Pick a name with at least two characters.');
      return false;
    }
    try {
      await ensureAccount({ name: clean, token: look.token, color: look.color });
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    }
  };

  const accept = (r: JoinResult) => {
    if (!r.ok || !r.state || !r.playerId) {
      toast(r.error ?? 'Could not join. Try again.');
      return;
    }
    saveSession({ code: r.state.code, sessionToken: r.sessionToken!, playerId: r.playerId });
    useGame.setState({ state: r.state, playerId: r.playerId, reward: null });
    if (invite) history.replaceState(null, '', location.pathname);
    play('click');
  };

  const onPlay = async () => {
    if (busy) return;
    setBusy(true);
    play('click');
    if (await ensure()) accept(await quickMatch({ name: name.trim(), token: look.token, color: look.color }));
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') void onPlay();
      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const character = CHARACTERS[look.token];
  const lp = levelProgress(user?.xp ?? 0);

  return (
    <div className="sp-home">
      <Backdrop />

      <header className="sp-top">
        <div className="sp-logo" aria-label="Sunnyport">
          <span className="sp-logo-sun" aria-hidden="true" />
          <span className="sp-logo-word">SUNNYPORT</span>
        </div>
        <div className="sp-top-right">
          <span className="sp-chip sp-online" data-live={connected}>
            <i />{connected ? `${Math.max(1, online)} online` : 'Connecting…'}
          </span>
          {user && (
            <span className="sp-chip sp-coins" title="Coins">
              <i className="coin" aria-hidden="true" />{user.coins}
            </span>
          )}
          {user ? (
            <button className="sp-chip sp-me" onClick={() => setOpen('profile')}>
              <CharacterAvatar token={user.token as TokenId} color={user.color} size={28} />
              <span className="sp-me-name">{user.name}</span>
              <span className="sp-lvl">Lv {lp.level}</span>
            </button>
          ) : null}
          {ready && (!user || user.isGuest) && (
            <>
              <button className="sp-btn sp-btn-sm sp-btn-ghost" onClick={() => setOpen('login')}>Log in</button>
              <button className="sp-btn sp-btn-sm sp-btn-sun" onClick={() => setOpen('signup')}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <main className="sp-stage">
        <section className="sp-card sp-player" aria-label="Your player">
          <div className="sp-field">
            <label htmlFor="nick">{member ? 'Playing as' : 'Nickname'}</label>
            {member ? (
              <div className="sp-nick-locked">{user.name}</div>
            ) : (
              <input id="nick" value={look.name} maxLength={16} placeholder={user?.name ?? 'Your name'}
                autoComplete="nickname" onChange={(e) => update({ name: e.target.value })} />
            )}
          </div>

          <div className="sp-carousel">
            <button className="sp-arrow" onClick={() => cycle(-1)} aria-label="Previous character"><Icon d={ICONS.left} /></button>
            <div className="sp-hero" style={{ ['--pc' as string]: look.color }}>
              <CharacterArt token={look.token} color={look.color} size={168} />
            </div>
            <button className="sp-arrow" onClick={() => cycle(1)} aria-label="Next character"><Icon d={ICONS.right} /></button>
          </div>
          <div className="sp-hero-name">{character?.name}</div>
          <p className="sp-hero-tag">{character?.tagline}</p>

          <div className="sp-swatches" role="radiogroup" aria-label="Colour">
            {PLAYER_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={look.color === c} aria-label={`Colour ${c}`}
                data-on={look.color === c} style={{ background: c }}
                onClick={() => { update({ color: c }); play('click'); }} />
            ))}
          </div>
        </section>

        <section className="sp-play-col">
          <button className="sp-play" onClick={onPlay} disabled={busy || !connected}>
            <span className="sp-play-word">{busy ? 'FINDING…' : 'PLAY'}</span>
            <span className="sp-play-sub">Quick match · 4 players · about 10 minutes</span>
          </button>
          <div className="sp-menu">
            <button className="sp-tile" onClick={() => setOpen('private')}>
              <Icon d={ICONS.friends} /><span>Play with friends</span>
            </button>
            <button className="sp-tile" onClick={() => setOpen('leaders')}>
              <Icon d={ICONS.trophy} /><span>Leaderboard</span>
            </button>
            <button className="sp-tile" onClick={() => setOpen('howto')}>
              <Icon d={ICONS.help} /><span>How to play</span>
            </button>
            <button className="sp-tile" onClick={() => setOpen('settings')}>
              <Icon d={ICONS.cog} /><span>Settings</span>
            </button>
          </div>
          {user?.isGuest && user.games > 0 && (
            <button className="sp-nudge" onClick={() => setOpen('signup')}>
              You are level {lp.level} with {user.coins} coins. <b>Sign up to keep them.</b>
            </button>
          )}
        </section>
      </main>

      <footer className="sp-foot">
        <span>Sunnyport · an island trading game</span>
        <span className="sp-hint">Press Enter to play · ← → to change character</span>
      </footer>

      {(open === 'login' || open === 'signup') && <AuthDialog initial={open} onClose={() => setOpen(null)} />}
      {open === 'private' && (
        <PrivateTableDialog
          look={{ name: name.trim(), token: look.token, color: look.color }}
          initialCode={invite}
          onClose={() => setOpen(null)}
          onJoined={(r) => { accept(r); if (r.ok) setOpen(null); }}
          ensure={ensure}
        />
      )}
      {open === 'leaders' && <LeaderboardDialog onClose={() => setOpen(null)} />}
      {open === 'settings' && <SettingsDialog onClose={() => setOpen(null)} />}
      {open === 'howto' && <HowToDialog onClose={() => setOpen(null)} />}
      {open === 'profile' && <ProfileDialog onClose={() => setOpen(null)} onSignup={() => setOpen('signup')} />}
    </div>
  );
}
