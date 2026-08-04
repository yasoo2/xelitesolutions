/**
 * THE APPLICATION HALF OF A REACT BUILD.
 *
 * `ReactProjectTool` knows how to make a beautiful presentation site. That is
 * the right answer for a café and the wrong answer for «تطبيق خرائط»: the user
 * received Hero + Features + FAQ + a restaurant menu and no map at all, and
 * said so — «معرض صور وكلمات وليس تطبيقات حقيقية».
 *
 * So an app request no longer goes through the section library. It goes
 * through here, and gets a program: state, storage, input, validation,
 * computed numbers, and a real integration where the domain demands one
 * (Leaflet + OpenStreetMap for a map, open-meteo for weather, the session's
 * own Joe API for anything that owns rows).
 *
 * Every template is hand-written and parameterized — the same discipline the
 * page builder uses. A weak model is never asked to write JSX that must
 * compile; the blueprint decides the schema, these templates decide the
 * program, and `vite build` proves it.
 */
import type { AppBlueprint } from '../../../core/design/app-blueprints';

/** Escape for a JS single-quoted literal inside generated source. */
const q = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

export interface AppBuildOptions {
    brand: string;
    isArabic: boolean;
    /** The session's Joe API endpoint, when a backend was built first. */
    api?: string;
    /** localStorage namespace — one per project, so two apps never collide. */
    storeKey: string;
    /** The build's brand colour — used for the favicon and the theme colour. */
    brandColor?: string;
}

/* ── content.js — the app's own shape, nothing borrowed from a brochure ──── */

export function fileAppContentJs(bp: AppBlueprint, o: AppBuildOptions): string {
    return `// WHAT THIS APP IS — its schema, its numbers, its storage key.
// No marketing copy, no fabricated people: this file describes a program.
export const content = {
  brand: '${q(o.brand)}',
  isArabic: ${o.isArabic},
  kind: '${q(bp.kind)}',
  engine: '${q(bp.engine)}',
  title: '${q(bp.title)}',
  lede: '${q(bp.lede)}',
  entityOne: '${q(bp.entityOne)}',
  entityMany: '${q(bp.entityMany)}',
  emptyHint: '${q(bp.emptyHint)}',
  // Everything the app stores lives under this key — survives a reload.
  storeKey: '${q(o.storeKey)}',
  // The session's Joe API, when a backend was built first. Empty means the
  // app is honestly local: it SAYS so in the interface rather than pretending.
  api: '${q(o.api || '')}',
  fields: [
${bp.fields.map(f => `    { key: '${q(f.key)}', label: '${q(f.label)}', type: '${q(f.type)}'${f.options ? `, options: [${f.options.map(x => `'${q(x)}'`).join(', ')}]` : ''}${f.required ? ', required: true' : ''}${f.primary ? ', primary: true' : ''} },`).join('\n')}
  ],
  metrics: [
${bp.metrics.map(m => `    { label: '${q(m.label)}', kind: '${q(m.kind)}'${m.field ? `, field: '${q(m.field)}'` : ''}${m.field2 ? `, field2: '${q(m.field2)}'` : ''}${m.equals ? `, equals: '${q(m.equals)}'` : ''} },`).join('\n')}
  ],
  statusField: '${q(bp.statusField || '')}',
  doneValue: '${q(bp.doneValue || '')}',
};
`;
}

/* ── the shell ───────────────────────────────────────────────────────────── */

const ENGINE_COMPONENT: Record<AppBlueprint['engine'], string> = {
    map: 'MapApp', chat: 'ChatApp', weather: 'WeatherApp', records: 'RecordsApp',
};

export function fileAppShellJsx(bp: AppBlueprint, isAr: boolean): string {
    const C = ENGINE_COMPONENT[bp.engine];
    return `import React, { useEffect, useState } from 'react';
import ${C} from './components/${C}.jsx';
import { content } from './content.js';

/** The application shell: identity, theme, and the program itself. */
export default function App() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(content.storeKey + ':theme');
      if (saved) return saved === 'dark';
    } catch { /* private mode */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem(content.storeKey + ':theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
  }, [dark]);

  return (
    <div className="app">
      <header className="app-bar">
        <div className="app-bar-in">
          {/* A real <h1>: the app's own name. The self-QA in a real browser
              measured zero headings on the first application build. */}
          <div className="app-id">
            <h1 className="app-name">{content.brand}</h1>
            <span className="app-sub">{content.title}</span>
          </div>
          <button className="icon-btn" onClick={() => setDark(v => !v)}
            aria-label={${isAr ? "'تبديل الوضع الليلي'" : "'Toggle dark mode'"}} title={${isAr ? "'تبديل الوضع'" : "'Toggle theme'"}}>
            {dark ? '☀︎' : '☾'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <${C} content={content} />
      </main>
      <footer className="app-foot">
        <span>{content.brand}</span>
        <span className="dot">•</span>
        <span>${isAr ? 'بياناتك محفوظة على جهازك' : 'Your data stays on your device'}</span>
      </footer>
    </div>
  );
}
`;
}

export function fileAppMainJsx(): string {
    return `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

export function fileAppIndexHtml(bp: AppBlueprint, o: AppBuildOptions): string {
    // A real icon, inline: the browser asks for /favicon.ico on every load and
    // the app's first self-QA reported that missing file as a console error.
    const color = o.brandColor || '#1a73e8';
    const initial = (o.brand.trim()[0] || 'J').replace(/[<>&"]/g, '');
    const icon = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="43" font-family="sans-serif" font-size="34" font-weight="bold" fill="#fff" text-anchor="middle">${initial}</text></svg>`)}`;
    return `<!DOCTYPE html>
<html lang="${o.isArabic ? 'ar' : 'en'}" dir="${o.isArabic ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${o.brand} — ${bp.title}</title>
    <meta name="description" content="${bp.lede.replace(/"/g, '&quot;')}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="${color}" />
    <link rel="icon" href="${icon}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
}

/* ── storage, metrics, export — the parts every engine shares ────────────── */

export function fileAppStoreJs(): string {
    return `/**
 * The app's memory. localStorage first — instant, offline, and honest about
 * where the data lives — with a best-effort read/write against the project's
 * own API when one exists, so a full-stack build shares rows between devices.
 */
export function createStore(key) {
  const read = () => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  };
  const write = (rows) => {
    try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota or private mode */ }
    return rows;
  };
  return { read, write };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isToday = (v) => String(v || '').slice(0, 10) === todayISO();

const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round = (n) => (Math.round(n * 100) / 100).toLocaleString();

/** One number, computed from the rows the user really entered. */
export function computeMetric(m, rows) {
  const list = Array.isArray(rows) ? rows : [];
  switch (m.kind) {
    case 'count': return String(list.length);
    case 'countWhere': return String(list.filter(r => String(r[m.field] || '') === m.equals).length);
    case 'sum': return round(list.reduce((a, r) => a + num(r[m.field]), 0));
    case 'sumProduct': return round(list.reduce((a, r) => a + num(r[m.field]) * num(r[m.field2]), 0));
    case 'avg': {
      const vals = list.map(r => r[m.field]).filter(v => v !== '' && v != null).map(num);
      return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : '—';
    }
    case 'todayCount': return String(list.filter(r => isToday(r[m.field])).length);
    case 'todaySum': return round(list.filter(r => isToday(r[m.field])).reduce((a, r) => a + num(r[m.field2]), 0));
    default: return '—';
  }
}

/** A real export — the rows leave with the user, not locked in a browser. */
export function toCsv(fields, rows) {
  const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = fields.map(f => cell(f.label)).join(',');
  const body = rows.map(r => fields.map(f => cell(r[f.key])).join(',')).join('\\n');
  return '\\uFEFF' + head + '\\n' + body;
}

export function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Best-effort server sync. Any failure keeps the local rows — never a crash. */
export async function apiList(api) {
  if (!api) return null;
  try {
    const r = await fetch(api, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const rows = Array.isArray(d) ? d : Array.isArray(d && d.items) ? d.items : Array.isArray(d && d.data) ? d.data : null;
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

export async function apiCreate(api, row) {
  if (!api) return null;
  try {
    const r = await fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => row);
  } catch { return null; }
}
`;
}

