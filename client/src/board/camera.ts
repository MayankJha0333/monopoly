import { useEffect, useRef } from 'react';
import { BOARD_PX } from './geometry';

export interface CamTarget { x: number; y: number; zoom: number }

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 3.2;
/** How much board edge may sit outside the view before the camera stops. */
const PAN_SLACK = 26;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface CameraApi {
  /** Frame the whole board. */
  fit: (snap?: boolean) => void;
  /** Centre on a point in board space at a given zoom. */
  moveTo: (x: number, y: number, zoom?: number, snap?: boolean) => void;
  /** Multiply the zoom, keeping the view centre. */
  zoomBy: (factor: number) => void;
  /** Drag the board by a screen-space delta. */
  panBy: (dx: number, dy: number) => void;
  /** Zoom toward a point on screen, the way a map does under the cursor. */
  zoomAt: (factor: number, clientX: number, clientY: number) => void;
  /** True once the player has moved the view themselves. */
  isManual: () => boolean;
  setManual: (manual: boolean) => void;
  target: () => CamTarget;
  zoom: () => number;
  /** Board-space point under a screen position. */
  fromScreen: (clientX: number, clientY: number) => { x: number; y: number };
}

/**
 * Drives the board's pan and zoom. The transform is written straight to the
 * DOM every frame rather than through React state, so a camera move never
 * re-renders the forty tiles underneath it.
 */
export function useCamera(
  viewRef: React.RefObject<HTMLDivElement | null>,
  planeRef: React.RefObject<HTMLDivElement | null>,
): React.RefObject<CameraApi | null> {
  const api = useRef<CameraApi | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    const plane = planeRef.current;
    if (!view || !plane) return;

    const current: CamTarget = { x: BOARD_PX / 2, y: BOARD_PX / 2, zoom: 0.5 };
    const goal: CamTarget = { ...current };
    let manual = false;
    let raf = 0;
    let last = performance.now();

    // The HUD sits over the board, so the camera frames the *padded* box the
    // panels leave behind rather than the whole stage.
    let pad = { l: 0, r: 0, t: 0, b: 0 };
    const readPad = () => {
      const cs = getComputedStyle(view);
      pad = {
        l: parseFloat(cs.paddingLeft) || 0,
        r: parseFloat(cs.paddingRight) || 0,
        t: parseFloat(cs.paddingTop) || 0,
        b: parseFloat(cs.paddingBottom) || 0,
      };
    };
    readPad();

    const size = () => {
      const r = view.getBoundingClientRect();
      return {
        w: Math.max(80, r.width - pad.l - pad.r),
        h: Math.max(80, r.height - pad.t - pad.b),
        left: r.left + pad.l,
        top: r.top + pad.t,
      };
    };

    const fitZoom = () => {
      const { w, h } = size();
      // A little padding so the board never touches the HUD.
      return clamp(Math.min(w / (BOARD_PX + 60), h / (BOARD_PX + 60)), MIN_ZOOM, MAX_ZOOM);
    };

    // Keep the board filling the view: when it is bigger than the viewport the
    // camera stays inside its edges, and when it is smaller it simply centres.
    const clampGoal = () => {
      goal.zoom = clamp(goal.zoom, Math.min(MIN_ZOOM, fitZoom()), MAX_ZOOM);
      const { w, h } = size();
      const halfW = w / (2 * goal.zoom);
      const halfH = h / (2 * goal.zoom);
      goal.x = halfW * 2 >= BOARD_PX + PAN_SLACK * 2
        ? BOARD_PX / 2
        : clamp(goal.x, halfW - PAN_SLACK, BOARD_PX - halfW + PAN_SLACK);
      goal.y = halfH * 2 >= BOARD_PX + PAN_SLACK * 2
        ? BOARD_PX / 2
        : clamp(goal.y, halfH - PAN_SLACK, BOARD_PX - halfH + PAN_SLACK);
    };

    const apply = () => {
      const { w, h } = size();
      const tx = pad.l + w / 2 - current.x * current.zoom;
      const ty = pad.t + h / 2 - current.y * current.zoom;
      plane.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${current.zoom.toFixed(4)})`;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Critically damped-ish follow: fast enough to feel responsive, slow
      // enough that a zoom reads as a camera move rather than a cut.
      const k = 1 - Math.exp(-dt / 0.13);
      current.x += (goal.x - current.x) * k;
      current.y += (goal.y - current.y) * k;
      current.zoom += (goal.zoom - current.zoom) * k;
      apply();
      raf = requestAnimationFrame(frame);
    };

    const snapNow = () => {
      current.x = goal.x; current.y = goal.y; current.zoom = goal.zoom;
      apply();
    };

    goal.zoom = fitZoom();
    snapNow();
    raf = requestAnimationFrame(frame);

    // The HUD reflows on its own (a docked sheet, a phone rotating), so watch
    // the element rather than the window and re-frame whenever it changes size.
    let lastBox = { w: 0, h: 0 };
    const onResize = () => {
      readPad();
      const { w, h } = size();
      const changed = Math.abs(w - lastBox.w) > 40 || Math.abs(h - lastBox.h) > 40;
      lastBox = { w, h };
      if (changed) {
        manual = false;
        goal.zoom = fitZoom();
        goal.x = BOARD_PX / 2;
        goal.y = BOARD_PX / 2;
      }
      apply();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(view);
    window.addEventListener('resize', onResize);

    api.current = {
      fit: (snap = false) => {
        readPad();
        goal.x = BOARD_PX / 2;
        goal.y = BOARD_PX / 2;
        goal.zoom = fitZoom();
        clampGoal();
        if (snap) snapNow();
      },
      moveTo: (x, y, zoom, snap = false) => {
        goal.x = x;
        goal.y = y;
        if (zoom !== undefined) goal.zoom = zoom;
        clampGoal();
        if (snap) snapNow();
      },
      zoomBy: (factor) => {
        manual = true;
        goal.zoom *= factor;
        clampGoal();
      },

      panBy: (dx, dy) => {
        manual = true;
        goal.x -= dx / current.zoom;
        goal.y -= dy / current.zoom;
        clampGoal();
      },
      zoomAt: (factor, clientX, clientY) => {
        manual = true;
        const { w, h, left, top } = size();
        const sx = clientX - left - w / 2;
        const sy = clientY - top - h / 2;
        const before = { x: goal.x + sx / goal.zoom, y: goal.y + sy / goal.zoom };
        goal.zoom = clamp(goal.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        goal.x = before.x - sx / goal.zoom;
        goal.y = before.y - sy / goal.zoom;
        clampGoal();
      },
      isManual: () => manual,
      setManual: (next) => { manual = next; },
      target: () => ({ ...goal }),
      zoom: () => current.zoom,
      fromScreen: (clientX, clientY) => {
        const { w, h, left, top } = size();
        return {
          x: current.x + (clientX - left - w / 2) / current.zoom,
          y: current.y + (clientY - top - h / 2) / current.zoom,
        };
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      api.current = null;
    };
  }, [viewRef, planeRef]);

  return api;
}

export const ZOOM_STEP = 1.35;
export const FOCUS_ZOOM = 1.15;
