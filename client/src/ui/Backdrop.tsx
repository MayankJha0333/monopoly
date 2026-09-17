import { Component, Suspense, lazy, type ReactNode } from 'react';
import { usePrefs } from '@/store/prefs';

const Board3D = lazy(() => import('@/board3d/Board3D'));

class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The living island behind the menus, or a painted sky when 3D is off. */
export function Backdrop() {
  const view = usePrefs((s) => s.view);
  const quality = usePrefs((s) => s.quality);
  return (
    <div className="sp-backdrop" aria-hidden="true">
      <div className="sp-sky"><span className="sun" /><span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" /></div>
      {view === '3d' && (
        <Quiet>
          <Suspense fallback={null}>
            <Board3D state={null} focusTile={null} quality={quality === 'high' ? 'high' : 'low'} showcase />
          </Suspense>
        </Quiet>
      )}
      <div className="sp-vignette" />
    </div>
  );
}
