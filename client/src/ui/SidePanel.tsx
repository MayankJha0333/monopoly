import { useEffect, useRef, useState } from 'react';
import { tile } from '@shared/board';
import { money } from '@shared/rules';
import type { GameState, LogKind, TradeOffer } from '@shared/types';
import { send } from '@/net/socket';
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

export function SidePanel({ state, playerId, onTile }: Props) {
  const [tab, setTab] = useState<Tab>('log');
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [unreadChat, setUnreadChat] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const seenChat = useRef(state.chat.length);

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
    if (tab === 'chat') { seenChat.current = state.chat.length; setUnreadChat(0); }
    else setUnreadChat(state.chat.length - seenChat.current);
  }, [state.chat.length, tab]);

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send('chat:send', { text });
    setDraft('');
  };

  return (
    <aside className="card side" data-collapsed={collapsed}>
      <div className="tabs">
        <button className="tab" data-on={tab === 'log'} onClick={() => setTab('log')}>Log</button>
        <button className="tab" data-on={tab === 'chat'} onClick={() => setTab('chat')}>
          Chat{unreadChat > 0 && <span className="badge">{unreadChat}</span>}
        </button>
        <button className="tab" data-on={tab === 'trades'} onClick={() => setTab('trades')}>
          Trades{forMe.length > 0 && <span className="badge">{forMe.length}</span>}
        </button>
        <button className="tab-collapse" aria-label="Collapse panel" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▲' : '▼'}
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
          <form className="chat-form" onSubmit={submitChat}>
            <input className="input grow" value={draft} maxLength={240} placeholder="Message the table…"
              onChange={(e) => setDraft(e.target.value)} />
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
