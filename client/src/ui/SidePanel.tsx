import { useEffect, useRef, useState } from 'react';
import { tile } from '@shared/board';
import { money } from '@shared/rules';
import type { GameState, LogKind, TradeOffer } from '@shared/types';
import { send } from '@/net/socket';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { CharacterAvatar } from './characters';

type Tab = 'log' | 'chat' | 'trades';

const KIND_ICON: Partial<Record<LogKind, string>> = {
  roll: '🎲', buy: '🏷️', rent: '💸', card: '🃏', jail: '🔒',
  build: '🏗️', mortgage: '🏦', trade: '🤝', auction: '🔨',
  bankrupt: '💀', tax: '🧾', win: '👑', move: '👣',
};

interface Props {
  state: GameState;
  playerId: string | null;
  onTile: (id: number) => void;
}

const ICONS: Record<Tab, string> = {
  log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  trades: 'M4 8h13l-3-3M20 16H7l3 3',
};
const LABELS: Record<Tab, string> = { log: 'Log', chat: 'Chat', trades: 'Trades' };

function DockIcon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

export function SidePanel({ state, playerId, onTile }: Props) {
  const [tab, setTab] = useState<Tab>('log');
  const minimized = useUI((s) => s.panelMin);
  const setMinimized = useUI((s) => s.setPanelMin);
  const [draft, setDraft] = useState('');
  const typing = useGame((s) => s.typing);
  const lastTypedAt = useRef(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadLog, setUnreadLog] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const seenChat = useRef(state.chat.length);
  const seenLog = useRef(state.log.length);

  const openTrades = state.trades.filter((t) => t.status === 'open');
  const forMe = openTrades.filter((t) => t.to === playerId);
  const involvingMe = openTrades.filter((t) => t.to === playerId || t.from === playerId);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length, state.chat.length, tab]);

  // Any offer you are part of — sent or received — pulls the panel to that tab,
  // and the panel drops back to the log once none are left open.
  useEffect(() => {
    setTab((current) => {
      if (involvingMe.length > 0) return 'trades';
      return current === 'trades' && openTrades.length === 0 ? 'log' : current;
    });
  }, [involvingMe.length, openTrades.length]);

  useEffect(() => {
    if (tab === 'chat' && !minimized) { seenChat.current = state.chat.length; setUnreadChat(0); }
    else setUnreadChat(Math.max(0, state.chat.length - seenChat.current));
  }, [state.chat.length, tab, minimized]);

  useEffect(() => {
    if (tab === 'log' && !minimized) { seenLog.current = state.log.length; setUnreadLog(0); }
    else setUnreadLog(Math.max(0, state.log.length - seenLog.current));
  }, [state.log.length, tab, minimized]);

  // An offer waiting on your answer opens the panel so it is not missed.
  useEffect(() => {
    if (forMe.length > 0 && minimized) { setTab('trades'); setMinimized(false); }
  }, [forMe.length]);

  const openTab = (t: Tab) => { setTab(t); setMinimized(false); };

  if (minimized) {
    const badges: Record<Tab, number> = { log: unreadLog, chat: unreadChat, trades: forMe.length };
    const someoneTyping = Object.keys(typing).some((id) => id !== playerId);
    return (
      <nav className="side-dock" aria-label="Log, chat and trades">
        {(['log', 'chat', 'trades'] as Tab[]).map((t) => (
          <button key={t} className="dock-btn" onClick={() => openTab(t)} aria-label={`Open ${LABELS[t].toLowerCase()}`}
            data-alert={(t !== 'log' && badges[t] > 0) || undefined}>
            <DockIcon d={ICONS[t]} />
            <span className="dock-label">{LABELS[t]}</span>
            {t === 'chat' && someoneTyping && <span className="dock-typing" aria-label="someone is typing" />}
            {badges[t] > 0 && <span className="dock-badge">{badges[t] > 99 ? '99+' : badges[t]}</span>}
          </button>
        ))}
      </nav>
    );
  }

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send('chat:send', { text });
    setDraft('');
    lastTypedAt.current = 0;
  };

  // One "typing" ping every 1.5 seconds while someone is writing — enough to
  // keep the line alive at the other end without chattering at the server.
  const onDraft = (value: string) => {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypedAt.current > 1500) {
      lastTypedAt.current = now;
      send('chat:typing');
    }
  };

  const others = Object.entries(typing)
    .filter(([id]) => id !== playerId)
    .map(([, v]) => v.name);
  const typingLine = others.length === 0 ? null
    : others.length === 1 ? `${others[0]} is typing…`
      : others.length === 2 ? `${others[0]} and ${others[1]} are typing…`
        : 'Several players are typing…';

  return (
    <aside className="card side">
      <div className="tabs">
        <button className="tab" data-on={tab === 'log'} onClick={() => setTab('log')}>Log</button>
        <button className="tab" data-on={tab === 'chat'} onClick={() => setTab('chat')}>
          Chat{unreadChat > 0 && <span className="badge">{unreadChat}</span>}
        </button>
        <button className="tab" data-on={tab === 'trades'} onClick={() => setTab('trades')}>
          Trades{forMe.length > 0 && <span className="badge">{forMe.length}</span>}
        </button>
        <button className="tab-min" aria-label="Minimize panel" title="Minimize" onClick={() => setMinimized(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
        </button>
      </div>

      {tab === 'log' && (
        <div className="panel-body" ref={scroller}>
          {state.log.map((l) => {
            const who = state.players.find((p) => p.id === l.playerId);
            return (
              <div
                className="log-line"
                data-kind={l.kind}
                data-clickable={l.tileId !== undefined}
                key={l.id}
                onClick={() => l.tileId !== undefined && onTile(l.tileId)}
              >
                <span className="log-icon">{KIND_ICON[l.kind] ?? '·'}</span>
                {who && <CharacterAvatar token={who.token} color={who.color} size={17} className="log-face" />}
                <span className="log-text">{l.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'chat' && (
        <div className="chat-wrap">
          <div className="panel-body" ref={scroller}>
            {state.chat.length === 0 && <div className="empty">Say hello to the table.</div>}
            {state.chat.map((m) => (
              <div className="chat-msg" key={m.id}>
                <span className="who" style={{ color: m.color }}>{m.name}</span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="typing-line" aria-live="polite">
            {typingLine && (
              <>
                <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                {typingLine}
              </>
            )}
          </div>
          <form className="chat-form" onSubmit={submitChat}>
            <input className="input grow" value={draft} maxLength={240} placeholder="Message the table…"
              onChange={(e) => onDraft(e.target.value)} />
            <button className="btn btn-sm" type="submit">Send</button>
          </form>
        </div>
      )}

      {tab === 'trades' && (
        <div className="panel-body">
          {openTrades.length === 0 && (
            <div className="empty">No offers on the table. Use <b>Trade</b> to make one.</div>
          )}
          {openTrades.map((t) => (
            <TradeRow key={t.id} offer={t} state={state} playerId={playerId} onTile={onTile} />
          ))}
        </div>
      )}
    </aside>
  );
}

function TradeRow({ offer, state, playerId, onTile }: {
  offer: TradeOffer; state: GameState; playerId: string | null; onTile: (id: number) => void;
}) {
  const setHighlight = useUI((s) => s.setHighlight);
  const from = state.players.find((p) => p.id === offer.from);
  const to = state.players.find((p) => p.id === offer.to);
  const mine = offer.from === playerId;
  const forMe = offer.to === playerId;

  const side = (label: string, s: TradeOffer['give'], color?: string) => (
    <div className="line">
      <span className="side-label">{label}</span>
      <div className="grow">
        {s.cash > 0 && <div className="gold">{money(s.cash)}</div>}
        {s.jailCards > 0 && <div>{s.jailCards} jail card{s.jailCards > 1 ? 's' : ''}</div>}
        {s.properties.map((id) => (
          <button
            key={id}
            className="tile-link"
            onClick={() => onTile(id)}
            onMouseEnter={() => setHighlight([id], color ?? null)}
          >
            {tile(id).name}
          </button>
        ))}
        {s.cash === 0 && s.jailCards === 0 && s.properties.length === 0 && (
          <div className="faint">nothing</div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="offer"
      data-mine={forMe}
      onMouseEnter={() =>
        setHighlight([...offer.give.properties, ...offer.want.properties], from?.color ?? null)}
    >
      <div className="offer-head">
        <span className="pip" style={{ background: from?.color }} />
        <b>{from?.name}</b>
        <span className="faint">→</span>
        <span className="pip" style={{ background: to?.color }} />
        <b>{to?.name}</b>
      </div>
      {side('Gives', offer.give, from?.color)}
      {side('Wants', offer.want, to?.color)}
      {forMe && (
        <div className="row">
          <button className="btn btn-sm btn-good grow"
            onClick={() => send('trade:respond', { id: offer.id, accept: true })}>Accept</button>
          <button className="btn btn-sm btn-danger grow"
            onClick={() => send('trade:respond', { id: offer.id, accept: false })}>Decline</button>
        </div>
      )}
      {mine && (
        <button className="btn btn-sm" onClick={() => send('trade:cancel', { id: offer.id })}>Withdraw</button>
      )}
    </div>
  );
}
