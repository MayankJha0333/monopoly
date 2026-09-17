import { create } from 'zustand';
import type { PublicUser } from '@shared/progress';
import { api } from '@/net/api';
import { socket } from '@/net/socket';

interface AuthStore {
  user: PublicUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  /** Makes sure there is an account (a guest one if needed) before playing. */
  ensureAccount: (p: { name: string; token: string; color: string }) => Promise<PublicUser>;
  signup: (p: { username: string; email: string; password: string }) => Promise<void>;
  login: (p: { login: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  saveLook: (p: { name?: string; token?: string; color?: string }) => void;
  setUser: (u: PublicUser | null) => void;
}

/** The socket reads the session cookie on connect, so reconnect after it changes. */
function reconnectSocket(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { socket.off('connect', done); resolve(); };
    socket.on('connect', done);
    socket.disconnect();
    socket.connect();
    setTimeout(done, 4000);
  });
}

let lookTimer: ReturnType<typeof setTimeout> | null = null;

export const useAuth = create<AuthStore>((set, get) => ({
  user: null,
  ready: false,

  refresh: async () => {
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      set({ ready: true });
    }
  },

  ensureAccount: async (p) => {
    const current = get().user;
    if (current) return current;
    const { user } = await api.guest(p);
    set({ user });
    await reconnectSocket();
    return user!;
  },

  signup: async (p) => {
    const { user } = await api.signup(p);
    set({ user });
    await reconnectSocket();
  },

  login: async (p) => {
    const { user } = await api.login(p);
    set({ user });
    await reconnectSocket();
  },

  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ user: null });
    await reconnectSocket();
  },

  // Appearance changes are saved quietly, a moment after the last tap.
  saveLook: (p) => {
    const u = get().user;
    if (!u) return;
    set({ user: { ...u, ...(u.isGuest && p.name ? { name: p.name } : {}), ...(p.token ? { token: p.token } : {}), ...(p.color ? { color: p.color } : {}) } });
    if (lookTimer) clearTimeout(lookTimer);
    lookTimer = setTimeout(() => { api.updateMe(p).catch(() => undefined); }, 600);
  },

  setUser: (user) => set({ user }),
}));
