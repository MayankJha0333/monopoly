import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { money } from '@shared/rules';
import type { GameState } from '@shared/types';
import { send } from '@/net/socket';
import { isMuted, isMusicOn, play, setMuted, setMusicEnabled } from '@/audio/sfx';
import { leaveTable, useGame } from '@/store/game';
import { usePrefs } from '@/store/prefs';
import { useUI } from '@/store/ui';
import { ActionBar } from './ActionBar';
import { Announcer } from './Announcer';
import { ManageDialog } from './ManageDialog';
import { AuctionModal, BuyModal, CardModal, InspectModal } from './Modals';
import { Dialog } from './Dialog';
import { SettingsDialog } from './MenuDialogs';
import { Results } from './Results';
import { PlayerRail } from './PlayerRail';
import { CharacterAvatar } from './characters';
import { SidePanel } from './SidePanel';
import { MicButton, useVoiceCall } from './voice';
import { TradeDialog } from './TradeDialog';

// The boards and their painters are only needed once a game starts.
const BoardView = lazy(() => import('@/board/BoardView').then((m) => ({ default: m.BoardView })));
const Board3D = lazy(() => import('@/board3d/Board3D'));

/** If 3D fails on this device, drop to the 2D board instead of a blank screen. */
class ThreeGuard extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GameScreen({ state, playerId }: { state: GameState; playerId: string | null }) {
  const [focusTile, setFocusTile] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [manageOpen, setManage] = useState(false);
  const [tradeWith, setTradeWith] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [music, setMusicState] = useState(isMusicOn());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const view = usePrefs((s) => s.view);
  const quality = usePrefs((s) => s.quality);
  const setView = usePrefs((s) => s.setView);
  const toast = useGame((s) => s.toast);

  const requestCam = useUI((s) => s.requestCam);
  const panelMin = useUI((s) => s.panelMin);
  const setHighlight = useUI((s) => s.setHighlight);
  const clearHighlight = useUI((s) => s.clearHighlight);

  useVoiceCall();

  const me = state.players.find((p) => p.id === playerId);
  const turnPlayer = state.players.find((p) => p.id === state.turn.playerId);
  const isMyTurn = state.turn.playerId === playerId && state.status === 'playing';
  const secondsLeft = state.turn.deadline
    ? Math.max(0, Math.ceil((state.turn.deadline - Date.now()) / 1000))
    : null;

  const openTile = useCallback((id: number) => { setFocusTile(id); setInspect(id); }, []);


