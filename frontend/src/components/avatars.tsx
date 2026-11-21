// Illustrated round avatars: every person gets a unique cartoon face on a neon-city background.
// Faces are generated from the person's name (so they never change), and outfits follow the role.
// Features (skin, hair, glasses...) come only from the name's hash, never from guessing anything about the person.

export type FaceRole = 'admin' | 'sales' | 'technician' | 'warehouse' | 'support' | 'director' | 'staff' | 'customer';

const SKINS = ['#f8d9bf', '#f0c2a0', '#e0a97c', '#c68a5c', '#a06a43', '#7a4b2e'];
const HAIRS = ['#1f2937', '#2b1d14', '#5a3a22', '#8b5a2b', '#c99a4b', '#9ca3af', '#6b2d12'];
/** [top, bottom, glow] colours of the background scene */
const SCENES: [string, string, string][] = [
  ['#f472b6', '#6366f1', '#fde68a'], ['#fb923c', '#e11d48', '#fef3c7'], ['#22d3ee', '#6366f1', '#fbcfe8'],
  ['#34d399', '#0ea5e9', '#fef9c3'], ['#a78bfa', '#ec4899', '#bae6fd'], ['#fbbf24', '#f43f5e', '#e0f2fe'],
];
const SUITS = ['#1e293b', '#0f172a', '#334155', '#312e5c', '#3f3f46'];
const TEES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444'];
const TIES = ['#ef4444', '#6366f1', '#f59e0b', '#10b981', '#ec4899'];

const hashStr = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
/** Small deterministic random generator so the same name always draws the same face. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];
/** Darken a #rrggbb colour by a fraction (for neck, ears and shading). */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

type Outfit = 'suit' | 'vest' | 'orange' | 'hoodie' | 'tee' | 'shirt';

function build(seed: string, role: FaceRole) {
  const h = hashStr(`${seed}|${role}`);
  const r = rng(h);
  const skin = pick(r, SKINS);
  const hair = pick(r, HAIRS);
  const scene = pick(r, SCENES);
  const style = Math.floor(r() * 6);
  const glassesChance = role === 'admin' || role === 'director' ? 1 : role === 'sales' ? 0.4 : role === 'customer' ? 0.35 : 0.25;
  const glasses = r() < glassesChance;
  const smileOpen = r() < 0.45;
  const blush = r() < 0.55;
  const mustache = r() < 0.12;
  const tie = pick(r, TIES);
  const tee = pick(r, TEES);
  const suit = pick(r, SUITS);
  const glowX = 24 + Math.floor(r() * 52);
  const buildings = Array.from({ length: 9 }, (_, i) => ({ x: i * 12 - 3, w: 11, h: 14 + Math.floor(r() * 28), win: [r(), r(), r()] }));
  const outfit: Outfit =
    role === 'technician' ? 'vest' : role === 'warehouse' ? 'orange' : role === 'admin' || role === 'sales' || role === 'director' ? 'suit'
      : role === 'support' ? 'tee' : role === 'staff' ? 'shirt' : pick(r, ['hoodie', 'tee', 'shirt'] as Outfit[]);
  return { key: h.toString(36), skin, hair, scene, style, glasses, smileOpen, blush, mustache, tie, tee, suit, glowX, buildings, outfit };
}

