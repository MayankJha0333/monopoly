import { create } from 'zustand';

interface UIStore {
  /** Tiles to light up on the board — trade contents, a deed being inspected. */
  highlight: number[];
  highlightColor: string | null;
  /** Camera requests from the HUD buttons; `seq` makes repeats distinct. */
  camCmd: { seq: number; kind: 'reset' | 'in' | 'out' };
  /** Cleared when the player asks to stay on their turn. */
  autoEndArmed: boolean;
  /** Extra pixels a docked sheet takes from the bottom of the board area. */
  boardInset: number;
  /** True while the dice are in the air or a token is walking, so prompts
   *  wait their turn instead of covering the move. */
  boardBusy: boolean;
  setHighlight: (ids: number[], color?: string | null) => void;
  clearHighlight: () => void;
  requestCam: (kind: 'reset' | 'in' | 'out') => void;
  setAutoEnd: (armed: boolean) => void;
  setBoardInset: (px: number) => void;
  setBoardBusy: (busy: boolean) => void;
}

export const useUI = create<UIStore>((set) => ({
  highlight: [],
  highlightColor: null,
  camCmd: { seq: 0, kind: 'reset' },
  autoEndArmed: true,
  boardInset: 0,
  boardBusy: false,
  setHighlight: (ids, color = null) => set({ highlight: ids, highlightColor: color }),
  clearHighlight: () => set({ highlight: [], highlightColor: null }),
  requestCam: (kind) => set((s) => ({ camCmd: { seq: s.camCmd.seq + 1, kind } })),
  setAutoEnd: (armed) => set({ autoEndArmed: armed }),
  setBoardInset: (px) => set({ boardInset: px }),
  setBoardBusy: (busy) => set({ boardBusy: busy }),
}));