/* ── engine 1: records — create, edit, delete, search, filter, totals ────── */

export function fileRecordsAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useEffect, useMemo, useState } from 'react';
import { createStore, uid, todayISO, computeMetric, toCsv, download, apiList, apiCreate } from '../app/store.js';

const blank = (fields) => {
  const d = {};
  for (const f of fields) d[f.key] = f.type === 'date' ? todayISO() : f.type === 'select' ? (f.options && f.options[0]) || '' : '';
  return d;
};

export default function RecordsApp({ content }) {
  const store = useMemo(() => createStore(content.storeKey + ':rows'), [content.storeKey]);
  const fields = content.fields;
  const primary = fields.find(f => f.primary) || fields[0];
  const statusField = fields.find(f => f.key === content.statusField);

  const [rows, setRows] = useState(() => store.read());
  const [draft, setDraft] = useState(() => blank(fields));
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('new');
  const [server, setServer] = useState(false);

  // Persist on every change — a reload never loses a row.
  useEffect(() => { store.write(rows); }, [rows, store]);

  // A backend, if this project has one. Silence on failure: the local rows
  // are the truth, and the badge only claims a server that really answered.
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await apiList(content.api);
      if (!alive || !remote) return;
      setServer(true);
      setRows(prev => {
        const seen = new Set(prev.map(r => String(r.id)));
        const extra = remote.filter(r => r && !seen.has(String(r.id)));
        return extra.length ? [...extra.map(r => ({ ...r, id: String(r.id || uid()) })), ...prev] : prev;
      });
    })();
    return () => { alive = false; };
  }, [content.api]);

  const submit = (e) => {
    e.preventDefault();
    const missing = fields.filter(f => f.required && !String(draft[f.key] || '').trim());
    if (missing.length) { setError(${T('املأ الحقول المطلوبة: ', 'Required: ')} + missing.map(f => f.label).join('، ')); return; }
    setError('');
    if (editing) {
      setRows(rows.map(r => (r.id === editing ? { ...r, ...draft } : r)));
      setEditing('');
    } else {
      const row = { ...draft, id: uid(), createdAt: new Date().toISOString() };
      setRows([row, ...rows]);
      apiCreate(content.api, row);
    }
    setDraft(blank(fields));
  };

  const edit = (row) => { setEditing(row.id); setDraft({ ...blank(fields), ...row }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = (row) => { if (window.confirm(${T('حذف هذا السجلّ؟', 'Delete this record?')})) setRows(rows.filter(r => r.id !== row.id)); };
  const toggleDone = (row) => {
    if (!statusField || !content.doneValue) return;
    const next = row[statusField.key] === content.doneValue
      ? (statusField.options || []).find(o => o !== content.doneValue) || ''
      : content.doneValue;
    setRows(rows.map(r => (r.id === row.id ? { ...r, [statusField.key]: next } : r)));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = rows.filter(r => {
      if (filter && String(r[content.statusField] || '') !== filter) return false;
      if (!needle) return true;
      return fields.some(f => String(r[f.key] || '').toLowerCase().includes(needle));
    });
    list = [...list];
    if (sort === 'old') list.reverse();
    else if (sort === 'az') list.sort((a, b) => String(a[primary.key] || '').localeCompare(String(b[primary.key] || '')));
    return list;
  }, [rows, query, filter, sort, fields, primary, content.statusField]);

  return (
    <div className="wrap">
      <section className="stats" aria-label={${T('الأرقام', 'Numbers')}}>
        {content.metrics.map((m, i) => (
          <div className="stat" key={i}>
            <b>{computeMetric(m, rows)}</b>
            <span>{m.label}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>{editing ? ${T('تعديل ', 'Edit ')} + content.entityOne : ${T('إضافة ', 'Add a ')} + content.entityOne}</h2>
        <form className="form" onSubmit={submit}>
          {fields.map(f => (
            <label className={'field' + (f.type === 'textarea' ? ' wide' : '')} key={f.key}>
              <span>{f.label}{f.required ? ' *' : ''}</span>
              {f.type === 'textarea' ? (
                <textarea rows={3} value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
                  value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          {error ? <p className="err" role="alert">{error}</p> : null}
          <div className="actions">
            <button className="btn" type="submit">{editing ? ${T('حفظ التعديل', 'Save changes')} : ${T('أضف', 'Add')}}</button>
            {editing ? <button className="btn ghost" type="button" onClick={() => { setEditing(''); setDraft(blank(fields)); }}>{${T('إلغاء', 'Cancel')}}</button> : null}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar">
          <input className="search" type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={${T('ابحث…', 'Search…')}} aria-label={${T('بحث', 'Search')}} />
          {statusField ? (
            <select value={filter} onChange={e => setFilter(e.target.value)} aria-label={statusField.label}>
              <option value="">{${T('الكل', 'All')}}</option>
              {(statusField.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : null}
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label={${T('الترتيب', 'Sort')}}>
            <option value="new">{${T('الأحدث أولاً', 'Newest first')}}</option>
            <option value="old">{${T('الأقدم أولاً', 'Oldest first')}}</option>
            <option value="az">{${T('أبجدياً', 'A → Z')}}</option>
          </select>
          <button className="btn ghost" type="button" disabled={!rows.length}
            onClick={() => download(content.storeKey + '.csv', toCsv(fields, visible))}>{${T('تصدير CSV', 'Export CSV')}}</button>
          <span className={'badge ' + (server ? 'on' : '')}>
            {server ? ${T('متصل بالخادم', 'Server connected')} : ${T('محلي على هذا الجهاز', 'Local to this device')}}
          </span>
        </div>

        <h2 className="list-title">{content.entityMany} <em>({visible.length})</em></h2>
        {visible.length === 0 ? (
          <p className="empty">{rows.length ? ${T('لا نتائج مطابقة لبحثك.', 'Nothing matches that search.')} : content.emptyHint}</p>
        ) : (
          <ul className="rows">
            {visible.map(row => {
              const done = statusField && content.doneValue && row[statusField.key] === content.doneValue;
              return (
                <li className={'row' + (done ? ' done' : '')} key={row.id}>
                  <div className="row-main">
                    <h3>{row[primary.key] || ${T('(بلا عنوان)', '(untitled)')}}</h3>
                    <dl className="row-meta">
                      {fields.filter(f => f.key !== primary.key && String(row[f.key] || '').trim()).map(f => (
                        <div key={f.key}><dt>{f.label}</dt><dd>{String(row[f.key])}</dd></div>
                      ))}
                    </dl>
                  </div>
                  <div className="row-acts">
                    {statusField && content.doneValue ? (
                      <button className="btn tiny" type="button" onClick={() => toggleDone(row)}>
                        {done ? ${T('تراجع', 'Undo')} : content.doneValue}
                      </button>
                    ) : null}
                    <button className="btn tiny ghost" type="button" onClick={() => edit(row)}>{${T('تعديل', 'Edit')}}</button>
                    <button className="btn tiny danger" type="button" onClick={() => remove(row)}>{${T('حذف', 'Delete')}}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
`;
}

/* ── engine 2: map — a REAL map, the thing the user asked for ───────────── */

export function fileMapAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    const lang = isAr ? 'ar' : 'en';
    // Spoken and written turn instructions — authored, never machine-translated.
    const maneuverTable = isAr
        ? `{ straight: 'واصل مستقيماً', left: 'انعطف يساراً', right: 'انعطف يميناً', 'slight left': 'ابقَ يساراً', 'slight right': 'ابقَ يميناً', 'sharp left': 'انعطف يساراً بحدّة', 'sharp right': 'انعطف يميناً بحدّة', uturn: 'استدر عائداً', roundabout: 'ادخل الدوّار', depart: 'انطلق', arrive: 'وصلت إلى وجهتك', onto: 'إلى' }`
        : `{ straight: 'Continue straight', left: 'Turn left', right: 'Turn right', 'slight left': 'Keep left', 'slight right': 'Keep right', 'sharp left': 'Sharp left', 'sharp right': 'Sharp right', uturn: 'Make a U-turn', roundabout: 'Enter the roundabout', depart: 'Start driving', arrive: 'You have arrived', onto: 'onto' }`;
    return `import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { createStore, uid } from '../app/store.js';

// Bundlers rewrite the icon URLs Leaflet builds by hand — without this the
// markers render as broken images in the production build.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const R = 6371; // km
const distanceKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
};

/** The bearing from one point to the next — the car icon points along it. */
const bearing = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

/** How far the driver is from the planned line, and how far is left along it. */
const alongRoute = (pos, line) => {
  let best = Infinity, at = 0;
  for (let i = 0; i < line.length; i++) {
    const d = distanceKm(pos, { lat: line[i][0], lng: line[i][1] });
    if (d < best) { best = d; at = i; }
  }
  let left = 0;
  for (let i = at; i < line.length - 1; i++) {
    left += distanceKm({ lat: line[i][0], lng: line[i][1] }, { lat: line[i + 1][0], lng: line[i + 1][1] });
  }
  return { offRouteKm: best, index: at, remainingKm: Math.round(left * 10) / 10 };
};

/** OSRM names its maneuvers; a driver needs a sentence. */
const MANEUVER = ${maneuverTable};
const instructionFor = (st) => {
  const m = st.maneuver || {};
  const key = m.type === 'roundabout' || m.type === 'rotary' ? 'roundabout'
    : m.type === 'arrive' ? 'arrive'
      : m.type === 'depart' ? 'depart'
        : (m.modifier || 'straight');
  const road = st.name ? MANEUVER.onto + ' ' + st.name : '';
  return ((MANEUVER[key] || MANEUVER.straight) + ' ' + road).trim();
};

export default function MapApp({ content }) {
  const store = useMemo(() => createStore(content.storeKey + ':places'), [content.storeKey]);
  const holder = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const meMarker = useRef(null);

  const [places, setPlaces] = useState(() => store.read());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(null);   // a click waiting for a name
  const [pendingName, setPendingName] = useState('');
  const [me, setMe] = useState(null);
  const [tileError, setTileError] = useState(false);
  // Directions: two endpoints, a real road route, and the two numbers people
  // actually want — how far, and how long.
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [trip, setTrip] = useState(null);      // { km, minutes, from, to, steps }
  const [routing, setRouting] = useState(false);
  const routeLine = useRef(null);
  const routeEnds = useRef(null);
  // Turn-by-turn: the live drive, not the drawn line.
  const [nav, setNav] = useState(null);        // { stepIndex, metresLeft, secondsLeft, speed, next }
  const [voice, setVoice] = useState(true);
  const geometry = useRef([]);
  const destination = useRef(null);
  const carMarker = useRef(null);
  const watchId = useRef(null);
  const lastFix = useRef(null);
  const spokenAt = useRef(-1);

  useEffect(() => { store.write(places); }, [places, store]);

  // The map itself — created once, torn down cleanly.
  useEffect(() => {
    if (map.current || !holder.current) return;
    const m = L.map(holder.current, { zoomControl: true }).setView([24.7136, 46.6753], 6);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    // A grey square is not an explanation: when the tiles cannot be reached
    // the app SAYS so instead of looking broken.
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('load', () => setTileError(false));
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e) => { setPending({ lat: e.latlng.lat, lng: e.latlng.lng }); setPendingName(''); });
    map.current = m;
    // A map created inside a freshly laid-out panel measures itself wrong.
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);

  // Saved places → markers, rebuilt whenever the list changes.
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    for (const p of places) {
      L.marker([p.lat, p.lng]).addTo(layer.current)
        .bindPopup('<strong>' + String(p.name).replace(/</g, '&lt;') + '</strong>');
    }
  }, [places]);

  const flyTo = (lat, lng, zoom) => { if (map.current) map.current.flyTo([lat, lng], zoom || 14, { duration: 0.8 }); };

  // Place search — Nominatim, the OpenStreetMap gazetteer. No key, no account.
  const search = async (e) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    setBusy(true); setNote(''); setResults([]);
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=${lang}&q=' + encodeURIComponent(term);
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!Array.isArray(data) || !data.length) { setNote(${T('لا نتائج لهذا الاسم.', 'No results for that name.')}); return; }
      setResults(data.map(d => ({ id: String(d.place_id), name: d.display_name, lat: Number(d.lat), lng: Number(d.lon) })));
      flyTo(Number(data[0].lat), Number(data[0].lon), 13);
    } catch {
      setNote(${T('تعذّر البحث — تحقّق من اتصال الإنترنت.', 'Search failed — check your connection.')});
    } finally { setBusy(false); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setNote(${T('متصفحك لا يدعم تحديد الموقع.', 'This browser has no geolocation.')}); return; }
    setBusy(true); setNote('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(here); setBusy(false); flyTo(here.lat, here.lng, 15);
        if (map.current) {
          if (meMarker.current) meMarker.current.remove();
          meMarker.current = L.circleMarker([here.lat, here.lng], { radius: 9, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.6 })
            .addTo(map.current).bindPopup(${T('أنت هنا', 'You are here')});
        }
      },
      () => { setBusy(false); setNote(${T('رُفض إذن الموقع أو تعذّر تحديده.', 'Location permission denied or unavailable.')}); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /** One place name → coordinates, through the same open gazetteer. */
  const geocode = async (term) => {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${lang}&q=' + encodeURIComponent(term);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('geocode');
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) return null;
    return { name: d[0].display_name, lat: Number(d[0].lat), lng: Number(d[0].lon) };
  };

  /**
   * A REAL route on real roads — OSRM's public router, no key and no account.
   * The line is the road geometry, and the two numbers are the ones people
   * asked for: the distance and how long the drive takes.
   */
  const route = async (e) => {
    e.preventDefault();
    setRouting(true); setNote(''); setTrip(null);
    try {
      const a = fromText.trim() ? await geocode(fromText.trim()) : (me ? { ...me, name: ${T('موقعي', 'My location')} } : null);
      if (!a) { setNote(${T('حدّد نقطة البداية، أو اضغط «موقعي» أولاً.', 'Set a starting point, or press "My location" first.')}); return; }
      const b = await geocode(toText.trim());
      if (!b) { setNote(${T('لم أجد الوجهة — جرّب اسماً أوضح.', 'Destination not found — try a clearer name.')}); return; }

      const url = 'https://router.project-osrm.org/route/v1/driving/'
        + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat
        + '?overview=full&geometries=geojson&steps=true&annotations=false';
      const r = await fetch(url);
      const d = await r.json();
      const leg = d && d.routes && d.routes[0];
      if (!leg) { setNote(${T('لا يوجد طريق بري بين النقطتين.', 'No road route between those points.')}); return; }

      const line = leg.geometry.coordinates.map((c) => [c[1], c[0]]);
      if (map.current) {
        if (routeLine.current) routeLine.current.remove();
        if (routeEnds.current) routeEnds.current.remove();
        routeLine.current = L.polyline(line, { color: '#1a73e8', weight: 6, opacity: 0.85 }).addTo(map.current);
        routeEnds.current = L.layerGroup([
          L.marker([a.lat, a.lng]).bindPopup(a.name),
          L.marker([b.lat, b.lng]).bindPopup(b.name),
        ]).addTo(map.current);
        map.current.fitBounds(routeLine.current.getBounds(), { padding: [40, 40] });
      }
      // The maneuvers are what turns a drawn line into NAVIGATION.
      const steps = ((leg.legs && leg.legs[0] && leg.legs[0].steps) || []).map((st) => ({
        lat: st.maneuver.location[1], lng: st.maneuver.location[0],
        text: instructionFor(st), distance: st.distance,
      }));
      geometry.current = line;
      destination.current = b;
      setTrip({
        km: Math.round(leg.distance / 100) / 10,
        minutes: Math.round(leg.duration / 60),
        from: a.name.split(',')[0], to: b.name.split(',')[0],
        steps, metres: leg.distance, seconds: leg.duration,
      });
    } catch {
      setNote(${T('تعذّر حساب المسار — تحقّق من اتصال الإنترنت.', 'Could not compute the route — check your connection.')});
    } finally { setRouting(false); }
  };

  const clearRoute = () => {
    stopNav();
    if (routeLine.current) { routeLine.current.remove(); routeLine.current = null; }
    if (routeEnds.current) { routeEnds.current.remove(); routeEnds.current = null; }
    geometry.current = []; destination.current = null;
    setTrip(null);
  };

  /* ── turn-by-turn navigation ─────────────────────────────────────────────
   * The drive itself: the browser's own GPS watch, a car that points where it
   * is going, the map following it, the next maneuver spoken once, and a new
   * route the moment the driver leaves this one.
   * Honest limit: Leaflet does not rotate its map, so the CAR turns and the
   * map follows — a rotating map needs MapLibre, which this build does not use.
   */
  const speak = (text) => {
    if (!voice || !text) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = '${lang}' === 'ar' ? 'ar-SA' : 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* a browser without speech still shows the card */ }
  };

  const carIcon = (deg) => L.divIcon({
    className: 'car-icon',
    html: '<div style="transform:rotate(' + Math.round(deg) + 'deg)">▲</div>',
    iconSize: [30, 30], iconAnchor: [15, 15],
  });

  const stopNav = () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (carMarker.current) { carMarker.current.remove(); carMarker.current = null; }
    lastFix.current = null; spokenAt.current = -1;
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* optional */ }
    setNav(null);
  };

  /** The route is recomputed from where the driver actually IS. */
  const rerouteFrom = async (here) => {
    if (!destination.current) return;
    try {
      const b = destination.current;
      const url = 'https://router.project-osrm.org/route/v1/driving/'
        + here.lng + ',' + here.lat + ';' + b.lng + ',' + b.lat
        + '?overview=full&geometries=geojson&steps=true';
      const d = await (await fetch(url)).json();
      const leg = d && d.routes && d.routes[0];
      if (!leg) return;
      const line = leg.geometry.coordinates.map((c) => [c[1], c[0]]);
      geometry.current = line;
      if (routeLine.current && map.current) { routeLine.current.remove(); routeLine.current = L.polyline(line, { color: '#1a73e8', weight: 6, opacity: 0.85 }).addTo(map.current); }
      const steps = ((leg.legs && leg.legs[0] && leg.legs[0].steps) || []).map((st) => ({
        lat: st.maneuver.location[1], lng: st.maneuver.location[0], text: instructionFor(st), distance: st.distance,
      }));
      setTrip((t) => (t ? { ...t, steps, metres: leg.distance, seconds: leg.duration, km: Math.round(leg.distance / 100) / 10, minutes: Math.round(leg.duration / 60) } : t));
      spokenAt.current = -1;
      speak(${T('أعدتُ حساب المسار', 'Recalculating')});
    } catch { /* offline: the previous line stands and the card says so */ }
  };

  const startNav = () => {
    if (!trip || !navigator.geolocation) { setNote(${T('الملاحة تحتاج إذن الموقع من المتصفح.', 'Navigation needs the browser location permission.')}); return; }
    setNav({ stepIndex: 0, remainingKm: trip.km, minutesLeft: trip.minutes, speed: 0, next: (trip.steps[0] || {}).text || '', toTurnM: 0, offRoute: false });
    speak((trip.steps[0] || {}).text || '');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // A heading the device reports is better than one we infer; when it is
        // missing — most desktops — it comes from the last two fixes.
        const deg = Number.isFinite(pos.coords.heading) && pos.coords.heading !== null
          ? pos.coords.heading
          : (lastFix.current ? bearing(lastFix.current, here) : 0);
        const kmh = Number.isFinite(pos.coords.speed) && pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0;
        lastFix.current = here;

        if (map.current) {
          if (!carMarker.current) carMarker.current = L.marker([here.lat, here.lng], { icon: carIcon(deg), zIndexOffset: 1000 }).addTo(map.current);
          else { carMarker.current.setLatLng([here.lat, here.lng]); carMarker.current.setIcon(carIcon(deg)); }
          // Faster driving deserves a wider view; the car stays followed.
          map.current.setView([here.lat, here.lng], kmh > 80 ? 15 : kmh > 40 ? 16 : 17, { animate: true, duration: 0.6 });
        }

        const line = geometry.current || [];
        const on = line.length ? alongRoute(here, line) : { offRouteKm: 0, remainingKm: 0 };
        const steps = (trip && trip.steps) || [];
        // The next maneuver is the first one still ahead of the driver.
        let idx = 0, toTurn = 0;
        for (let i = 0; i < steps.length; i++) {
          const d = distanceKm(here, steps[i]);
          if (d > 0.03) { idx = i; toTurn = Math.round(d * 1000); break; }
          idx = Math.min(i + 1, steps.length - 1);
        }
        if (toTurn && toTurn < 180 && spokenAt.current !== idx) { spokenAt.current = idx; speak((steps[idx] || {}).text || ''); }

        const offRoute = on.offRouteKm > 0.06;
        if (offRoute) rerouteFrom(here);

        setNav({
          stepIndex: idx,
          remainingKm: on.remainingKm,
          minutesLeft: Math.max(1, Math.round((on.remainingKm / Math.max(kmh, 30)) * 60)),
          speed: kmh, next: (steps[idx] || {}).text || '', toTurnM: toTurn, offRoute,
        });
      },
      () => setNote(${T('تعذّر تتبّع موقعك — تحقّق من إذن الموقع.', 'Could not follow your location — check the permission.')}),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };

  // A watch left running after the panel closes drains a phone.
  useEffect(() => () => { if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current); }, []);

  const savePlace = (p, name) => {
    const row = { id: uid(), name: String(name || p.name || ${T('مكان', 'Place')}).slice(0, 80), lat: p.lat, lng: p.lng };
    setPlaces([row, ...places.filter(x => !(x.lat === row.lat && x.lng === row.lng))]);
  };

  return (
    <div className="wrap map-wrap">
      <section className="panel map-side">
        <form className="toolbar" onSubmit={search}>
          <input className="search" type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={${T('ابحث عن مدينة أو مكان…', 'Search a city or place…')}} aria-label={${T('بحث عن مكان', 'Search a place')}} />
          <button className="btn" type="submit" disabled={busy}>{busy ? ${T('...', '…')} : ${T('ابحث', 'Search')}}</button>
          <button className="btn ghost" type="button" onClick={locate}>{${T('موقعي', 'My location')}}</button>
        </form>
        {note ? <p className="err" role="status">{note}</p> : null}

        {/* Directions — from, to, a real road route, distance and duration. */}
        <form className="trip" onSubmit={route}>
          <h2 className="list-title">{${T('مسار التنقّل', 'Directions')}}</h2>
          <label className="field">
            <span>{${T('من', 'From')}}</span>
            <input value={fromText} onChange={e => setFromText(e.target.value)}
              placeholder={me ? ${T('اتركه فارغاً لتبدأ من موقعك', 'Leave empty to start from your location')} : ${T('نقطة البداية…', 'Starting point…')} } />
          </label>
          <label className="field">
            <span>{${T('إلى', 'To')}}</span>
            <input value={toText} onChange={e => setToText(e.target.value)} placeholder={${T('الوجهة…', 'Destination…')}} />
          </label>
          <div className="actions">
            <button className="btn" type="submit" disabled={routing || !toText.trim()}>
              {routing ? ${T('أحسب المسار…', 'Routing…')} : ${T('احسب المسار', 'Get directions')}}
            </button>
            {trip ? <button className="btn ghost" type="button" onClick={clearRoute}>{${T('امسح المسار', 'Clear route')}}</button> : null}
          </div>
          {trip ? (
            <div className="trip-result" role="status">
              <p className="trip-ends">{trip.from} ← {trip.to}</p>
              <div className="trip-nums">
                <span><b>{trip.km}</b> ${isAr ? 'كم' : 'km'}</span>
                <span><b>{trip.minutes >= 60 ? Math.floor(trip.minutes / 60) + (${isAr ? "'س '" : "'h '"}) + (trip.minutes % 60) : trip.minutes}</b> ${isAr ? 'دقيقة' : 'min'}</span>
              </div>
              <p className="muted small">{${T('تقدير بالسيارة على الطرق الحقيقية — من OSRM.', 'Driving estimate on real roads — from OSRM.')}}</p>
              <div className="actions">
                {!nav ? (
                  <button className="btn" type="button" onClick={startNav}>{${T('ابدأ الملاحة', 'Start navigation')}}</button>
                ) : (
                  <button className="btn danger" type="button" onClick={stopNav}>{${T('أنهِ الملاحة', 'End navigation')}}</button>
                )}
                <button className="btn ghost" type="button" onClick={() => setVoice(v => !v)}
                  aria-pressed={voice}>{voice ? ${T('🔊 الصوت مفعّل', '🔊 Voice on')} : ${T('🔇 الصوت مطفأ', '🔇 Voice off')}}</button>
              </div>
              {trip.steps && trip.steps.length ? (
                <details className="steps-list">
                  <summary>{${T('خطوات الطريق', 'Turn list')}} ({trip.steps.length})</summary>
                  <ol>
                    {trip.steps.map((s, i) => (
                      <li key={i} className={nav && nav.stepIndex === i ? 'on' : ''}>
                        {s.text} <span className="muted">— {Math.round(s.distance)} ${isAr ? 'م' : 'm'}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : null}
        </form>

        {results.length ? (
          <>
            <h2 className="list-title">{${T('نتائج البحث', 'Search results')}}</h2>
            <ul className="rows compact">
              {results.map(r => (
                <li className="row" key={r.id}>
                  <div className="row-main">
                    <h3>{r.name.split(',')[0]}</h3>
                    <p className="muted">{r.name}</p>
                  </div>
                  <div className="row-acts">
                    <button className="btn tiny ghost" type="button" onClick={() => flyTo(r.lat, r.lng, 14)}>{${T('اعرض', 'Show')}}</button>
                    <button className="btn tiny" type="button" onClick={() => savePlace(r, r.name.split(',')[0])}>{${T('احفظ', 'Save')}}</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {pending ? (
          <form className="pending" onSubmit={(e) => { e.preventDefault(); savePlace(pending, pendingName); setPending(null); }}>
            <p className="muted">{${T('نقطة جديدة على الخريطة', 'A new point on the map')}} — {pending.lat.toFixed(4)}, {pending.lng.toFixed(4)}</p>
            <div className="toolbar">
              <input className="search" value={pendingName} onChange={e => setPendingName(e.target.value)}
                placeholder={${T('سمِّ هذا المكان…', 'Name this place…')}} autoFocus />
              <button className="btn" type="submit">{${T('احفظ', 'Save')}}</button>
              <button className="btn ghost" type="button" onClick={() => setPending(null)}>{${T('إلغاء', 'Cancel')}}</button>
            </div>
          </form>
        ) : null}

        <h2 className="list-title">{content.entityMany} <em>({places.length})</em></h2>
        {places.length === 0 ? <p className="empty">{content.emptyHint}</p> : (
          <ul className="rows compact">
            {places.map(p => (
              <li className="row" key={p.id}>
                <div className="row-main">
                  <h3>{p.name}</h3>
                  <p className="muted">
                    {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    {me ? ' • ' + distanceKm(me, p) + ${T("' كم منك'", "' km away'")} : ''}
                  </p>
                </div>
                <div className="row-acts">
                  <button className="btn tiny ghost" type="button" onClick={() => flyTo(p.lat, p.lng, 15)}>{${T('اذهب', 'Go')}}</button>
                  <button className="btn tiny danger" type="button" onClick={() => setPlaces(places.filter(x => x.id !== p.id))}>{${T('حذف', 'Delete')}}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{${T('انقر على الخريطة لتثبيت علامة جديدة.', 'Click the map to drop a new pin.')}}</p>
      </section>

      <div className="map-col">
        {tileError ? <p className="err tiles" role="status">{${T('تعذّر تحميل بلاطات OpenStreetMap — تحقّق من اتصال الإنترنت. باقي التطبيق يعمل.', 'OpenStreetMap tiles could not load — check your connection. The rest of the app still works.')}}</p> : null}
        {/* The driving card: the next turn, then the numbers that matter. */}
        {nav ? (
          <div className="nav-card" role="status" aria-live="polite">
            <div className="nav-next">
              <strong>{nav.next || ${T('واصل', 'Continue')}}</strong>
              {nav.toTurnM ? <span className="nav-turn-dist">{nav.toTurnM} ${isAr ? 'م' : 'm'}</span> : null}
            </div>
            <div className="nav-nums">
              <span><b>{nav.remainingKm}</b> ${isAr ? 'كم متبقية' : 'km left'}</span>
              <span><b>{nav.minutesLeft}</b> ${isAr ? 'دقيقة' : 'min'}</span>
              <span><b>{nav.speed}</b> ${isAr ? 'كم/س' : 'km/h'}</span>
              <span className="nav-eta">{${T('الوصول', 'ETA')}} {new Date(Date.now() + nav.minutesLeft * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {nav.offRoute ? <p className="nav-off">{${T('خرجتَ عن المسار — أعيد الحساب…', 'Off route — recalculating…')}}</p> : null}
          </div>
        ) : null}
        <section className="map-holder" ref={holder} aria-label={${T('الخريطة', 'Map')}} />
      </div>
    </div>
  );
}
`;
}

/* ── engine 3: chat — rooms, messages, and a server when there is one ───── */

export function fileChatAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createStore, uid, apiList, apiCreate } from '../app/store.js';

const time = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function ChatApp({ content }) {
  const roomStore = useMemo(() => createStore(content.storeKey + ':rooms'), [content.storeKey]);
  const [rooms, setRooms] = useState(() => {
    const saved = roomStore.read();
    return saved.length ? saved : [{ id: 'general', name: ${T('الغرفة العامة', 'General')} }];
  });
  const [active, setActive] = useState(() => (roomStore.read()[0] || { id: 'general' }).id);
  const msgStore = useMemo(() => createStore(content.storeKey + ':msgs:' + active), [content.storeKey, active]);
  const [messages, setMessages] = useState(() => msgStore.read());
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [server, setServer] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem(content.storeKey + ':me') || ''; } catch { return ''; } });
  const [draftName, setDraftName] = useState('');
  const endRef = useRef(null);

  useEffect(() => { roomStore.write(rooms); }, [rooms, roomStore]);
  useEffect(() => { setMessages(msgStore.read()); }, [msgStore]);
  useEffect(() => { msgStore.write(messages); }, [messages, msgStore]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [messages.length]);

  // A real server makes this a conversation BETWEEN people. Without one the
  // app says so plainly instead of pretending to be multi-user.
  useEffect(() => {
    if (!content.api) return;
    let alive = true;
    const pull = async () => {
      const remote = await apiList(content.api);
      if (!alive || !remote) return;
      setServer(true);
      const mine = new Set(messages.map(m => String(m.id)));
      const extra = remote
        .filter(m => m && String(m.room || 'general') === active && !mine.has(String(m.id)))
        .map(m => ({ id: String(m.id || uid()), who: m.who || m.author || '—', text: m.text || m.body || '', at: m.at || m.createdAt || new Date().toISOString() }));
      if (extra.length) setMessages(prev => [...prev, ...extra].sort((a, b) => String(a.at).localeCompare(String(b.at))));
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [content.api, active, messages]);

  const send = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const msg = { id: uid(), room: active, who: name || ${T('أنا', 'Me')}, text: body, at: new Date().toISOString() };
    setMessages([...messages, msg]);
    setText('');
    apiCreate(content.api, msg);
  };

  const addRoom = () => {
    const n = window.prompt(${T('اسم الغرفة الجديدة', 'New room name')});
    if (!n) return;
    const room = { id: uid(), name: n.slice(0, 40) };
    setRooms([...rooms, room]); setActive(room.id);
  };

  if (!name) {
    return (
      <div className="wrap">
        <section className="panel narrow">
          <h2>{${T('من أنت؟', 'Who are you?')}}</h2>
          <p className="muted">{${T('يظهر اسمك بجانب رسائلك — يُحفظ على جهازك فقط.', 'Your name appears beside your messages — stored on this device only.')}}</p>
          <form className="toolbar" onSubmit={(e) => {
            e.preventDefault();
            const n = draftName.trim(); if (!n) return;
            setName(n); try { localStorage.setItem(content.storeKey + ':me', n); } catch { /* private mode */ }
          }}>
            <input className="search" value={draftName} onChange={e => setDraftName(e.target.value)} placeholder={${T('اسمك…', 'Your name…')}} autoFocus />
            <button className="btn" type="submit">{${T('ادخل', 'Enter')}}</button>
          </form>
        </section>
      </div>
    );
  }

  const shown = messages.filter(m => !query.trim() || String(m.text).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="wrap chat-wrap">
      <section className="panel chat-side">
        <div className="toolbar">
          <h2 className="list-title">{${T('الغرف', 'Rooms')}}</h2>
          <button className="btn tiny" type="button" onClick={addRoom}>{${T('غرفة جديدة', 'New room')}}</button>
        </div>
        <ul className="rooms">
          {rooms.map(r => (
            <li key={r.id}>
              <button className={'room' + (r.id === active ? ' on' : '')} type="button" onClick={() => setActive(r.id)}>{r.name}</button>
            </li>
          ))}
        </ul>
        <span className={'badge ' + (server ? 'on' : '')}>
          {server ? ${T('متصل بالخادم — الرسائل مشتركة', 'Server connected — messages are shared')} : ${T('محلي على هذا الجهاز', 'Local to this device')}}
        </span>
      </section>

      <section className="panel chat-main">
        <div className="toolbar">
          <input className="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={${T('ابحث في الرسائل…', 'Search messages…')}} />
          <button className="btn tiny ghost" type="button" disabled={!messages.length}
            onClick={() => { if (window.confirm(${T('مسح رسائل هذه الغرفة؟', 'Clear this room?')})) setMessages([]); }}>{${T('مسح', 'Clear')}}</button>
        </div>
        <div className="stream">
          {shown.length === 0 ? <p className="empty">{content.emptyHint}</p> : shown.map(m => (
            <article className={'bubble' + (m.who === name ? ' mine' : '')} key={m.id}>
              <header><b>{m.who}</b><time>{time(m.at)}</time></header>
              <p>{m.text}</p>
            </article>
          ))}
          <div ref={endRef} />
        </div>
        <form className="composer" onSubmit={send}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={${T('اكتب رسالة…', 'Write a message…')}} aria-label={${T('نص الرسالة', 'Message text')}} />
          <button className="btn" type="submit" disabled={!text.trim()}>{${T('إرسال', 'Send')}}</button>
        </form>
      </section>
    </div>
  );
}
`;
}

/* ── engine 4: weather — live data, no key, no account ──────────────────── */

export function fileWeatherAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    const lang = isAr ? 'ar' : 'en';
    const codes = isAr
        ? `{ 0: 'صحو', 1: 'صحو غالباً', 2: 'غائم جزئياً', 3: 'غائم', 45: 'ضباب', 48: 'ضباب متجمد', 51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف', 61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف', 80: 'زخات', 81: 'زخات قوية', 82: 'زخات عنيفة', 95: 'عاصفة رعدية', 96: 'رعد وبَرَد', 99: 'رعد وبَرَد شديد' }`
        : `{ 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Heavy showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunder & hail', 99: 'Severe thunder & hail' }`;
    return `import React, { useEffect, useMemo, useState } from 'react';
import { createStore, uid } from '../app/store.js';

const CODES = ${codes};
const describe = (c) => CODES[c] || ${T('—', '—')};
const ICONS = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌧️', 61: '🌦️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '🌨️', 75: '❄️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };

export default function WeatherApp({ content }) {
  const store = useMemo(() => createStore(content.storeKey + ':cities'), [content.storeKey]);
  const [cities, setCities] = useState(() => store.read());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [unit, setUnit] = useState(() => { try { return localStorage.getItem(content.storeKey + ':unit') || 'C'; } catch { return 'C'; } });

  useEffect(() => { store.write(cities); }, [cities, store]);
  useEffect(() => { try { localStorage.setItem(content.storeKey + ':unit', unit); } catch { /* private mode */ } }, [unit, content.storeKey]);

  const show = (c) => (unit === 'F' ? Math.round((c * 9) / 5 + 32) : Math.round(c));

  const load = async (p) => {
    setPlace(p); setBusy(true); setNote(''); setData(null);
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng
        + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto';
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setData(await r.json());
    } catch {
      setNote(${T('تعذّر جلب الطقس — تحقّق من اتصال الإنترنت.', 'Could not load the forecast — check your connection.')});
    } finally { setBusy(false); }
  };

  const search = async (e) => {
    e.preventDefault();
    const term = query.trim(); if (!term) return;
    setBusy(true); setNote(''); setHits([]);
    try {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=${lang}&format=json&name=' + encodeURIComponent(term);
      const r = await fetch(url);
      const d = await r.json();
      const list = (d && d.results) || [];
      if (!list.length) { setNote(${T('لا مدينة بهذا الاسم.', 'No city by that name.')}); return; }
      setHits(list.map(x => ({ id: uid(), name: x.name + (x.country ? '، ' + x.country : ''), lat: x.latitude, lng: x.longitude })));
    } catch {
      setNote(${T('تعذّر البحث — تحقّق من اتصال الإنترنت.', 'Search failed — check your connection.')});
    } finally { setBusy(false); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setNote(${T('متصفحك لا يدعم تحديد الموقع.', 'This browser has no geolocation.')}); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ id: 'me', name: ${T('موقعي', 'My location')}, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setNote(${T('رُفض إذن الموقع أو تعذّر تحديده.', 'Location permission denied or unavailable.')}),
      { timeout: 10000 },
    );
  };

  const cur = data && data.current;
  const daily = (data && data.daily) || null;

  return (
    <div className="wrap">
      <section className="panel">
        <form className="toolbar" onSubmit={search}>
          <input className="search" type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={${T('ابحث عن مدينة…', 'Search a city…')}} aria-label={${T('بحث عن مدينة', 'Search a city')}} />
          <button className="btn" type="submit" disabled={busy}>{${T('ابحث', 'Search')}}</button>
          <button className="btn ghost" type="button" onClick={locate}>{${T('موقعي', 'My location')}}</button>
          <button className="btn ghost" type="button" onClick={() => setUnit(unit === 'C' ? 'F' : 'C')}>{unit === 'C' ? '°C' : '°F'}</button>
        </form>
        {note ? <p className="err" role="status">{note}</p> : null}
        {hits.length ? (
          <ul className="rows compact">
            {hits.map(h => (
              <li className="row" key={h.id}>
                <div className="row-main"><h3>{h.name}</h3></div>
                <div className="row-acts">
                  <button className="btn tiny" type="button" onClick={() => { load(h); setHits([]); }}>{${T('اعرض', 'Show')}}</button>
                  <button className="btn tiny ghost" type="button"
                    onClick={() => { setCities([h, ...cities.filter(c => c.name !== h.name)]); setHits([]); }}>{${T('احفظ', 'Save')}}</button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {cur ? (
        <section className="panel now">
          <h2>{place ? place.name : ''}</h2>
          <div className="now-line">
            <span className="now-icon" aria-hidden="true">{ICONS[cur.weather_code] || '🌡️'}</span>
            <b className="now-temp">{show(cur.temperature_2m)}°{unit}</b>
            <span className="now-desc">{describe(cur.weather_code)}</span>
          </div>
          <dl className="row-meta">
            <div><dt>{${T('الرطوبة', 'Humidity')}}</dt><dd>{cur.relative_humidity_2m}%</dd></div>
            <div><dt>{${T('الرياح', 'Wind')}}</dt><dd>{Math.round(cur.wind_speed_10m)} ${isAr ? 'كم/س' : 'km/h'}</dd></div>
          </dl>
        </section>
      ) : null}

      {daily ? (
        <section className="panel">
          <h2 className="list-title">{${T('توقّعات الأيام القادمة', 'The days ahead')}}</h2>
          <ul className="days">
            {daily.time.map((d, i) => (
              <li className="day" key={d}>
                <span className="day-name">{new Date(d).toLocaleDateString('${lang}', { weekday: 'short' })}</span>
                <span className="day-icon" aria-hidden="true">{ICONS[daily.weather_code[i]] || '🌡️'}</span>
                <span className="day-temp"><b>{show(daily.temperature_2m_max[i])}°</b> / {show(daily.temperature_2m_min[i])}°</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2 className="list-title">{content.entityMany} <em>({cities.length})</em></h2>
        {cities.length === 0 ? <p className="empty">{content.emptyHint}</p> : (
          <ul className="rows compact">
            {cities.map(c => (
              <li className="row" key={c.id}>
                <div className="row-main"><h3>{c.name}</h3></div>
                <div className="row-acts">
                  <button className="btn tiny ghost" type="button" onClick={() => load(c)}>{${T('اعرض', 'Show')}}</button>
                  <button className="btn tiny danger" type="button" onClick={() => setCities(cities.filter(x => x.id !== c.id))}>{${T('حذف', 'Delete')}}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{${T('بيانات الطقس من open-meteo.com — مفتوحة ومجانية.', 'Weather data from open-meteo.com — open and free.')}}</p>
      </section>
    </div>
  );
}
`;
}

/* ── the stylesheet — an application's chrome, not a landing page's ─────── */

export function fileAppCss(): string {
    return `/* An application's surface: dense, quiet, and built on Joe's own tokens. */
*,*::before,*::after{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:var(--bg,#fff);color:var(--text,#111);
  font-family:'Cairo','Segoe UI',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0 0 8px;line-height:1.25}
p{margin:0 0 8px}
.app{display:flex;flex-direction:column;min-height:100%}
.app-bar{position:sticky;top:0;z-index:20;background:var(--surface,#fff);border-bottom:1px solid var(--border,#e5e5e5)}
.app-bar-in{max-width:var(--maxw,1180px);margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.app-id{display:flex;align-items:baseline;gap:10px;min-width:0}
.app-name{font-size:1.05rem;font-weight:800;margin:0;color:var(--brand,#111)}
.app-sub{color:var(--text-muted,#666);font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 44px, not 38: the audit measures touch targets and it was right to. */
.icon-btn{border:1px solid var(--border,#ddd);background:var(--surface,#fff);color:inherit;border-radius:999px;
  width:44px;height:44px;font-size:16px;cursor:pointer;line-height:1}
.icon-btn:hover{border-color:var(--brand,#333)}
.app-main{flex:1;width:100%}
.app-foot{max-width:var(--maxw,1180px);margin:0 auto;padding:16px;color:var(--text-muted,#666);font-size:13px;display:flex;gap:8px;flex-wrap:wrap}
.dot{opacity:.5}
.wrap{max-width:var(--maxw,1180px);margin:0 auto;padding:16px;display:grid;gap:16px}

.stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stat{background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:14px 16px}
.stat b{display:block;font-size:1.6rem;line-height:1.2;color:var(--brand,#111)}
.stat span{color:var(--text-muted,#666);font-size:.9rem}

.panel{background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);border-radius:var(--radius-lg,16px);padding:16px}
.panel.narrow{max-width:520px;margin:24px auto}
.panel h2{font-size:1.1rem}
.list-title{display:flex;align-items:baseline;gap:8px;margin:4px 0 12px}
.list-title em{color:var(--text-muted,#666);font-style:normal;font-size:.9rem}

.form{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.field{display:grid;gap:6px;font-size:.9rem}
.field.wide{grid-column:1/-1}
.field>span{color:var(--text-muted,#666)}
input,select,textarea{font:inherit;color:inherit;background:var(--bg,#fff);border:1px solid var(--border,#ddd);
  border-radius:10px;padding:10px 12px;min-height:44px;width:100%}
textarea{min-height:88px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent,#06c);outline-offset:1px}
.actions{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}
.err{grid-column:1/-1;color:#c0392b;margin:0;font-size:.9rem}

.btn{background:var(--brand,#111);color:var(--on-brand,#fff);border:1px solid transparent;border-radius:10px;
  padding:10px 18px;min-height:44px;font:inherit;font-weight:600;cursor:pointer}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.ghost{background:transparent;color:inherit;border-color:var(--border,#ddd)}
.btn.tiny{padding:6px 12px;min-height:36px;font-size:.85rem;font-weight:500}
.btn.danger{background:transparent;color:#c0392b;border-color:currentColor}

.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.toolbar .search{flex:1 1 200px;width:auto}
.badge{margin-inline-start:auto;font-size:.8rem;color:var(--text-muted,#666);border:1px dashed var(--border,#ddd);border-radius:999px;padding:4px 12px}
.badge.on{color:#1e8e3e;border-style:solid;border-color:currentColor}

.rows{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;
  border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:12px 14px;background:var(--bg,#fff)}
.row.done{opacity:.62}
.row.done h3{text-decoration:line-through}
.row-main{min-width:0;flex:1 1 260px}
.row-main h3{font-size:1rem;margin:0 0 4px}
.row-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0}
.row-meta div{display:flex;gap:6px;font-size:.85rem}
.row-meta dt{color:var(--text-muted,#666)}
.row-meta dd{margin:0}
.row-acts{display:flex;gap:6px;flex-wrap:wrap}
.rows.compact .row{padding:10px 12px}
.muted{color:var(--text-muted,#666)}
.small{font-size:.82rem}
.empty{color:var(--text-muted,#666);background:var(--tint,#f6f6f6);border-radius:var(--radius,12px);padding:18px;text-align:center;margin:0}

/* the map */
.map-wrap{grid-template-columns:1fr}
@media(min-width:900px){.map-wrap{grid-template-columns:360px 1fr;align-items:start}}
.map-col{display:grid;gap:8px;min-width:0}
.err.tiles{background:var(--tint,#f6f6f6);border-radius:10px;padding:8px 12px;color:var(--text-muted,#666)}
.map-holder{min-height:420px;height:calc(100vh - 190px);border:1px solid var(--border,#e5e5e5);border-radius:var(--radius-lg,16px);overflow:hidden;z-index:0}
.map-side{max-height:calc(100vh - 190px);overflow:auto}
.pending{border:1px dashed var(--accent,#06c);border-radius:var(--radius,12px);padding:10px 12px;margin-bottom:12px}
.trip{display:grid;gap:10px;border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:12px;margin-bottom:14px}
.trip .list-title{margin:0}
.trip-result{border-top:1px solid var(--border,#e5e5e5);padding-top:10px}
.trip-ends{margin:0 0 6px;font-weight:600}
.trip-nums{display:flex;gap:18px;flex-wrap:wrap}
.trip-nums b{font-size:1.5rem;color:var(--brand,#111);line-height:1}
.trip-nums span{display:flex;align-items:baseline;gap:6px;color:var(--text-muted,#666)}
.steps-list{margin-top:10px;font-size:.9rem}
.steps-list summary{cursor:pointer;color:var(--text-muted,#666)}
.steps-list ol{margin:8px 0 0;padding-inline-start:20px;display:grid;gap:6px;max-height:220px;overflow:auto}
.steps-list li.on{font-weight:700;color:var(--brand,#111)}
/* the drive */
.nav-card{background:var(--brand,#1a73e8);color:var(--on-brand,#fff);border-radius:var(--radius-lg,16px);padding:14px 16px;display:grid;gap:10px}
.nav-next{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.nav-next strong{font-size:1.25rem;line-height:1.3}
.nav-turn-dist{font-size:1.1rem;font-weight:700;opacity:.9}
.nav-nums{display:flex;gap:16px;flex-wrap:wrap;font-size:.9rem;opacity:.95}
.nav-nums b{font-size:1.25rem}
.nav-eta{margin-inline-start:auto}
.nav-off{margin:0;font-weight:700}
.car-icon div{font-size:24px;line-height:1;color:#1a73e8;text-shadow:0 0 3px #fff,0 0 6px #fff;transition:transform .4s ease}
.leaflet-container{font:inherit}

/* the chat */
.chat-wrap{grid-template-columns:1fr}
@media(min-width:900px){.chat-wrap{grid-template-columns:260px 1fr;align-items:start}}
.rooms{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:6px}
.room{width:100%;text-align:start;background:transparent;border:1px solid var(--border,#ddd);border-radius:10px;
  padding:10px 12px;min-height:42px;font:inherit;color:inherit;cursor:pointer}
.room.on{background:var(--tint,#f0f0f0);border-color:var(--brand,#333);font-weight:600}
.chat-main{display:flex;flex-direction:column;min-height:60vh}
.stream{flex:1;display:flex;flex-direction:column;gap:8px;overflow:auto;max-height:56vh;padding:4px}
.bubble{background:var(--tint,#f4f4f4);border-radius:14px;padding:8px 12px;max-width:min(80%,560px)}
.bubble.mine{margin-inline-start:auto;background:var(--brand,#111);color:var(--on-brand,#fff)}
.bubble header{display:flex;gap:10px;align-items:baseline;font-size:.78rem;opacity:.8}
.bubble p{margin:2px 0 0;white-space:pre-wrap;word-break:break-word}
.composer{display:flex;gap:8px;margin-top:12px}
.composer input{flex:1}

/* the weather */
.now-line{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.now-icon{font-size:2.4rem}
.now-temp{font-size:2.6rem;line-height:1;color:var(--brand,#111)}
.now-desc{color:var(--text-muted,#666)}
.days{list-style:none;margin:0;padding:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.day{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid var(--border,#e5e5e5);
  border-radius:var(--radius,12px);padding:10px}
.day-icon{font-size:1.5rem}
.day-temp{font-size:.9rem;color:var(--text-muted,#666)}
.day-temp b{color:var(--text,#111)}
`;
}

/* ── package.json — the engine's real dependencies ──────────────────────── */

export function fileAppPackageJson(name: string, bp: AppBlueprint): string {
    return JSON.stringify({
        name, private: true, version: '0.1.0', type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', ...bp.deps },
        devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^5.4.11' },
    }, null, 2);
}

/**
 * EVERY file of a working application. The caller adds the palette tokens and
 * the vite config it already owns; everything here is the program.
 */
export function buildAppFiles(bp: AppBlueprint, o: AppBuildOptions, slugName: string): Record<string, string> {
    const engineFile: Record<AppBlueprint['engine'], [string, string]> = {
        map: ['src/components/MapApp.jsx', fileMapAppJsx(o.isArabic)],
        chat: ['src/components/ChatApp.jsx', fileChatAppJsx(o.isArabic)],
        weather: ['src/components/WeatherApp.jsx', fileWeatherAppJsx(o.isArabic)],
        records: ['src/components/RecordsApp.jsx', fileRecordsAppJsx(o.isArabic)],
    };
    const [enginePath, engineSrc] = engineFile[bp.engine];
    return {
        'package.json': fileAppPackageJson(slugName, bp),
        'index.html': fileAppIndexHtml(bp, o),
        '.gitignore': 'node_modules\ndist\n',
        'src/main.jsx': fileAppMainJsx(),
        'src/App.jsx': fileAppShellJsx(bp, o.isArabic),
        'src/content.js': fileAppContentJs(bp, o),
        'src/app/store.js': fileAppStoreJs(),
        [enginePath]: engineSrc,
        'src/styles/app.css': fileAppCss(),
    };
}