/** Hair shapes: `back` is drawn behind the head, `front` on top of it. */
function hairParts(style: number, c: string) {
  switch (style) {
    case 0: return { front: <path d="M33.5 42 C32 24 42 19 50 19 C58 19 68 24 66.5 42 C63 34 57 30 50 30 C43 30 37 34 33.5 42 Z" fill={c} /> };
    case 1: return { front: <path d="M33 43 C30 22 46 14 58 19 C66 22 69 32 67 43 C64 35 56 29 46 30 C40 31 35 36 33 43 Z" fill={c} /> };
    case 2: return {};
    case 3: return {
      back: <path d="M31 44 C27 22 40 13 50 13 C60 13 73 22 69 44 C71 60 68 74 63 80 L37 80 C32 74 29 60 31 44 Z" fill={c} />,
      front: <path d="M34 39 C38 27 62 27 66 39 C60 33 40 33 34 39 Z" fill={c} />,
    };
    case 4: return {
      front: <><circle cx="50" cy="15" r="6.5" fill={c} /><path d="M33.5 42 C32 24 42 20 50 20 C58 20 68 24 66.5 42 C63 34 57 31 50 31 C43 31 37 34 33.5 42 Z" fill={c} /></>,
    };
    default: return {
      back: <ellipse cx="50" cy="33" rx="22" ry="20" fill={c} />,
      front: <path d="M34 40 C34 28 66 28 66 40 C60 33 40 33 34 40 Z" fill={c} />,
    };
  }
}

