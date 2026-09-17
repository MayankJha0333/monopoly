import { useCallback, useEffect, useMemo, useRef } from 'react';
import { tile } from '@shared/board';
import { isOwnable } from '@shared/types';
import type { GameState, OwnableTile, Player, TokenId } from '@shared/types';
import { paintBoard, BOARD_TEX_SIZE } from '@/lib/boardTexture';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { CharacterAvatar } from '@/ui/characters';
import { FOCUS_ZOOM, ZOOM_STEP, useCamera } from './camera';
import { restingOccupants } from '@/lib/layout';
import { BOARD_PX, buildingPoints, crowdPoint, outward, ownerStrip, tileBox } from './geometry';
import { Dice2D } from './Dice2D';

interface Props {
  state: GameState;
  focusTile: number | null;
  quality: 'high' | 'low';
}

/** Where the dice land for a given tile: on the city, part-way to the middle. */
function diceSpot(tileId: number) {
  const t = tileBox(tileId);
  const mid = BOARD_PX / 2;
  return { x: t.cx + (mid - t.cx) * 0.44, y: t.cy + (mid - t.cy) * 0.44 };
}

const WALK_TILES_PER_SEC = 4.5;
const HOP_PX = 26;
/** Past this many tiles a card jump reads better as a leap than a walk. */
const MAX_WALK = 13;
const TOKEN_PX = 46;

interface Motion { shown: number; dir: 1 | -1; leaping: boolean; restingSince: number }

const wrap = (n: number) => ((Math.round(n) % 40) + 40) % 40;

/** Position and size for a fractional board index, with a hop between tiles. */
function pointAt(crowd: Map<number, string[]>, playerId: string, index: number) {
  const base = Math.floor(index + 0.0005);
  const frac = Math.max(0, index - base);
  const a = crowdPoint(wrap(base), crowd.get(wrap(base)), playerId);
  if (frac < 0.001) return { x: a.x, y: a.y, lift: 0, scale: a.scale };
  const b = crowdPoint(wrap(base + 1), crowd.get(wrap(base + 1)), playerId);
  return {
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
    lift: Math.sin(frac * Math.PI) * HOP_PX,
    scale: a.scale + (b.scale - a.scale) * frac,
  };
}

