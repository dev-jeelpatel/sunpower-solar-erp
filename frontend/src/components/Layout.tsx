import NotificationBell from './NotificationBell';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth';
import { Face } from './avatars';
import { Icon, type IconName } from './icons';
import { label } from './ui';

// [path, label, icon, roles that see it]
type NavItem = [string, string, IconName, string[]];
const ALL = ['admin', 'sales', 'technician', 'warehouse', 'support', 'director'];
const NAV: [string, NavItem[]][] = [
  ['Overview', [['/', 'Dashboard', 'dash', ALL]]],
  ['Sales', [
    ['/enquiries', 'Enquiries', 'inbox', ['sales', 'director']],
    ['/surveys', 'Site surveys', 'ruler', ['sales', 'technician', 'director']],
    ['/quotes', 'Quotes', 'doc', ['sales', 'director']],
    ['/orders', 'Orders', 'box', ['sales', 'warehouse', 'director']],
    ['/invoices', 'Invoices & payments', 'card', ['sales', 'director']],
  ]],
  ['Delivery', [
    ['/dispatch', 'Dispatch', 'truck', ['warehouse', 'director']],
    ['/schedule', 'Schedule', 'calendar', ['sales', 'support', 'technician', 'director']],
    ['/jobs', 'Installation jobs', 'wrench', ['technician', 'sales', 'director']],
    ['/subsidies', 'Subsidy tracker', 'bank', ['sales', 'director']],
  ]],
  ['After-sales', [
    ['/tickets', 'Service tickets', 'ticket', ['support', 'technician', 'director']],
    ['/claims', 'Warranty claims', 'shield', ['support', 'technician', 'warehouse', 'director']],
    ['/lookup', 'Warranty lookup', 'search', ['support', 'sales', 'warehouse', 'director']],
  ]],
  ['People & stock', [
    ['/customers', 'Customers', 'users', ['sales', 'support', 'director']],
    ['/inventory', 'Inventory', 'warehouse', ['warehouse', 'director']],
    ['/catalog', 'Products & packages', 'sun', ['warehouse', 'sales', 'director']],
  ]],
  ['Management', [
    ['/reports', 'Profit & reports', 'chart', ['director']],
    ['/users', 'Staff', 'shield', []],
  ]],
];

const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const COLLAPSE_KEY = 'sunpower_sidebar_collapsed';

/** Ctrl/Cmd + K: jump to any page you are allowed to see. */
function CommandPalette({ items, onClose }: { items: { group: string; to: string; text: string; icon: IconName }[]; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.text.toLowerCase().includes(t) || i.group.toLowerCase().includes(t)) : items;
  }, [q, items]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [q]);

  const go = (to: string) => { onClose(); nav(to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && list[active]) go(list[active].to);
  };

  return (
    <div className="cmd-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Quick search" onKeyDown={onKey}>
        <div className="cmd-in"><Icon n="search" /><input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page…" aria-label="Search pages" /><kbd>Esc</kbd></div>
        <ul className="cmd-list">
          {list.length === 0 && <li className="cmd-empty">No pages match “{q}”</li>}
          {list.map((i, n) => (
            <li key={i.to}>
              <button className={n === active ? 'on' : ''} onMouseEnter={() => setActive(n)} onClick={() => go(i.to)}>
                <span className="cmd-ic"><Icon n={i.icon} /></span><span>{i.text}</span><small>{i.group}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="cmd-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span></div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { logout } = useAuth();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setMenu(false); }, [loc.pathname]);
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, []);

  const show = (roles: string[]) => user.role === 'admin' || roles.includes(user.role);
  const visible = useMemo(() => NAV.map(([group, items]) => [group, items.filter(([, , , roles]) => show(roles))] as [string, NavItem[]]).filter(([, items]) => items.length), [user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = useMemo(() => visible.flatMap(([group, items]) => items.map(([to, text, icon]) => ({ group, to, text, icon }))), [visible]);
  const current = flat.find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)));

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="logo"><Icon n="sun" /></span>
          <div className="brand-tx">SunPower<small>Solar ERP</small></div>
        </div>
        <nav className="nav" aria-label="Main">
          {visible.map(([group, items]) => (
            <div key={group} className="nav-sec">
              <div className="nav-group">{group}</div>
              {items.map(([to, text, ico]) => (
                <NavLink key={to} to={to} end={to === '/'} title={collapsed ? text : undefined} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <span className="ico"><Icon n={ico} /></span><span className="nav-tx">{text}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon n={collapsed ? 'chevR' : 'chevL'} /><span className="nav-tx">Collapse</span>
        </button>
        <div className="userbox">
          <div className="who"><b>{user.name}</b><span className="role">{label(user.role)}</span></div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn secondary sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon n="menu" /></button>
          <div className="where">{current ? <><span>{current.group}</span><i>/</i>{current.text}</> : 'SunPower ERP'}</div>
          <div className="sp" />
          <button className="search-btn" onClick={() => setPalette(true)} aria-label="Quick search">
            <Icon n="search" /><span>Search pages…</span><kbd>Ctrl K</kbd>
          </button>
          <NotificationBell />
          <Link to="/home" className="pill" title="Open the customer website"><Icon n="globe" />Website</Link>
          <div className="usermenu" ref={menuRef}>
            <button className="avatar-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="avatar"><Face seed={user.name} role={user.role} /></span>
            </button>
            {menu && (
              <div className="menu" role="menu">
                <div className="menu-head"><span className="avatar lg"><Face seed={user.name} role={user.role} /></span><div><b>{user.name}</b><small>{user.email}</small><em>{label(user.role)}</em></div></div>
                <Link role="menuitem" to="/home"><Icon n="globe" />View website</Link>
                <button role="menuitem" onClick={() => { setMenu(false); setPalette(true); }}><Icon n="search" />Quick search <kbd>Ctrl K</kbd></button>
                <button role="menuitem" className="danger" onClick={logout}><Icon n="logout" />Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      {palette && <CommandPalette items={flat} onClose={() => setPalette(false)} />}
    </div>
  );
}
