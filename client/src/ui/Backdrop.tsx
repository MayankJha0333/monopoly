import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { paintBoard } from '@/lib/boardTexture';
import { usePrefs } from '@/store/prefs';

const Board3D = lazy(() => import('@/board3d/Board3D'));

class Quiet extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}

/** The painted board, tilted like a table seen from a chair, turning slowly. */
function FlatBoard() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) paintBoard(canvas.current);
  }, []);
  return (
    <div className="sp-flat" aria-hidden="true">
      <div className="sp-flat-island" />
      <div className="sp-flat-table">
        <div className="sp-flat-spin">
          <canvas ref={canvas} className="sp-flat-board" />
        </div>
      </div>
    </div>
  );
}

/** The living island behind the menus: 3D, or the painted board in 2D. */
export function Backdrop() {
  const view = usePrefs((s) => s.view);
  const quality = usePrefs((s) => s.quality);
  return (
    <div className="sp-backdrop" aria-hidden="true">
      <div className="sp-sky"><span className="sun" /><span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" /></div>
      {view === '3d' ? (
        <Quiet fallback={<FlatBoard />}>
          <Suspense fallback={<FlatBoard />}>
            <Board3D state={null} focusTile={null} quality={quality === 'high' ? 'high' : 'low'} showcase />
          </Suspense>
        </Quiet>
      ) : (
        <FlatBoard />
      )}
      <div className="sp-vignette" />
    </div>
  );
}
