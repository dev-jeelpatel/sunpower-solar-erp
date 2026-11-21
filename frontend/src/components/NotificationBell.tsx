import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { get, post, tokenStore } from '../api';
import { Icon, type IconName } from './icons';
import { ago } from './kit';
import { useToast } from './ui';

interface Note { id: number; event: string; title: string; link: string | null; read_at: string | null; created_at: string }

/** What each kind of event looks like in the list. */
const KIND: Record<string, [IconName, string]> = {
  'enquiry:new': ['inbox', 'indigo'], 'survey:scheduled': ['calendar', 'blue'], 'survey:submitted': ['doc', 'violet'], 'order:confirmed': ['check', 'green'],
  'payment:received': ['wallet', 'green'], 'dispatch:ready': ['box', 'amber'], 'dispatch:delivered': ['truck', 'blue'], 'job:scheduled': ['wrench', 'blue'],
  'job:completed': ['check', 'green'], 'ticket:new': ['ticket', 'rose'], 'ticket:assigned': ['ticket', 'blue'], 'ticket:resolved': ['check', 'green'], 'stock:low': ['alert', 'rose'],
};

/**
 * The bell in the top bar. New events arrive instantly over the live connection, and everything
 * is also saved, so what you missed while signed out is still here when you come back.
 */
export default function NotificationBell() {
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    get('/notifications').then((d) => { setItems(d.items); setUnread(d.unread); }).catch(() => { /* the bell is a convenience: stay quiet if the server is busy */ });
  }, []);

  useEffect(() => {
    load();
    const socket = io({ auth: { token: tokenStore.get() }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setLive(true); load(); }); // after a reconnect, catch up on anything missed
    socket.on('disconnect', () => setLive(false));
    socket.on('notification', (n: Note) => {
      setItems((l) => (l.some((x) => x.id === n.id) ? l : [n, ...l].slice(0, 40)));
      setUnread((u) => u + 1);
      toast(n.title);
    });
    window.addEventListener('focus', load);
    return () => { socket.close(); window.removeEventListener('focus', load); };
  }, [load, toast]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, []);

  const openNote = (n: Note) => {
    if (!n.read_at) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      post(`/notifications/${n.id}/read`).catch(() => load());
    }
    setOpen(false);
    if (n.link) nav(n.link);
  };
  const readAll = () => {
    setItems((l) => l.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    setUnread(0);
    post('/notifications/read-all').catch(() => load());
  };

  return (
    <div className="bell" ref={box}>
      <button className={`icon-btn bell-btn ${unread > 0 ? 'has-new' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
        <Icon n="bell" />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            <span className={`bell-live ${live ? 'on' : ''}`} title={live ? 'Connected: new items appear instantly' : 'Reconnecting…'}>{live ? 'Live' : 'Offline'}</span>
            <button className="bell-link" onClick={readAll} disabled={!unread}>Mark all as read</button>
          </div>
          {items.length === 0 ? (
            <div className="bell-empty"><Icon n="bell" /><b>You are all caught up</b><span>New enquiries, deliveries, tickets and more will show up here.</span></div>
          ) : (
            <ul>{items.map((n) => {
              const [ico, tone] = KIND[n.event] || ['bell', 'slate'];
              return (
                <li key={n.id}>
                  <button className={`bell-item ${n.read_at ? '' : 'new'}`} onClick={() => openNote(n)}>
                    <span className={`bell-ic t-${tone}`}><Icon n={ico} /></span>
                    <span className="bell-tx"><span>{n.title}</span><em>{ago(n.created_at)}</em></span>
                    {!n.read_at && <i className="bell-dot" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}</ul>
          )}
        </div>
      )}
    </div>
  );
}
