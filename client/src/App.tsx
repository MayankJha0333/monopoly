import { useEffect, useRef } from 'react';
import { rejoinRoom, socket } from '@/net/socket';
import { play } from '@/audio/sfx';
import { useAuth } from '@/store/auth';
import { loadSession, saveSession, useGame } from '@/store/game';
import { GameScreen } from '@/ui/GameScreen';
import { Home } from '@/ui/Home';
import { Lobby } from '@/ui/Lobby';
import { Matchmaking } from '@/ui/Matchmaking';
import { Toasts } from '@/ui/Toasts';

export default function App() {
  const state = useGame((s) => s.state);
  const playerId = useGame((s) => s.playerId);
  const connected = useGame((s) => s.connected);
  const refreshAuth = useAuth((s) => s.refresh);
  const tried = useRef(false);

  useEffect(() => { void refreshAuth(); }, [refreshAuth]);

  useEffect(() => {
    const onSfx = (name: string) => play(name);
    const onKicked = () => {
      saveSession(null);
      useGame.setState({ state: null, playerId: null });
      useGame.getState().toast('The host removed you from the table.');
    };
    socket.on('sfx', onSfx);
    socket.on('kicked', onKicked);
    return () => {
      socket.off('sfx', onSfx);
      socket.off('kicked', onKicked);
    };
  }, []);

  // Reclaim a seat after a reload or a dropped connection.
  useEffect(() => {
    if (!connected) return;
    const session = loadSession();
    if (!session) { tried.current = true; return; }
    // After the first try, only re-seat when we believe we are still at that table.
    const st = useGame.getState().state;
    if (tried.current && st?.code !== session.code) return;
    tried.current = true;

    // An invite link for a different table beats a stale saved seat.
    const invited = new URLSearchParams(location.search).get('room')?.toUpperCase();
    if (invited && invited !== session.code) {
      saveSession(null);
      return;
    }
    rejoinRoom({ code: session.code, sessionToken: session.sessionToken }).then((r) => {
      if (r.ok && r.state && r.playerId) {
        useGame.setState({ state: r.state, playerId: r.playerId, ...(r.reward ? { reward: r.reward } : {}) });
      } else {
        saveSession(null);
        if (useGame.getState().state) {
          useGame.setState({ state: null, playerId: null });
          useGame.getState().toast(r.error ?? 'That table has closed.');
        }
      }
    });
  }, [connected]);

  const quickLobby = state?.status === 'lobby' && state.quickMatch;

  return (
    <>
      {!state && <Home />}
      {quickLobby && playerId && <Matchmaking state={state} playerId={playerId} />}
      {state && state.status === 'lobby' && !state.quickMatch && playerId && <Lobby state={state} playerId={playerId} />}
      {state && state.status !== 'lobby' && <GameScreen state={state} playerId={playerId} />}
      <Toasts />
      {state && !connected && (
        <div className="conn-lost">Reconnecting to the table…</div>
      )}
    </>
  );
}
