import { useEffect, useRef, type ReactNode } from 'react';

/** A centred sheet over a dimmed backdrop. Escape and the backdrop close it. */
export function Dialog({ title, onClose, children, wide, label }: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const first = box.current?.querySelector<HTMLElement>('input, button:not(.sp-x)');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-dialog" data-wide={wide || undefined} ref={box} role="dialog" aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
        <button className="sp-x" onClick={onClose} aria-label="Close">×</button>
        {title && <h2 className="sp-dialog-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
