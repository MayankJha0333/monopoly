import { create } from 'zustand';
import type { MatchReward } from '@shared/progress';
import type { Announcement, DiceThrow, GameState, Player } from '@shared/types';
import { socket } from '@/net/socket';

const SESSION_KEY = 'rentrush.session';

export interface Session { code: string; sessionToken: string; playerId: string }

export const loadSession = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
};
export const saveSession = (s: Session | null) => {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
};

export interface Toast { id: number; text: string }

interface GameStore {
  connected: boolean;
  state: GameState | null;
  playerId: string | null;
  /** Latest dice throw, consumed by the physics dice. */
  throwEvent: (DiceThrow & { at: number }) | null;
  toasts: Toast[];
  /** XP and coins from the game that just ended */
  reward: MatchReward | null;
  /** players online, for the home screen */
  online: number;
  /** big moments waiting to be shown to everyone at the table */
  announcements: Announcement[];
  /** who is typing a chat message right now, by player id, with a stamp */
  typing: Record<string, { name: string; at: number }>;
  /** does this server offer voice and video at private tables */
  voiceReady: boolean;
  me: () => Player | undefined;
  isMyTurn: () => boolean;
  setState: (s: GameState) => void;
  setPlayerId: (id: string | null) => void;
  toast: (text: string) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  state: null,
  playerId: null,
  throwEvent: null,
  toasts: [],
  reward: null,
  online: 0,
  announcements: [],
  typing: {},
  voiceReady: false,

  me: () => {
    const { state, playerId } = get();
    return state?.players.find((p) => p.id === playerId);
  },
  isMyTurn: () => {
    const { state, playerId } = get();
    return !!state && state.status === 'playing' && state.turn.playerId === playerId;
  },

  setState: (s) => set({ state: s }),
  setPlayerId: (id) => set({ playerId: id }),

  toast: (text) => {
    const id = ++toastSeq;
    set((st) => ({ toasts: [...st.toasts, { id, text }] }));
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
}));

socket.on('connect', () => useGame.setState({ connected: true }));
socket.on('disconnect', () => useGame.setState({ connected: false }));
socket.on('state', (s) => useGame.getState().setState(s));
socket.on('notice', (m) => useGame.getState().toast(m));
socket.on('dice', (d) => useGame.setState({ throwEvent: { ...d, at: performance.now() } }));
socket.on('reward', (r) => useGame.setState({ reward: r }));
socket.on('online', (n) => useGame.setState({ online: n }));
socket.on('announce', (a) => useGame.setState((st) => ({ announcements: [...st.announcements, a].slice(-12) })));
socket.on('voice:ready', (on) => useGame.setState({ voiceReady: on }));

/** A "typing" ping counts for three seconds, then fades on its own. */
const TYPING_MS = 3000;
socket.on('typing', ({ playerId, name }) => {
  useGame.setState((st) => ({ typing: { ...st.typing, [playerId]: { name, at: Date.now() } } }));
});
setInterval(() => {
  const now = Date.now();
  const { typing } = useGame.getState();
  const live = Object.entries(typing).filter(([, v]) => now - v.at < TYPING_MS);
  if (live.length !== Object.keys(typing).length) useGame.setState({ typing: Object.fromEntries(live) });
}, 1000);

/** Names of everyone typing right now, apart from you. */
export function typingNames(): string[] {
  const { typing, playerId } = useGame.getState();
  const now = Date.now();
  return Object.entries(typing)
    .filter(([id, v]) => id !== playerId && now - v.at < TYPING_MS)
    .map(([, v]) => v.name);
}

/** Leaves whatever table we are at and goes back to the menu. */
export function leaveTable() {
  socket.emit('room:leave');
  saveSession(null);
  useGame.setState({ state: null, playerId: null, reward: null, throwEvent: null, announcements: [], typing: {} });
}
