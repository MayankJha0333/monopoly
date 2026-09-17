import { useState, type FormEvent } from 'react';
import { ApiError } from '@/net/api';
import { useAuth } from '@/store/auth';
import { useGame } from '@/store/game';
import { play } from '@/audio/sfx';
import { Dialog } from './Dialog';

type Mode = 'login' | 'signup';

function PasswordField({ id, value, onChange, error, autoComplete, hint }: {
  id: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="sp-field" data-error={!!error || undefined}>
      <label htmlFor={id}>Password</label>
      <div className="sp-pass">
        <input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)} maxLength={128} required />
        <button type="button" className="sp-pass-toggle" onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <small className="sp-err">{error}</small> : hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function AuthDialog({ initial, onClose }: { initial: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initial);
  const user = useAuth((s) => s.user);
  const signup = useAuth((s) => s.signup);
  const login = useAuth((s) => s.login);
  const toast = useGame((s) => s.toast);

  const [loginName, setLoginName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => { setMode(m); setErrors({}); setPassword(''); setConfirm(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (mode === 'signup') {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) next.username = 'Use 3–16 letters, numbers or underscores.';
      if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Enter a valid email address.';
      if (password.length < 8) next.password = 'Use at least 8 characters.';
      else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) next.password = 'Use at least one letter and one number.';
      if (confirm !== password) next.confirm = 'The two passwords do not match.';
    } else {
      if (!loginName.trim()) next.login = 'Enter your username or email.';
      if (!password) next.password = 'Enter your password.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signup({ username: username.trim(), email: email.trim(), password });
        toast(`Welcome to Rent Rush, ${username.trim()}!`);
      } else {
        await login({ login: loginName.trim(), password });
        toast('Logged in.');
      }
      play('buy');
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setErrors({ [e2.field ?? 'form']: e2.message });
    } finally {
      setBusy(false);
    }
  };

  const upgrading = mode === 'signup' && user?.isGuest;

  return (
    <Dialog onClose={onClose} label={mode === 'login' ? 'Log in' : 'Create an account'}>
      <div className="sp-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} data-on={mode === 'login'} onClick={() => switchTo('login')}>Log in</button>
        <button role="tab" aria-selected={mode === 'signup'} data-on={mode === 'signup'} onClick={() => switchTo('signup')}>Sign up</button>
      </div>

      <form className="sp-form" onSubmit={submit} noValidate>
        {mode === 'login' ? (
          <>
            <p className="sp-lede">Welcome back. Your level, coins and wins are waiting.</p>
            <div className="sp-field" data-error={!!errors.login || undefined}>
              <label htmlFor="login-name">Username or email</label>
              <input id="login-name" value={loginName} autoComplete="username"
                onChange={(e) => setLoginName(e.target.value)} maxLength={254} required />
              {errors.login && <small className="sp-err">{errors.login}</small>}
            </div>
            <PasswordField id="login-pass" value={password} onChange={setPassword} error={errors.password}
              autoComplete="current-password" />
          </>
        ) : (
          <>
            <p className="sp-lede">
              {upgrading
                ? `Keep everything you earned as ${user?.name} — your level and coins move to your new account.`
                : 'Save your level, coins and wins, and play from any device.'}
            </p>
            <div className="sp-field" data-error={!!errors.username || undefined}>
              <label htmlFor="su-name">Username</label>
              <input id="su-name" value={username} autoComplete="username" maxLength={16}
                onChange={(e) => setUsername(e.target.value)} required />
              {errors.username ? <small className="sp-err">{errors.username}</small> : <small>This is the name other players see.</small>}
            </div>
            <div className="sp-field" data-error={!!errors.email || undefined}>
              <label htmlFor="su-email">Email</label>
              <input id="su-email" type="email" value={email} autoComplete="email" maxLength={254}
                onChange={(e) => setEmail(e.target.value)} required />
              {errors.email && <small className="sp-err">{errors.email}</small>}
            </div>
            <PasswordField id="su-pass" value={password} onChange={setPassword} error={errors.password}
              autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
            <div className="sp-field" data-error={!!errors.confirm || undefined}>
              <label htmlFor="su-confirm">Confirm password</label>
              <input id="su-confirm" type="password" value={confirm} autoComplete="new-password" maxLength={128}
                onChange={(e) => setConfirm(e.target.value)} required />
              {errors.confirm && <small className="sp-err">{errors.confirm}</small>}
            </div>
          </>
        )}

        {errors.form && <div className="sp-banner" role="alert">{errors.form}</div>}

        <button className="sp-btn sp-btn-sun sp-btn-block" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <p className="sp-switch">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="sp-link" onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </form>
    </Dialog>
  );
}
