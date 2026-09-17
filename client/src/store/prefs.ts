import { create } from 'zustand';

export type View = '3d' | '2d';
export type Quality = 'high' | 'low';

const KEY = 'sunnyport.prefs';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function suggested(): { view: View; quality: Quality } {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const phone = window.matchMedia('(max-width: 720px)').matches;
  const view: View = webglAvailable() && memory >= 2 ? '3d' : '2d';
  const quality: Quality = memory <= 4 || cores <= 4 || phone ? 'low' : 'high';
  return { view, quality };
}

function load(): { view: View; quality: Quality } {
  const base = suggested();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<{ view: View; quality: Quality }> | null;
    return {
      view: saved?.view === '2d' || saved?.view === '3d' ? (webglAvailable() ? saved.view : '2d') : base.view,
      quality: saved?.quality === 'low' || saved?.quality === 'high' ? saved.quality : base.quality,
    };
  } catch {
    return base;
  }
}

interface Prefs {
  view: View;
  quality: Quality;
  setView: (v: View) => void;
  setQuality: (q: Quality) => void;
}

const save = (p: { view: View; quality: Quality }) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
};

export const usePrefs = create<Prefs>((set, get) => ({
  ...load(),
  setView: (view) => { set({ view }); save({ view, quality: get().quality }); },
  setQuality: (quality) => { set({ quality }); save({ view: get().view, quality }); },
}));
