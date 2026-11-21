import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth';
import { label } from './ui';

// Minimal 24px stroke icons (Lucide-style paths), so the UI has no emoji and no icon dependency.
const P = {
  dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  ruler: 'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0zM14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  card: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20',
  bank: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3 2 9h20z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  warehouse: 'M22 8.35V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.35a1 1 0 0 1 .55-.89l9-4.5a1 1 0 0 1 .9 0l9 4.5a1 1 0 0 1 .55.89zM6 18h12M6 14h12',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chart: 'M3 3v18h18M7 14l4-4 4 4 5-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[name]} />
  </svg>
);

// [path, label, icon, roles that see it]
const ALL = ['admin', 'sales', 'technician', 'warehouse', 'support', 'director'];
type NavItem = [string, string, string, string[]];
const NAV: [string, NavItem[]][] = [
  ['Overview', [['/', 'Dashboard', 'dash', ALL]]],
  ['Sales', [
    ['/enquiries', 'Enquiries', 'inbox', ['sales', 'director']],
    ['/surveys', 'Site surveys', 'ruler', ['sales', 'technician', 'director']],
    ['/quotes', 'Quotes', 'doc', ['sales', 'director']],
    ['/orders', 'Orders', 'box', ['sales', 'warehouse', 'director']],
    ['/invoices', 'Invoices & payments', 'card', ['sales', 'director']],
    ['/subsidies', 'Subsidy tracker', 'bank', ['sales', 'director']],
    ['/customers', 'Customers', 'users', ['sales', 'support', 'director']],
  ]],
  ['Operations', [
    ['/inventory', 'Inventory', 'warehouse', ['warehouse', 'director']],
    ['/dispatch', 'Dispatch', 'truck', ['warehouse', 'director']],
    ['/jobs', 'Installation jobs', 'wrench', ['technician', 'sales', 'director']],
  ]],
  ['After-sales', [
    ['/tickets', 'Service tickets', 'ticket', ['support', 'technician', 'director']],
    ['/lookup', 'Warranty lookup', 'search', ['support', 'sales', 'warehouse', 'director']],
  ]],
  ['Management', [
    ['/reports', 'Profit & reports', 'chart', ['director']],
    ['/catalog', 'Products & packages', 'sun', ['warehouse', 'sales', 'director']],
    ['/users', 'Staff', 'shield', []],
  ]],
];

const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Layout() {
  const { logout } = useAuth();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const show = (roles) => user.role === 'admin' || roles.includes(user.role);
  const current = NAV.flatMap(([g, items]) => items.map((i) => [g, ...i])).find(([, to]) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to as string)));

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="logo"><Icon name="sun" /></span>
          <div>SunPower<small>Solar ERP</small></div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([group, items]) => {
            const visible = items.filter(([, , , roles]) => show(roles));
            return visible.length ? (
              <div key={group}>
                <div className="nav-group">{group}</div>
                {visible.map(([to, text, ico]) => (
                  <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="ico"><Icon name={ico} /></span>{text}
                  </NavLink>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="userbox">
          <span className="avatar">{initials(user.name)}</span>
          <div className="who"><b>{user.name}</b><span className="role">{label(user.role)}</span></div>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn secondary sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="where">{current ? <><span>{current[0]} / </span>{current[2]}</> : 'SunPower ERP'}</div>
          <div className="sp" />
          <Link to="/home" className="pill" title="Open the customer website"><i />View website</Link>
          <span className="avatar" title={user.name}>{initials(user.name)}</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
