/**
 * Desktop notifications for the moments a player would hate to miss while the
 * game is in another tab or behind another window: their turn, a trade offer,
 * a chat message, a match starting.
 *
 * Nothing is ever shown while the tab is in front — the game itself is the
 * better signal there — and nothing is shown until the player has switched
 * notifications on in Settings, which is also the only place the browser is
 * asked for permission (browsers only allow the ask from a real click).
 */

const KEY = 'rentrush.notify';

export type NotifyState = 'unsupported' | 'blocked' | 'off' | 'on';

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

const wanted = (): boolean => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export function notifyState(): NotifyState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return wanted() && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Switches notifications on, asking the browser the first time. */
export async function enableNotifications(): Promise<NotifyState> {
  if (!supported()) return 'unsupported';
  let allowed = Notification.permission;
  if (allowed === 'default') {
    try { allowed = await Notification.requestPermission(); } catch { return 'blocked'; }
  }
  if (allowed !== 'granted') return allowed === 'denied' ? 'blocked' : 'off';
  try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
  return 'on';
}

export function disableNotifications(): void {
  try { localStorage.setItem(KEY, '0'); } catch { /* private mode */ }
}

/** One notification per subject at a time, so a flurry never stacks up. */
const live = new Map<string, Notification>();
let lastAt = 0;

export interface NotifyOptions {
  tag: string;
  title: string;
  body?: string;
  /** Show it even when the tab is in front. Off by default. */
  always?: boolean;
}

export function notify({ tag, title, body, always = false }: NotifyOptions): void {
  if (notifyState() !== 'on') return;
  if (!always && document.visibilityState === 'visible') return;
  // At most one every two seconds; a busy table should not become a drumroll.
  const now = Date.now();
  if (now - lastAt < 2000 && !live.has(tag)) return;
  lastAt = now;

  try {
    live.get(tag)?.close();
    const n = new Notification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
    });
    live.set(tag, n);
    n.onclick = () => { window.focus(); n.close(); };
    n.onclose = () => live.delete(tag);
    setTimeout(() => n.close(), 12_000);
  } catch { /* some browsers refuse outside a service worker */ }
}

/** Closes anything still on screen, for example once the player is back. */
export function clearNotifications(): void {
  for (const n of live.values()) n.close();
  live.clear();
}