export function BoardView({ state, focusTile, quality }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tokensRef = useRef(new Map<string, HTMLDivElement>());
  const motions = useRef(new Map<string, Motion>());
  const eased = useRef(new Map<string, { x: number; y: number; s: number }>());
  const stateRef = useRef(state);
  stateRef.current = state;
  const landedRef = useRef<number | null>(null);

  const cam = useCamera(viewRef, planeRef);
  /** While true the camera rides along with whoever is moving. */
  const following = useRef(false);
  /** True while a prompt is up: the camera stays on the tile in play. */
  const holdFocus = useRef(false);
  /** Newest moment the board was busy — a throw pushes this into the future so
   *  the camera holds its close-up while the dice are still in the air. */
  const busyUntil = useRef(0);
  /** Tokens hold still until the dice have actually landed. */
  const walkGate = useRef(0);

  const throwEvent = useGame((s) => s.throwEvent);
  const highlight = useUI((s) => s.highlight);
  const highlightColor = useUI((s) => s.highlightColor);
  const camCmd = useUI((s) => s.camCmd);
  const boardInset = useUI((s) => s.boardInset);
  const setBoardBusy = useUI((s) => s.setBoardBusy);

  // ------------------------------------------------------------ board face
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) paintBoard(canvas);
  }, []);

  // ------------------------------------------------------- token animation
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const delta = Math.min(0.25, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const gated = now < walkGate.current;
      let moving = gated;

      for (const p of st.players) {
        if (p.bankrupt) continue;
        const el = tokensRef.current.get(p.id);
        if (!el) continue;

        let m = motions.current.get(p.id);
        if (!m) {
          m = { shown: p.position, dir: 1, leaping: false, restingSince: now };
          motions.current.set(p.id, m);
        }

        const shownTile = ((Math.round(m.shown) % 40) + 40) % 40;
        if (!gated && (shownTile !== p.position || m.shown % 1 !== 0)) {
          moving = true;
          m.restingSince = now;
          const forward = (p.position - m.shown + 40) % 40;
          const backward = (m.shown - p.position + 40) % 40;

          if (!m.leaping && Math.abs(m.shown % 1) < 0.001) {
            m.leaping = forward > MAX_WALK && backward > 4;
            m.dir = forward <= MAX_WALK || forward <= backward ? 1 : -1;
          }

          const speed = m.leaping ? WALK_TILES_PER_SEC * 3.4 : WALK_TILES_PER_SEC;
          const remaining = m.dir === 1 ? forward : backward;
          const step = Math.min(remaining, speed * delta);
          m.shown = (m.shown + step * m.dir + 40) % 40;
          if (remaining - step < 0.002) {
            m.shown = p.position;
            m.leaping = false;
          }
        }

      }

      // Second pass: place everyone, now that we know who is resting where.
      const crowd = restingOccupants(st.players, (id) => motions.current.get(id)?.shown ?? 0);
      for (const p of st.players) {
        if (p.bankrupt) continue;
        const el = tokensRef.current.get(p.id);
        const m = motions.current.get(p.id);
        if (!el || !m) continue;
        const at = pointAt(crowd, p.id, m.shown);
        // In jail the token tucks into the cell instead of standing on the kerb.
        const jailed = p.inJail && p.position === 10 && m.shown === 10;
        let x = at.x + (jailed ? 14 : 0);
        let y = at.y + (jailed ? 14 : 0);
        let sc = at.scale;
        const e = eased.current.get(p.id);
        const walking = Math.abs(m.shown - Math.round(m.shown)) > 0.001;
        if (e && !walking) {
          const k = Math.min(1, delta * 10);
          e.x += (x - e.x) * k; e.y += (y - e.y) * k; e.s += (sc - e.s) * k;
          x = e.x; y = e.y; sc = e.s;
        } else {
          eased.current.set(p.id, { x, y, s: sc });
        }
        el.style.transform =
          `translate3d(${(x - TOKEN_PX / 2).toFixed(1)}px, ${(y - TOKEN_PX / 2 - at.lift).toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
        el.style.zIndex = String(10 + Math.round(y / 10));

        if (following.current && p.id === st.turn.playerId && cam.current && !cam.current.isManual()) {
          // While the dice are still in the air, hold both them and the token
          // in frame; once the walk starts, ride with the token.
          if (gated) {
            const spot = diceSpot(p.position);
            cam.current.moveTo((x + spot.x) / 2, (y + spot.y) / 2, FOCUS_ZOOM);
          } else {
            cam.current.moveTo(x, y, FOCUS_ZOOM);
          }
        }
      }

      // Once the dice have landed and every token has been still for a beat,
      // the camera hands the whole board back.
      if (moving) busyUntil.current = now;
      if (following.current && now - busyUntil.current > 1100) {
        following.current = false;
        setBoardBusy(false);
        if (cam.current && !cam.current.isManual() && !holdFocus.current) cam.current.fit();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cam]);

  // ------------------------------------------------ camera choreography
  // A throw pulls the camera in on whoever is rolling; the follow loop above
  // rides the move out and then frames the whole board again.
  useEffect(() => {
    if (!throwEvent || !cam.current) return;
    const st = stateRef.current;
    const active = st.players.find((p) => p.id === st.turn.playerId);
    if (!active) return;
    cam.current.setManual(false);
    following.current = true;
    setBoardBusy(true);
    // Hold the close-up through the throw, then through the walk that follows.
    busyUntil.current = performance.now() + 2400;
    // The dice land first; only then does the token set off.
    walkGate.current = performance.now() + 1300;
    const m = motions.current.get(active.id);
    const crowd = restingOccupants(st.players, (id) => motions.current.get(id)?.shown ?? 0);
    const at = pointAt(crowd, active.id, m?.shown ?? active.position);
    // Frame the token and the dice together — they land a little way inboard.
    const spot = diceSpot(active.position);
    cam.current.moveTo((at.x + spot.x) / 2, (at.y + spot.y) / 2, FOCUS_ZOOM);
  }, [throwEvent?.at, cam]);

  // A live prompt keeps the camera on the tile it is about, and lets go of it
  // when the decision is made.
  useEffect(() => {
    if (!cam.current) return;
    if (landedRef.current === null) {
      if (holdFocus.current) {
        holdFocus.current = false;
        if (!cam.current.isManual() && !following.current) cam.current.fit();
      }
      return;
    }
    holdFocus.current = true;
    const t = tileBox(landedRef.current);
    if (!cam.current.isManual()) cam.current.moveTo(t.cx, t.cy, FOCUS_ZOOM);
  }, [state.buyPrompt?.tileId, state.auction?.tileId, cam]);

  // Inspecting a deed or a log line frames that tile.
  useEffect(() => {
    if (focusTile === null || !cam.current) return;
    const t = tileBox(focusTile);
    following.current = false;
    cam.current.setManual(false);
    cam.current.moveTo(t.cx, t.cy, Math.max(FOCUS_ZOOM, cam.current.target().zoom));
  }, [focusTile, cam]);

  // HUD camera buttons.
  useEffect(() => {
    const c = cam.current;
    if (!c || camCmd.seq === 0) return;
    if (camCmd.kind === 'in') c.zoomBy(ZOOM_STEP);
    else if (camCmd.kind === 'out') c.zoomBy(1 / ZOOM_STEP);
    else {
      following.current = false;
      c.setManual(false);
      c.fit();
    }
  }, [camCmd, cam]);

  // ------------------------------------------------------------- pointers
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size > 1) { drag.current = null; return; }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!cam.current) return;
    const previous = pinch.current.get(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current.size >= 2) {
      const [a, b] = [...pinch.current.values()];
      if (!a || !b || !previous) return;
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      const wasSpread = Math.hypot(
        (previous.x === a.x ? b.x : a.x) - previous.x,
        (previous.y === a.y ? b.y : a.y) - previous.y,
      );
      if (wasSpread > 0) {
        following.current = false;
        cam.current.zoomAt(spread / wasSpread, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      return;
    }

    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) { d.moved = true; following.current = false; }
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.moved) cam.current.panBy(dx, dy);
  }, [cam]);

  const endPointer = useCallback((e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (drag.current?.id === e.pointerId) drag.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!cam.current) return;
    following.current = false;
    cam.current.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, [cam]);

  // Double-tapping the board frames it again.
  const onDoubleClick = useCallback(() => {
    if (!cam.current) return;
    following.current = false;
    cam.current.setManual(false);
    cam.current.fit();
  }, [cam]);

  // --------------------------------------------------------------- layers
  const owned = useMemo(() => {
    const byOwner: { id: number; color: string; token: TokenId; mortgaged: boolean }[] = [];
    for (const t of Object.keys(state.properties)) {
      const id = Number(t);
      const st = state.properties[id]!;
      if (!st.owner) continue;
      const player = state.players.find((p) => p.id === st.owner);
      if (player) byOwner.push({ id, color: player.color, token: player.token, mortgaged: st.mortgaged });
    }
    return byOwner;
  }, [state.properties, state.players]);

  const buildings = useMemo(() => {
    const out: { key: string; x: number; y: number; hotel: boolean }[] = [];
    for (const key of Object.keys(state.properties)) {
      const id = Number(key);
      const st = state.properties[id]!;
      if (!st.houses) continue;
      const t = tile(id);
      if (!isOwnable(t)) continue;
      const group = (t as OwnableTile).group;
      if (group === 'railroad' || group === 'utility') continue;
      buildingPoints(id, st.houses).forEach((p, i) => {
        out.push({ key: `${id}-${i}`, x: p.x, y: p.y, hotel: st.houses >= 5 });
      });
    }
    return out;
  }, [state.properties]);

  const visiblePlayers = useMemo(
    () => state.players.filter((p: Player) => !p.bankrupt),
    [state.players],
  );

  // The dice land on the board beside whoever is rolling, a little way in from
  // their tile so they sit on the city rather than on the tiles.
  const roller = state.players.find((p) => p.id === state.turn.playerId);
  const dicePoint = diceSpot(roller?.position ?? 0);

  const landed = state.buyPrompt?.tileId ?? state.auction?.tileId ?? null;
  landedRef.current = landed;

  return (
    <div
      className="board-view"
      data-quality={quality}
      ref={viewRef}
      style={{ ['--sheet-inset' as string]: `${boardInset}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      <div className="board-plane" ref={planeRef}>
        <canvas
          className="board-face"
          ref={canvasRef}
          width={BOARD_TEX_SIZE}
          height={BOARD_TEX_SIZE}
          style={{ width: BOARD_PX, height: BOARD_PX }}
        />

        {/* Owner marks: a colour strip on the tile, and a bookmark hanging off
            the board edge with the owner's face on it. */}
        {owned.map((o) => {
          const bar = ownerStrip(o.id, 11);
          const t = tileBox(o.id);
          const out = outward(o.id);
          const depth = out.x !== 0 ? t.w : t.h;
          const angle = out.y > 0 ? 0 : out.y < 0 ? 180 : out.x > 0 ? 270 : 90;
          const fx = t.cx + out.x * (depth / 2 + 17);
          const fy = t.cy + out.y * (depth / 2 + 17);
          return (
            <span key={`own-${o.id}`}>
              <span
                className="own-strip"
                data-mortgaged={o.mortgaged}
                style={{ left: bar.x, top: bar.y, width: bar.w, height: bar.h, background: o.color }}
              />
              <span
                className="own-mark"
                data-mortgaged={o.mortgaged}
                style={{
                  left: fx, top: fy,
                  ['--mark' as string]: o.color,
                  ['--spin' as string]: `${angle}deg`,
                }}
              >
                <span className="own-mark-face" style={{ transform: `rotate(${-angle}deg)` }}>
                  <CharacterAvatar token={o.token} color={o.color} size={24} />
                </span>
              </span>
            </span>
          );
        })}

        {/* Houses and hotels on the colour band. */}
        {buildings.map((b) => (
          <span
            key={b.key}
            className="bld"
            data-hotel={b.hotel}
            style={{ left: b.x - (b.hotel ? 13 : 8), top: b.y - (b.hotel ? 10 : 7) }}
          />
        ))}

        {/* Trade and holdings highlights. */}
        {highlight.map((id) => {
          const t = tileBox(id);
          return (
            <span
              key={`hl-${id}`}
              className="tile-hl"
              style={{
                left: t.x, top: t.y, width: t.w, height: t.h,
                ['--hl' as string]: highlightColor ?? '#e3bd66',
              }}
            />
          );
        })}

        {/* The tile currently in play. */}
        {landed !== null && (
          <span
            className="tile-live"
            style={{
              left: tileBox(landed).x, top: tileBox(landed).y,
              width: tileBox(landed).w, height: tileBox(landed).h,
            }}
          />
        )}

        <Dice2D roll={throwEvent} x={dicePoint.x} y={dicePoint.y} />

        {visiblePlayers.map((p) => {
          const isTurn = state.turn.playerId === p.id && state.status === 'playing';
          return (
            <div
              key={p.id}
              className="token"
              data-turn={isTurn}
              style={{ ['--pc' as string]: p.color, width: TOKEN_PX, height: TOKEN_PX }}
              ref={(el) => {
                if (el) tokensRef.current.set(p.id, el);
                else tokensRef.current.delete(p.id);
              }}
            >
              <span className="token-plate">
                <CharacterAvatar token={p.token} color={p.color} size={TOKEN_PX - 8} />
              </span>
              <span className="token-shadow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