export function Face({ seed, role = 'customer', size }: { seed: string; role?: FaceRole; size?: number }) {
  const f = build(seed || '?', role);
  const id = `fa${f.key}`;
  const skinShade = shade(f.skin, 0.14);
  const hp = hairParts(f.style, f.hair);
  const bodyFill =
    f.outfit === 'suit' ? f.suit : f.outfit === 'vest' ? '#64748b' : f.outfit === 'orange' ? '#475569'
      : f.outfit === 'shirt' ? '#e2e8f0' : f.tee;

  const body = (
    <>
      <path d="M10 102 C12 80 30 70 50 70 C70 70 88 80 90 102 Z" fill={bodyFill} />
      <rect x="44" y="58" width="12" height="15" rx="5" fill={skinShade} />
      {f.outfit === 'suit' && (
        <>
          <path d="M43 70.5 L50 84 L57 70.5 Z" fill="#f8fafc" />
          {role !== 'admin' && <path d="M50 73 L47.4 77 L50 92 L52.6 77 Z" fill={f.tie} />}
          <path d="M50 84 L38 72 M50 84 L62 72" stroke="rgba(255,255,255,.18)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
      {(f.outfit === 'vest' || f.outfit === 'orange') && (
        <>
          <path d="M16 102 C17 84 30 74 43 71 L46.5 102 Z" fill={f.outfit === 'vest' ? '#fde047' : '#fb923c'} />
          <path d="M84 102 C83 84 70 74 57 71 L53.5 102 Z" fill={f.outfit === 'vest' ? '#fde047' : '#fb923c'} />
          <path d="M19 88 H45.5 M19 95.5 H46 M81 88 H54.5 M81 95.5 H54" stroke="#f1f5f9" strokeWidth="2.6" opacity=".95" />
        </>
      )}
      {f.outfit === 'hoodie' && (
        <>
          <path d="M33 71 C37 85 63 85 67 71" fill="none" stroke={shade(f.tee, 0.25)} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M45 80 V88 M55 80 V88" stroke="#f8fafc" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
      {f.outfit === 'tee' && <path d="M41.5 71 Q50 80 58.5 71" fill="none" stroke={shade(f.tee, 0.28)} strokeWidth="2.4" strokeLinecap="round" />}
      {f.outfit === 'shirt' && (
        <>
          <path d="M44 69 L50 78 L40 75 Z M56 69 L50 78 L60 75 Z" fill="#fff" stroke="#cbd5e1" strokeWidth=".6" />
          <path d="M50 78 V100" stroke="#cbd5e1" strokeWidth="1" />
        </>
      )}
    </>
  );

  return (
    <svg viewBox="0 0 100 100" width={size ?? '100%'} height={size ?? '100%'} role="img" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <clipPath id={`${id}c`}><circle cx="50" cy="50" r="50" /></clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor={f.scene[0]} /><stop offset="1" stopColor={f.scene[1]} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="100" height="100" fill={`url(#${id}g)`} />
        <circle cx={f.glowX} cy="30" r="15" fill={f.scene[2]} opacity=".5" />
        {f.buildings.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={100 - b.h - 12} width={b.w} height={b.h + 12} fill="rgba(15,23,42,.36)" />
            {b.win[0] > 0.3 && <rect x={b.x + 2.5} y={100 - b.h - 8} width="2" height="2" fill="#fde68a" opacity=".85" />}
            {b.win[1] > 0.5 && <rect x={b.x + 6.5} y={100 - b.h - 3} width="2" height="2" fill="#fde68a" opacity=".7" />}
            {b.win[2] > 0.6 && <rect x={b.x + 2.5} y={100 - b.h + 3} width="2" height="2" fill="#a5f3fc" opacity=".8" />}
          </g>
        ))}
        {hp.back}
        {body}
        <circle cx="33.6" cy="46" r="3.3" fill={skinShade} /><circle cx="66.4" cy="46" r="3.3" fill={skinShade} />
        <ellipse cx="50" cy="44" rx="16.5" ry="18.5" fill={f.skin} />
        {hp.front}
        {f.blush && <><circle cx="38.6" cy="52.5" r="3" fill="#fb7185" opacity=".28" /><circle cx="61.4" cy="52.5" r="3" fill="#fb7185" opacity=".28" /></>}
        <path d="M38.6 40.4 Q43 38.4 47.2 40.2 M52.8 40.2 Q57 38.4 61.4 40.4" fill="none" stroke={f.hair} strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="43" cy="45.6" rx="1.8" ry="2.3" fill="#111827" /><ellipse cx="57" cy="45.6" rx="1.8" ry="2.3" fill="#111827" />
        <circle cx="43.6" cy="44.8" r=".6" fill="#fff" /><circle cx="57.6" cy="44.8" r=".6" fill="#fff" />
        <path d="M50 47 Q48.2 51 50.2 52.2" fill="none" stroke={skinShade} strokeWidth="1.3" strokeLinecap="round" />
        {f.mustache && <path d="M44.3 53.4 Q50 50.6 55.7 53.4 Q50 55.6 44.3 53.4 Z" fill={f.hair} />}
        {f.smileOpen
          ? <path d="M44.4 55 Q50 62.5 55.6 55 Z" fill="#7c2d12" />
          : <path d="M44.8 55.4 Q50 59.6 55.2 55.4" fill="none" stroke="#7c2d12" strokeWidth="1.7" strokeLinecap="round" />}
        {f.glasses && (
          <g fill="rgba(255,255,255,.2)" stroke="#111827" strokeWidth="1.5">
            <circle cx="43" cy="45.4" r="6.4" /><circle cx="57" cy="45.4" r="6.4" />
            <path d="M49.4 45 H50.6 M36.6 44.8 L33.4 44 M63.4 44.8 L66.6 44" fill="none" strokeLinecap="round" />
          </g>
        )}
        {role === 'technician' && (
          <>
            <path d="M31 38 C30 18 70 18 69 38 Z" fill="#fbbf24" />
            <rect x="27" y="36.2" width="46" height="5" rx="2.5" fill="#f59e0b" />
            <rect x="47.8" y="17.5" width="4.4" height="14" rx="2.2" fill="#f59e0b" />
          </>
        )}
        {role === 'warehouse' && (
          <>
            <path d="M32 38 C32 21 68 21 68 38 Z" fill={f.tee} />
            <path d="M50 36.4 H77 C77 41 58 42 50 40.4 Z" fill={shade(f.tee, 0.22)} />
          </>
        )}
        {role === 'support' && (
          <>
            <path d="M32.5 43 C31 20 69 20 67.5 43" fill="none" stroke="#111827" strokeWidth="3.2" strokeLinecap="round" />
            <rect x="29.4" y="41" width="6" height="11" rx="3" fill="#111827" /><rect x="64.6" y="41" width="6" height="11" rx="3" fill="#111827" />
            <path d="M67.4 50 C67.4 60 61 61 55.6 58.8" fill="none" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="55" cy="58.7" r="2" fill="#111827" />
          </>
        )}
      </g>
      <circle cx="50" cy="50" r="48.6" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2.8" />
    </svg>
  );
}
