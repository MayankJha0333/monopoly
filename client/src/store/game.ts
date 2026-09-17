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

/** Leaves whatever table we are at and goes back to the menu. */
export function leaveTable() {
  socket.emit('room:leave');
  saveSession(null);
  useGame.setState({ state: null, playerId: null, reward: null, throwEvent: null, announcements: [] });
}