  // A band sweeps across when the turn changes hands, so a player who looked
  // away knows whose go it is without reading the log.
  const [sweep, setSweep] = useState<string | null>(null);
  const lastTurn = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = state.turn.playerId;
    if (!id || id === lastTurn.current) return;
    const first = lastTurn.current === null;
    lastTurn.current = id;
    if (first) return;
    setSweep(id);
    const handle = setTimeout(() => setSweep(null), 1500);
    return () => clearTimeout(handle);
  }, [state.turn.playerId, state.status]);

  const openTrade = useCallback((withPlayerId: string | null) => {
    setTradeWith(withPlayerId);
    setTradeOpen(true);
  }, []);

  // The manage sheet is the only way out of a debt, so open it automatically.
  useEffect(() => {
    if (state.debt?.debtorId === playerId) setManage(true);
  }, [state.debt?.debtorId, playerId]);

  // An offer waiting on you lights its properties up on the board.
  const incoming = state.trades.find((t) => t.status === 'open' && t.to === playerId);
  useEffect(() => {
    if (tradeOpen) return;
    if (!incoming) { clearHighlight(); return; }
    const from = state.players.find((p) => p.id === incoming.from);
    setHighlight([...incoming.give.properties, ...incoming.want.properties], from?.color ?? null);
  }, [incoming?.id, tradeOpen, setHighlight, clearHighlight, state.players]);

  useEffect(() => {
    if (!isMyTurn) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const phase = state.turn.phase;
      switch (e.key.toLowerCase()) {
        case 'r': if (phase === 'pre-roll') send('game:roll'); break;
        case 'e': if (phase === 'post-roll') send('game:endTurn'); break;
        case 'm': setManage(true); break;
        case 't': openTrade(null); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMyTurn, state.turn.phase, openTrade]);

  // Folding the panel away gives the board the room; re-frame it.
  const firstFrame = useRef(true);
  useEffect(() => {
    if (firstFrame.current) { firstFrame.current = false; return; }
    const h = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      requestCam('reset');
    });
    return () => cancelAnimationFrame(h);
  }, [panelMin, requestCam]);

  const leave = () => {
    if (state.status === 'playing' && !me?.bankrupt) { setConfirmLeave(true); return; }
    leaveTable();
  };

  return (
    <div className="game" data-myturn={isMyTurn} data-panel={panelMin ? 'min' : 'open'}>
      <div className="stage">
        <Suspense fallback={<div className="table-loading"><span className="spinner" />Setting up the table…</div>}>
          {view === '3d' ? (
            <ThreeGuard onFail={() => { setView('2d'); toast('3D is not available here, so the 2D board is on.'); }}>
              <Board3D state={state} focusTile={focusTile} quality={quality} onTile={openTile} />
            </ThreeGuard>
          ) : (
            <BoardView state={state} focusTile={focusTile} quality={quality} />
          )}
        </Suspense>
      </div>

      <div className="hud">
        <div className="topbar">
          {!state.quickMatch && (
            <div className="card chip-card">
              <span className="label">Table</span>
              <span className="mini-code">{state.code}</span>
            </div>
          )}
          <div className="card chip-card">
            <span className="muted-sm">
              Round {state.round}{state.settings.maxRounds > 0 ? ` / ${state.settings.maxRounds}` : ''}
            </span>
          </div>
          {state.settings.freeParkingPot && (
            <div className="card chip-card">
              <span className="muted-sm">Pot</span>
              <b className="gold">{money(state.pot)}</b>
            </div>
          )}
          {state.settings.limitedHouses && (
            <div className="card chip-card hide-sm">
              <span className="muted-sm">🏠 {state.housesLeft} · 🏨 {state.hotelsLeft}</span>
            </div>
          )}

          <div className="spacer" />

          <div className="card chip-card cam-group">
            <button className="icon-btn" title="Zoom out" onClick={() => requestCam('out')}>−</button>
            <button className="icon-btn" title="Reset the view" onClick={() => requestCam('reset')}>⌂</button>
            <button className="icon-btn" title="Zoom in" onClick={() => requestCam('in')}>+</button>
          </div>
          <button className="btn btn-sm hide-sm" onClick={() => setView(view === '3d' ? '2d' : '3d')}
            title="Switch between the 3D and 2D board">
            {view === '3d' ? '2D view' : '3D view'}
          </button>
          <button className="btn btn-sm" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
          <button className="btn btn-sm hide-sm" title={music ? 'Turn the music off' : 'Turn the music on'}
            data-off={!music}
            onClick={() => { const n = !music; setMusicEnabled(n); setMusicState(n); }}>
            {music ? '♪' : '♪̸'}
          </button>
          <MicButton />
          <button className="btn btn-sm" title={muted ? 'Unmute' : 'Mute'}
            onClick={() => { const n = !muted; setMuted(n); setMutedState(n); if (!n) play('click'); }}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={leave}>Leave</button>
        </div>

        <PlayerRail state={state} playerId={playerId} onTile={openTile} onTrade={openTrade} />

        {turnPlayer && state.status === 'playing' && (
          <div className="turn-banner" data-mine={isMyTurn} key={turnPlayer.id}
            style={{ ['--pc' as string]: turnPlayer.color }}>
            <CharacterAvatar token={turnPlayer.token} color={turnPlayer.color} size={26} />
            <span>{isMyTurn ? 'Your turn' : `${turnPlayer.name}'s turn`}</span>
            {secondsLeft !== null && state.settings.turnSeconds > 0 && (
              <span className="timer">
                <i style={{ width: `${Math.min(100, (secondsLeft / state.settings.turnSeconds) * 100)}%` }} />
              </span>
            )}
          </div>
        )}

        <Announcer state={state} playerId={playerId} />

        <SidePanel state={state} playerId={playerId} onTile={openTile} />

        <ActionBar
          state={state}
          playerId={playerId}
          paused={manageOpen || tradeOpen || inspect !== null}
          onManage={() => setManage(true)}
          onTrade={() => openTrade(null)}
        />
      </div>

      {sweep && (() => {
        const who = state.players.find((p) => p.id === sweep);
        if (!who) return null;
        return (
          <div className="turn-sweep" style={{ ['--pc' as string]: who.color }} key={sweep + state.round}>
            <div className="sweep-body">
              <CharacterAvatar token={who.token} color={who.color} size={34} />
              <span>{who.id === playerId ? 'Your turn' : `${who.name}'s turn`}</span>
            </div>
          </div>
        );
      })()}

      <BuyModal state={state} playerId={playerId} />
      <AuctionModal state={state} playerId={playerId} />
      <CardModal state={state} playerId={playerId} />
      <InspectModal state={state} tileId={inspect} onClose={() => setInspect(null)} />
      {manageOpen && playerId && (
        <ManageDialog state={state} playerId={playerId} onClose={() => setManage(false)} onTile={openTile} />
      )}
      {tradeOpen && playerId && (
        <TradeDialog
          state={state}
          playerId={playerId}
          initialPartner={tradeWith}
          onClose={() => { setTradeOpen(false); clearHighlight(); }}
        />
      )}
      {state.status === 'ended' && <Results state={state} playerId={playerId} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {confirmLeave && (
        <Dialog title="Leave this match?" onClose={() => setConfirmLeave(false)}>
          <p className="sp-muted">Your seat will play on without you, and you will not earn XP or coins for this match.</p>
          <div className="sp-results-actions">
            <button className="sp-btn sp-btn-coral" onClick={() => { setConfirmLeave(false); leaveTable(); }}>Leave match</button>
            <button className="sp-btn" onClick={() => setConfirmLeave(false)}>Keep playing</button>
          </div>
        </Dialog>
      )}
      {me?.bankrupt && state.status === 'playing' && (
        <div className="spectating">You are out of the game — watching the rest play out.</div>
      )}
    </div>
  );
}
