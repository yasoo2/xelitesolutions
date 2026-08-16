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
import { ROLES } from '../../../core/design/roles';

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
    /**
     * THE REST OF THE SYSTEM'S TABLES, AS SCREENS.
     *
     * The backend learned to carry vendors, customers, coupons and shipments;
     * without this they were reachable only by `curl`, which is not a system
     * anyone can run. Empty for a build with one collection — and then not a
     * single line of the admin screen is generated.
     */
    model?: Array<{ key: string; ar: string; en: string; fields: any[]; belongsTo?: { entity: string; key: string } | null }>;
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
  // The parent this app's rows belong to — «طبيب ← مواعيده». Null for a
  // one-table app, and then the picker below simply never renders.
  relation: ${bp.relation ? `{
    resource: '${q(bp.relation.resource)}',
    one: '${q(bp.relation.one)}',
    many: '${q(bp.relation.many)}',
    key: '${q(bp.relation.key)}',
    labelKey: '${q(bp.relation.labelKey)}',
    emptyHint: '${q(bp.relation.emptyHint)}',
    fields: [
${bp.relation.fields.map(f => `      { key: '${q(f.key)}', label: '${q(f.label)}', type: '${q(f.type)}'${f.options ? `, options: [${f.options.map(x => `'${q(x)}'`).join(', ')}]` : ''}${f.required ? ', required: true' : ''}${f.primary ? ', primary: true' : ''} },`).join('\n')}
    ],
  }` : 'null'},
};
`;
}

/* ── the shell ───────────────────────────────────────────────────────────── */

const ENGINE_COMPONENT: Record<AppBlueprint['engine'], string> = {
    map: 'MapApp', chat: 'ChatApp', weather: 'WeatherApp', records: 'RecordsApp', social: 'SocialApp',
    shop: 'ShopApp',
};

export function fileAppShellJsx(bp: AppBlueprint, isAr: boolean, hasTables = false, hasApi = false): string {
    const C = ENGINE_COMPONENT[bp.engine];
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    const roleLabels = ROLES.map(r => `  ${r.key}: '${q(isAr ? r.ar : r.en)}',`).join('\n');
    return `import React, { useEffect, useState } from 'react';
import ${C} from './components/${C}.jsx';
${hasTables ? "import TablesAdmin from './components/TablesAdmin.jsx';\n" : ''}${hasApi ? "import Accounts from './components/Accounts.jsx';\n" : ''}import { content } from './content.js';
import { apiLogin, apiLogout, apiMe, getToken } from './app/store.js';

/** What each role is CALLED, so the chip says «موظّف» and not «staff». */
const ROLE_LABEL = {
${roleLabels}
};

/**
 * SIGNING IN TO YOUR OWN SYSTEM.
 *
 * The server protects every write — it must, or a stranger could write to your
 * database. The app sent no token, so «add» answered 401 and the row lived in
 * this browser only: it looked saved and was not. This is the missing half.
 *
 * It appears only when there IS a server to sign in to, and it never blocks
 * the app: signed out, everything still works locally and says so.
 */
function SignIn({ api }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { let alive = true; apiMe(api).then(u => { if (alive) setUser(u); }); return () => { alive = false; }; }, [api]);

  if (!api) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await apiLogin(api, email.trim(), password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error === 'no_server'
        ? ${T('لا يمكن الوصول إلى الخادم.', 'The server cannot be reached.')}
        : ${T('البريد أو كلمة المرور غير صحيحة.', 'Wrong email or password.')});
      return;
    }
    setUser(r.user); setOpen(false); setPassword('');
  };

  if (user) {
    return (
      <div className="auth-chip">
        <span className="auth-dot" aria-hidden="true" />
        <span className="auth-who">{user.email}</span>
        {/* A system a team uses must say WHICH member is looking. */}
        <span className="auth-role">{ROLE_LABEL[user.role] || user.role}</span>
        <button type="button" onClick={() => { apiLogout(); setUser(null); }}>
          {${T('خروج', 'Sign out')}}
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="auth-open" onClick={() => setOpen(true)}>
        {${T('تسجيل الدخول', 'Sign in')}}
      </button>
      {open ? (
        <div className="auth-back" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="auth-card" onSubmit={submit}>
            <b>{${T('تسجيل الدخول', 'Sign in')}}</b>
            <p className="auth-note">
              {${T('حساب المالك ظهر مرة واحدة عند بناء النظام، وحسابات الفريق يصنعها المالك من شاشة «الحسابات والصلاحيات». بدون تسجيل الدخول يعمل التطبيق محلياً فقط ولا يُحفظ على الخادم.', 'The owner account was shown once when the system was built; team accounts are created by the owner from «Accounts and permissions». Signed out, the app works locally only and nothing is saved on the server.')}}
            </p>
            <label><span>{${T('البريد', 'Email')}}</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label><span>{${T('كلمة المرور', 'Password')}}</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <div className="auth-actions">
              <button type="button" onClick={() => setOpen(false)}>{${T('إلغاء', 'Cancel')}}</button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? ${T('جارٍ…', 'Signing in…')} : ${T('دخول', 'Sign in')}}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

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
          <SignIn api={content.api} />
          <button className="icon-btn" onClick={() => setDark(v => !v)}
            aria-label={${isAr ? "'تبديل الوضع الليلي'" : "'Toggle dark mode'"}} title={${isAr ? "'تبديل الوضع'" : "'Toggle theme'"}}>
            {dark ? '☀︎' : '☾'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <${C} content={content} />
${hasTables ? '        <TablesAdmin api={content.api} />\n' : ''}${hasApi ? '        <Accounts api={content.api} />\n' : ''}      </main>
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

/**
 * A PICTURE FOR EVERY ROW — «مع صور نباتات».
 *
 * Two halves, and neither needs a server, an upload endpoint or an account:
 *
 *   pickImage  — the file the owner chose, drawn into a canvas at most 480px
 *                on its long edge and re-encoded as JPEG. A 4MB phone photo
 *                becomes ~40KB, which fits in a database row and in a page.
 *   cardFor    — and when there is no picture, a DESIGNED one: the first
 *                letter of the row's own name on a gradient derived from that
 *                name. Instant, offline, and never the wrong picture — which
 *                a search result can easily be.
 */
export function pickImage(file, maxEdge) {
  return new Promise(function (resolve) {
    // indexOf, not a regex: a backslash inside the template literal that
    // GENERATES this file is eaten by the literal itself, so a pattern anchored
    // on the MIME prefix silently lost its escape and stopped parsing. Plain
    // string work cannot lose anything.
    if (!file || String(file.type || '').indexOf('image/') !== 0) { resolve(''); return; }
    var reader = new FileReader();
    reader.onerror = function () { resolve(''); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { resolve(''); };
      img.onload = function () {
        var edge = maxEdge || 480;
        var scale = Math.min(1, edge / Math.max(img.width || 1, img.height || 1));
        var w = Math.max(1, Math.round((img.width || 1) * scale));
        var h = Math.max(1, Math.round((img.height || 1) * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        if (!ctx) { resolve(''); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL('image/jpeg', 0.72)); } catch (e) { resolve(''); }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/** A stable hue from the row's own name — the same plant is always the same colour. */
function hueOf(text) {
  var h = 0;
  var s = String(text || '');
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 360; }
  return h;
}

/** The designed card: the row's first letter on its own gradient. */
export function cardFor(name, brandHue) {
  var raw = String(name || '').trim();
  var label = raw.charAt(0) || '\u2022';
  // An empty draft is not a red plant: with no name yet there is no colour to
  // derive, so the card is a quiet slate that fills in as the name is typed.
  var empty = !raw;
  var h = typeof brandHue === 'number' ? (brandHue + hueOf(name) % 40) % 360 : hueOf(name);
  var sat = empty ? '10%' : '62%';
  var sat2 = empty ? '8%' : '58%';
  if (empty) h = 214;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="hsl(' + h + ',' + sat + ',' + (empty ? '76%' : '52%') + ')"/>'
    + '<stop offset="1" stop-color="hsl(' + ((h + 34) % 360) + ',' + sat2 + ',' + (empty ? '62%' : '34%') + ')"/>'
    + '</linearGradient></defs>'
    + '<rect width="320" height="240" fill="url(#g)"/>'
    + '<circle cx="270" cy="34" r="76" fill="rgba(255,255,255,.10)"/>'
    + '<circle cx="34" cy="214" r="58" fill="rgba(0,0,0,.10)"/>'
    + '<text x="160" y="150" text-anchor="middle" font-family="system-ui,sans-serif"'
    + ' font-size="110" font-weight="800" fill="rgba(255,255,255,.92)">'
    + label.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** What a row should SHOW: its own picture, or the card designed for its name. */
export function imageOf(row, key, nameKey, brandHue) {
  var src = String((row || {})[key] || '').trim();
  if (src) return src;
  return cardFor((row || {})[nameKey], brandHue);
}

export function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * THE APP HAD NO WAY TO SIGN IN TO ITS OWN SERVER.
 *
 * The generated backend protects every write with requireAuth — correctly, or
 * any stranger could write to your database. The generated FRONTEND sent no
 * token at all, so every «add» hit 401, apiCreate swallowed it, and the row
 * lived in the browser only. A reload on another machine showed nothing. It
 * looked saved. It was not — the exact failure this project keeps refusing.
 *
 * The token is kept per app, so two Joe-built systems on the same machine do
 * not borrow each other's session.
 */
const TOKEN_KEY = 'joe:auth:' + (typeof location !== 'undefined' ? location.pathname : '');

/**
 * AND WHICH ROLE THAT TOKEN CARRIES.
 *
 * A system a team uses has three kinds of person in it, and the screen must
 * know which one is looking: an accountant who cannot write should not be
 * shown an «add» button that will only ever answer 403. The role is kept
 * beside the token and refreshed from the server on every mount, so a demotion
 * reaches the screen without a sign-out.
 */
const ROLE_KEY = TOKEN_KEY + ':role';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function getRole() {
  try { return getToken() ? (localStorage.getItem(ROLE_KEY) || '') : ''; } catch { return ''; }
}
/** May the person at this screen change anything on the server? */
export function canWriteNow() { const r = getRole(); return !!getToken() && r !== 'viewer'; }
/** Is this the owner — the only one with an accounts screen? */
export function isOwnerNow() { return !!getToken() && getRole() === 'owner'; }

function setToken(t, role) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
    if (t && role) localStorage.setItem(ROLE_KEY, String(role)); else localStorage.removeItem(ROLE_KEY);
  } catch { /* private mode */ }
  /**
   * AND THE REST OF THE PAGE HEARS IT.
   *
   * Measured in a real browser: after a successful sign-in the admin screens
   * still showed «sign in as the owner to add anything» — writing worked, and
   * the page said it would not. A token read once at mount is a token that
   * never changes.
   */
  try { window.dispatchEvent(new CustomEvent('joe:auth', { detail: { signedIn: !!t, role: t ? String(role || '') : '' } })); } catch { /* no window */ }
}
const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
};

/** The server's own login. Returns { ok, error } — never throws at the UI. */
export async function apiLogin(api, email, password) {
  const url = apiSibling(await resolvedApi(api), 'auth/login');
  if (!url) return { ok: false, error: 'no_server' };
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) return { ok: false, error: d.error || 'bad_credentials' };
    setToken(d.token, d.user && d.user.role);
    return { ok: true, user: d.user };
  } catch { return { ok: false, error: 'no_server' }; }
}

export function apiLogout() { setToken('', ''); }

/** Is the token still good? A server restart invalidates nothing else visibly. */
export async function apiMe(api) {
  const url = apiSibling(await resolvedApi(api), 'auth/me');
  if (!url || !getToken()) return null;
  try {
    const r = await fetch(url, { headers: { ...authHeaders() } });
    if (!r.ok) { if (r.status === 401) setToken('', ''); return null; }
    const d = await r.json().catch(() => null);
    // The role is re-read HERE, not remembered: an owner who demoted somebody
    // an hour ago must see that person's screen change on their next visit.
    if (d && d.user && d.user.role !== getRole()) setToken(getToken(), d.user.role);
    return d && d.user ? d.user : null;
  } catch { return null; }
}

/**
 * WHY THE SERVER SAID NO.
 *
 * Three refusals mean three different things and one of them is not an error
 * at all: «sign in», «you may not write», «that row is not yours». A screen
 * that shows the same sentence for all three teaches the wrong lesson.
 */
export function refusalOf(res) {
  if (!res || res.ok) return '';
  if (res.status === 401 || res.needsAuth) return 'auth';
  if (res.error === 'read_only') return 'read_only';
  if (res.error === 'not_your_row') return 'not_your_row';
  if (res.status === 403) return 'forbidden';
  return '';
}

// ── THE TEAM — the owner's own accounts screen ───────────────────────────────
export async function apiUsers(api) {
  const url = apiSibling(await resolvedApi(api), 'auth/users');
  if (!url || !getToken()) return null;
  try {
    const r = await fetch(url, { headers: { ...authHeaders() } });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && Array.isArray(d.users) ? d.users : null;
  } catch { return null; }
}

export async function apiAddUser(api, email, role) {
  const url = apiSibling(await resolvedApi(api), 'auth/users');
  if (!url) return { ok: false, error: 'no_server' };
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email, role }),
    });
    const d = await r.json().catch(() => ({}));
    // The generated password comes back exactly once, and this is the once.
    return r.ok ? { ok: true, user: d.user, password: d.password || '' } : { ok: false, error: d.error || 'failed' };
  } catch { return { ok: false, error: 'no_server' }; }
}

export async function apiSetRole(api, id, role) {
  const url = apiSibling(await resolvedApi(api), 'auth/users');
  if (!url) return { ok: false, error: 'no_server' };
  try {
    const r = await fetch(url + '/' + encodeURIComponent(id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, user: d.user } : { ok: false, error: d.error || 'failed' };
  } catch { return { ok: false, error: 'no_server' }; }
}

export async function apiRemoveUser(api, id) {
  const url = apiSibling(await resolvedApi(api), 'auth/users');
  if (!url) return { ok: false, error: 'no_server' };
  try {
    const r = await fetch(url + '/' + encodeURIComponent(id), { method: 'DELETE', headers: { ...authHeaders() } });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: d.error || 'failed' };
  } catch { return { ok: false, error: 'no_server' }; }
}

/**
 * WHERE THE API REALLY IS — «حتى يتم نقله الى دومين والعمل مباشره».
 *
 * The build baked an absolute http://localhost:4100/... into the bundle. On a
 * developer's machine that is right; on a domain it is a dead address, so the
 * whole system stopped working the moment it was deployed — the one thing the
 * user asked for by name.
 *
 * The answer is not a guess about hostnames (a packaged single-process build
 * runs on localhost too). It is a question, asked once: does THIS origin serve
 * the API? If /api/health answers here, everything is relative and the system
 * works on any domain, port or path. If it does not, the dev address stands.
 */
let apiBaseOnce = null;
async function resolvedApi(api) {
  if (!api) return '';
  if (!apiBaseOnce) {
    apiBaseOnce = (async () => {
      const tail = String(api).split('/api/')[1];
      if (!tail || typeof fetch !== 'function' || typeof location === 'undefined') return api;
      const resource = String(tail).split('/')[0].split('?')[0];
      try {
        const r = await fetch('/api/health', { headers: { Accept: 'application/json' } });
        /**
         * «DOES THIS ORIGIN ANSWER /api/health» WAS TOO GENEROUS A QUESTION.
         *
         * Measured in the field: the built store, opened inside Joe's own
         * preview, asked it — and Joe answered, because Joe has a health
         * endpoint too. The app rewired itself to Joe's API and every load
         * produced «GET /api/products 404» twice. An empty catalogue, and a
         * self-QA that scored the build 62/100 for failed requests.
         *
         * The right question names the system: this origin must claim OUR
         * resource. Anything else is a different server that merely shares a
         * common path.
         */
        const d = r.ok ? await r.json().catch(() => null) : null;
        // The primary collection names itself in "resource"; every other table
        // of this system is listed in "tables". Without the second half, an app
        // built to manage «plants» never recognised its own server and kept the
        // dev address — dead the moment the system moved to a domain.
        const mine = !!d && (d.resource === resource
          || (d.tables && Object.prototype.hasOwnProperty.call(d.tables, resource)));
        if (mine) return '/api/' + tail;
      } catch { /* not served here — the dev address stands */ }
      return api;
    })();
  }
  const base = await apiBaseOnce;
  // Same origin: rebuild whatever was asked for — the resource or a sibling
  // like «/api/orders» — against the relative base. Written with plain string
  // work on purpose: an escaped regex inside a generated file is one backslash
  // away from an unparseable bundle, and that is exactly how this shipped
  // broken the first time.
  if (String(base).charAt(0) === '/') return '/api/' + String(api).split('/api/')[1];
  return api;
}

/** The collection's own name, taken from the address it lives at. */
function resourceOf(api) {
  const tail = String(api || '').split('/api/')[1] || '';
  return tail.split('/')[0].split('?')[0];
}

/**
 * THE APP COULD NOT READ ITS OWN SERVER.
 *
 * The generated API answers with the collection's NAME — «{ ok, products }»,
 * «{ ok, bookings }» — and this reader knew four fixed keys: items, data,
 * posts, rows. So «products» matched nothing, the reader returned null, and
 * every store, every booking system, every CRM Joe has ever built quietly
 * stayed «local to this device» with a working database sitting right there.
 * The badge said local, the catalogue was empty, and nothing anywhere was in
 * error. Measured live: a real server holding a real product, and a screen
 * showing «No products yet».
 *
 * The address already carries the answer: /api/products means the key is
 * «products». It is read from there first, and the fixed names remain as
 * fallbacks for the shapes that really do use them.
 */
export async function apiList(api) {
  if (!api) return null;
  try {
    // The token goes WITH the read: an employee's list is his own rows, and
    // the server can only scope it if it knows who is asking. A visitor sends
    // nothing and still gets the whole shelf, which is the shop.
    const r = await fetch(await resolvedApi(api), { headers: { Accept: 'application/json', ...authHeaders() } });
    if (!r.ok) return null;
    const d = await r.json();
    const named = resourceOf(api);
    const rows = Array.isArray(d) ? d
      : (named && Array.isArray(d && d[named])) ? d[named]
        : Array.isArray(d && d.items) ? d.items
          : Array.isArray(d && d.data) ? d.data
            : Array.isArray(d && d.posts) ? d.posts
              : Array.isArray(d && d.rows) ? d.rows : null;
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

export async function apiCreate(api, row) {
  if (!api) return null;
  try {
    const r = await fetch(await resolvedApi(api), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(row),
    });
    // 401 is not «no server» — it is «you are not signed in», and the
    // difference is the whole reason a row silently failed to save. 403 is a
    // third answer again: signed in, and not allowed.
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return { ok: false, status: r.status, needsAuth: r.status === 401, error: (e && e.error) || '' };
    }
    const d = await r.json().catch(() => ({}));
    // The catalogue route answers an "item", a generated table a "row".
    // Knowing only one of them meant the server's real id was never adopted,
    // so the next edit or delete went to /api/plants/<local-uid> and 404'd.
    return { ok: true, item: d.item || d.row || row };
  } catch { return null; }
}

/**
 * A sub-resource of the same API — «/12/like», «/12/comments». Anything that
 * belongs to one row rather than to the collection.
 */
export async function apiPost(api, suffix, body) {
  if (!api) return null;
  try {
    const r = await fetch(String(await resolvedApi(api)).replace(/\\/+$/, '') + suffix, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => ({ ok: true }));
  } catch { return null; }
}

/** A SIBLING collection on the same server: /api/posts → /api/follows. */
export function apiSibling(api, name) {
  if (!api) return null;
  return String(api).replace(/\\/+$/, '').replace(/\\/[^/]+$/, '/' + name);
}

/**
 * …AND THE SIBLING OF THE ADDRESS THAT REALLY ANSWERS.
 *
 * Measured in his own social build:
 *
 *   2 console error(s): net::ERR_CONNECTION_REFUSED
 *     ← http://localhost:4100/api/follows?follower=%40joeqa
 *
 * \`apiSibling\` alone takes a sibling of the address BAKED AT BUILD TIME. The
 * system was running on another port — and on a domain it would be running on
 * a domain — so «follow» reached a machine that was not there. Worse, the
 * origin probe cannot rescue it afterwards: it asks «do you serve /api/
 * follows?» and this server's health answers «I serve posts», so the dev
 * address stood.
 *
 * The origin is resolved from the app's OWN primary resource — the question
 * that CAN be answered — and the sibling is taken from that. One line, and
 * every collection on the server becomes reachable wherever it is deployed.
 */
export async function apiSiblingLive(api, name) {
  return apiSibling(await resolvedApi(api), name);
}

/**
 * THE PARENT COLLECTION, ON WHATEVER ORIGIN THIS BUILD IS RUNNING ON.
 *
 * apiSibling alone rewrites the DEV address, which is dead the moment the
 * system is on a domain. These two go through the same one-question probe the
 * main resource does, so «الأطباء» loads on localhost and on the real host
 * with no second address baked into the bundle.
 */
export async function apiListOn(api, name) {
  const url = apiSibling(await resolvedApi(api), name);
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders() } });
    if (!r.ok) return null;
    const d = await r.json();
    const rows = Array.isArray(d) ? d
      : Array.isArray(d && d[name]) ? d[name]
        : Array.isArray(d && d.items) ? d.items
          : Array.isArray(d && d.rows) ? d.rows : null;
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

export async function apiCreateOn(api, name, row) {
  const url = apiSibling(await resolvedApi(api), name);
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(row),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, needsAuth: r.status === 401, error: d.error || '' };
    return { ok: true, item: d.item || row };
  } catch { return null; }
}

export async function apiUpdateOn(api, name, id, patch) {
  const base = apiSibling(await resolvedApi(api), name);
  if (!base) return { ok: false, error: 'no_server' };
  try {
    const r = await fetch(base + '/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(patch || {}),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, row: d.row } : { ok: false, error: d.error || 'save_failed' };
  } catch { return { ok: false, error: 'no_server' }; }
}

export async function apiDeleteOn(api, name, id) {
  const url = apiSibling(await resolvedApi(api), name);
  if (!url || id === undefined || id === null || id === '') return null;
  try {
    const r = await fetch(trimSlash(url) + '/' + encodeURIComponent(id), { method: 'DELETE', headers: { ...authHeaders() } });
    const d = await r.json().catch(() => ({}));
    // 409 is the server refusing to orphan rows — the UI must SAY that, not
    // pretend the delete happened.
    if (!r.ok) return { ok: false, status: r.status, needsAuth: r.status === 401, error: d.error || '', count: d.count || 0 };
    return { ok: true };
  } catch { return null; }
}

export async function apiGet(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/**
 * Trailing slashes, without a regex on purpose: an escaped pattern inside a
 * GENERATED file is one backslash away from an unparseable bundle, and that is
 * exactly how this shipped broken once already.
 */
function trimSlash(s) {
  let x = String(s || '');
  while (x.charAt(x.length - 1) === '/') x = x.slice(0, -1);
  return x;
}

/**
 * EDITING A ROW MUST REACH THE SERVER TOO.
 *
 * «حفظ التعديل» rewrote the row in this browser and nowhere else: the change
 * looked saved, survived a reload (localStorage), and was gone the moment the
 * app was opened anywhere else. Same failure as the silent 401 on create, one
 * button along.
 */
export async function apiUpdate(api, id, patch) {
  if (!api || id === undefined || id === null || id === '') return null;
  try {
    const r = await fetch(trimSlash(await resolvedApi(api)) + '/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(patch || {}),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return { ok: false, status: r.status, needsAuth: r.status === 401, error: (e && e.error) || '' };
    }
    const d = await r.json().catch(() => ({}));
    return { ok: true, item: d.item || d.row || null };
  } catch { return null; }
}

/**
 * Delete on the server too. Without this a row deleted in the browser came
 * BACK on the next poll — the list was local, the truth was remote, and the
 * user watched his deletion undo itself.
 */
export async function apiDelete(api, id) {
  if (!api || id === undefined || id === null) return null;
  try {
    const r = await fetch(String(await resolvedApi(api)).replace(/\\/+$/, '') + '/' + encodeURIComponent(id), {
      method: 'DELETE', headers: { ...authHeaders() },
    });
    if (!r.ok) return null;
    return await r.json().catch(() => ({ ok: true }));
  } catch { return null; }
}
`;
}

/* ── engine 1: records — create, edit, delete, search, filter, totals ────── */

export function fileRecordsAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useEffect, useMemo, useState } from 'react';
import { createStore, uid, todayISO, computeMetric, toCsv, download, apiList, apiCreate, apiUpdate, apiDelete, apiListOn, apiCreateOn, apiDeleteOn, refusalOf, pickImage, cardFor, imageOf } from '../app/store.js';

const blank = (fields) => {
  const d = {};
  for (const f of fields) d[f.key] = f.type === 'date' ? todayISO() : f.type === 'select' ? (f.options && f.options[0]) || '' : '';
  return d;
};

/**
 * WHY THE SERVER REFUSED — in the words of the person it refused.
 *
 * There are three refusals now, not one. «Sign in» is right for a stranger and
 * wrong for the accountant who IS signed in and may not write, and wronger
 * still for the employee reaching for a colleague's row. A single sentence for
 * all three sends the reader to fix the wrong thing.
 */
function whyLocal(sent) {
  const code = refusalOf(sent);
  if (code === 'read_only') return ${T('لم يُحفظ على الخادم — حسابك للاطّلاع فقط.', 'Not saved on the server — your account is read-only.')};
  if (code === 'not_your_row') return ${T('لم يُحفظ — هذا الصف ليس لك.', 'Not saved — that row is not yours.')};
  if (code === 'auth' || code === 'forbidden') return ${T('حُفظ محلياً فقط — سجّل الدخول لحفظه على الخادم.', 'Saved locally only — sign in to store it on the server.')};
  return '';
}

export default function RecordsApp({ content }) {
  const store = useMemo(() => createStore(content.storeKey + ':rows'), [content.storeKey]);
  const fields = content.fields;
  const primary = fields.find(f => f.primary) || fields[0];
  // The column that holds a picture, if this collection has one.
  const imageField = fields.find(f => f.type === 'image');
  const statusField = fields.find(f => f.key === content.statusField);

  /**
   * THE SECOND TABLE — «طبيب ← مواعيده».
   *
   * A one-table app makes you retype the doctor's name on every appointment:
   * misspelt on the third, unsearchable by the fifth, impossible to rename at
   * all. Here the parent is a row of its own, picked from a list, and the
   * link is a real foreign key the server refuses to leave dangling.
   */
  const rel = content.relation;
  const parentStore = useMemo(() => createStore(content.storeKey + ':parents'), [content.storeKey]);

  const [rows, setRows] = useState(() => store.read());
  const [draft, setDraft] = useState(() => blank(fields));
  const [editing, setEditing] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('new');
  const [server, setServer] = useState(false);
  const [parents, setParents] = useState(() => (rel ? parentStore.read() : []));
  const [parentDraft, setParentDraft] = useState(() => (rel ? blank(rel.fields) : {}));
  const [parentError, setParentError] = useState('');
  const [parentFilter, setParentFilter] = useState('');

  // Persist on every change — a reload never loses a row.
  useEffect(() => { store.write(rows); }, [rows, store]);
  useEffect(() => { if (rel) parentStore.write(parents); }, [parents, parentStore, rel]);

  // The parent list, from the server when there is one.
  useEffect(() => {
    if (!rel || !content.api) return undefined;
    let alive = true;
    (async () => {
      const remote = await apiListOn(content.api, rel.resource);
      if (!alive || !remote) return;
      setParents(prev => {
        const seen = new Set(prev.map(p => String(p.id)));
        const extra = remote.filter(p => p && !seen.has(String(p.id)));
        return extra.length ? [...extra.map(p => ({ ...p, id: String(p.id) })), ...prev] : prev;
      });
    })();
    return () => { alive = false; };
  }, [content.api, rel]);

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

  /**
   * A NEW PARENT, WITHOUT LEAVING THE PAGE.
   *
   * The id that comes back from the SERVER is the one kept — a local uid would
   * name a row the server has never heard of, and every child bound to it
   * would be refused with unknown_${'$'}{rel && rel.key}. That is the difference
   * between a link and a number.
   */
  const addParent = async (e) => {
    e.preventDefault();
    const missing = rel.fields.filter(f => f.required && !String(parentDraft[f.key] || '').trim());
    if (missing.length) { setParentError(${T('املأ الحقول المطلوبة: ', 'Required: ')} + missing.map(f => f.label).join('، ')); return; }
    setParentError('');
    const sent = await apiCreateOn(content.api, rel.resource, parentDraft);
    if (whyLocal(sent)) setParentError(whyLocal(sent));
    const id = sent && sent.ok && sent.item && sent.item.id ? String(sent.item.id) : uid();
    setParents([{ ...parentDraft, id }, ...parents]);
    setParentDraft(blank(rel.fields));
  };

  const removeParent = async (p) => {
    const kids = rows.filter(r => String(r[rel.key] || '') === String(p.id)).length;
    // The same rule the server enforces, said before the click costs anything.
    if (kids) { setParentError(p[rel.labelKey] + ${T(' مرتبط بـ', ' still has ')} + kids + ${T(' سجلّاً — غيّرها أولاً.', ' rows — move them first.')}); return; }
    if (!window.confirm(${T('حذف ', 'Delete ')} + (p[rel.labelKey] || rel.one) + '؟')) return;
    setParentError('');
    setParents(parents.filter(x => x.id !== p.id));
    if (server) await apiDeleteOn(content.api, rel.resource, p.id);
  };

  const submit = async (e) => {
    e.preventDefault();
    const missing = fields.filter(f => f.required && !String(draft[f.key] || '').trim());
    if (missing.length) { setError(${T('املأ الحقول المطلوبة: ', 'Required: ')} + missing.map(f => f.label).join('، ')); return; }
    setError('');
    if (editing) {
      const patch = { ...draft };
      setRows(rows.map(r => (r.id === editing ? { ...r, ...patch } : r)));
      setEditing('');
      setDraft(blank(fields));
      // …and on the server, or the edit was only ever true in this browser.
      const sent = await apiUpdate(content.api, editing, patch);
      if (whyLocal(sent)) setError(whyLocal(sent));
      return;
    }
    const local = { ...draft, id: uid(), createdAt: new Date().toISOString() };
    setRows([local, ...rows]);
    setDraft(blank(fields));
    const sent = await apiCreate(content.api, local);
    if (whyLocal(sent)) { setError(whyLocal(sent)); return; }
    // Adopt the server's id so a later edit or delete reaches the right row.
    if (sent && sent.ok && sent.item && sent.item.id) {
      const real = String(sent.item.id);
      setRows(prev => prev.map(r => (r.id === local.id ? { ...r, ...sent.item, id: real } : r)));
    }
  };

  const edit = (row) => { setSelected(null); setEditing(row.id); setDraft({ ...blank(fields), ...row }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (row) => {
    if (!window.confirm(${T('حذف هذا السجلّ؟', 'Delete this record?')})) return;
    if (selected && selected.id === row.id) setSelected(null);
    setRows(rows.filter(r => r.id !== row.id));
    if (server) await apiDelete(content.api, row.id);
  };
  const toggleDone = (row) => {
    if (!statusField || !content.doneValue) return;
    const next = row[statusField.key] === content.doneValue
      ? (statusField.options || []).find(o => o !== content.doneValue) || ''
      : content.doneValue;
    setRows(rows.map(r => (r.id === row.id ? { ...r, [statusField.key]: next } : r)));
  };

  /** The parent's own name — from the list, or from what the server sent. */
  const parentName = (row) => {
    if (!rel) return '';
    const id = String(row[rel.key] || '');
    if (!id) return String(row.parent_label || '');
    const p = parents.find(x => String(x.id) === id);
    return p ? String(p[rel.labelKey] || '') : String(row.parent_label || '');
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = rows.filter(r => {
      if (filter && String(r[content.statusField] || '') !== filter) return false;
      if (rel && parentFilter && String(r[rel.key] || '') !== parentFilter) return false;
      if (!needle) return true;
      // …and by the parent's name: «كل مواعيد د. سارة» is a search, not a join.
      if (rel && parentName(r).toLowerCase().includes(needle)) return true;
      return fields.some(f => String(r[f.key] || '').toLowerCase().includes(needle));
    });
    list = [...list];
    if (sort === 'old') list.reverse();
    else if (sort === 'az') list.sort((a, b) => String(a[primary.key] || '').localeCompare(String(b[primary.key] || '')));
    return list;
  }, [rows, query, filter, sort, fields, primary, content.statusField, rel, parentFilter, parents]);

  return (
    <div className="wrap">
      <section className="stats" aria-label={${T('الأرقام', 'Numbers')}}>
        {content.metrics.map((m, i) => (
          <div className="stat" key={i}>
            <i className="stat-ico" aria-hidden="true">{({count:'🧾',sum:'💰',todaySum:'📅',todayCount:'📅',sumProduct:'📦',avg:'📈',countWhere:'✅'})[m.kind] || '📊'}</i>
            <div>
              <b>{computeMetric(m, rows)}</b>
              <span>{m.label}</span>
            </div>
          </div>
        ))}
        {rel ? (
          <div className="stat">
            <b>{parents.length}</b>
            <span>{rel.many}</span>
          </div>
        ) : null}
      </section>

      {rel ? (
        <section className="panel rel-panel">
          <h2>{rel.many}</h2>
          <form className="form rel-form" onSubmit={addParent}>
            {rel.fields.map(f => (
              <label className="field" key={f.key}>
                <span>{f.label}{f.required ? ' *' : ''}</span>
                <input type={f.type === 'number' ? 'number' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
                  value={parentDraft[f.key] || ''} onChange={e => setParentDraft({ ...parentDraft, [f.key]: e.target.value })} />
              </label>
            ))}
            {parentError ? <p className="err" role="alert">{parentError}</p> : null}
            <div className="actions">
              <button className="btn" type="submit">{${T('أضف ', 'Add ')} + rel.one}</button>
            </div>
          </form>
          {parents.length === 0 ? (
            <p className="empty">{rel.emptyHint}</p>
          ) : (
            <ul className="rel-list">
              {parents.map(p => {
                const kids = rows.filter(r => String(r[rel.key] || '') === String(p.id)).length;
                return (
                  <li className={'rel-chip' + (parentFilter === String(p.id) ? ' on' : '')} key={p.id}>
                    <button type="button" className="rel-pick"
                      onClick={() => setParentFilter(parentFilter === String(p.id) ? '' : String(p.id))}>
                      <b>{p[rel.labelKey] || rel.one}</b>
                      <em>{kids} {content.entityMany}</em>
                    </button>
                    <button type="button" className="btn tiny danger" onClick={() => removeParent(p)}>{${T('حذف', 'Delete')}}</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="panel">
        <h2>{editing ? ${T('تعديل ', 'Edit ')} + content.entityOne : ${T('إضافة ', 'Add a ')} + content.entityOne}</h2>
        <form className="form" onSubmit={submit}>
          {fields.map(f => (
            <label className={'field' + (f.type === 'textarea' ? ' wide' : '')} key={f.key}>
              <span>{f.label}{f.required ? ' *' : ''}</span>
              {/* The star in the label was DECORATION: the field said «العنوان *»
                  and carried no required attribute, so the browser let the form
                  be submitted empty. The self-QA reported it on every build
                  («نموذج بلا أي حقل مطلوب») and the repair pass could not fix
                  what the generator kept re-emitting. */}
              {f.type === 'image' ? (
                <div className="pic-pick">
                  <img className="pic-preview" src={draft[f.key] || cardFor(draft[primary.key])} alt="" />
                  <div className="pic-acts">
                    <input type="file" accept="image/*" aria-label={f.label}
                      onChange={async e => {
                        const file = e.target.files && e.target.files[0];
                        const data = await pickImage(file, 480);
                        if (data) setDraft({ ...draft, [f.key]: data });
                        e.target.value = '';
                      }} />
                    {draft[f.key] ? (
                      <button className="btn tiny ghost" type="button"
                        onClick={() => setDraft({ ...draft, [f.key]: '' })}>${T('أزل الصورة', 'Remove photo')}</button>
                    ) : null}
                  </div>
                </div>
              ) : f.type === 'textarea' ? (
                <textarea rows={3} required={!!f.required} value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select required={!!f.required} value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
                  required={!!f.required}
                  value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          {rel ? (
            <label className="field">
              <span>{rel.one}</span>
              <select value={draft[rel.key] || ''} onChange={e => setDraft({ ...draft, [rel.key]: e.target.value })}>
                <option value="">{${T('بلا ', 'No ')} + rel.one}</option>
                {parents.map(p => <option key={p.id} value={String(p.id)}>{p[rel.labelKey] || rel.one}</option>)}
              </select>
            </label>
          ) : null}
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
          {rel ? (
            <select value={parentFilter} onChange={e => setParentFilter(e.target.value)} aria-label={rel.many}>
              <option value="">{${T('كل ', 'All ')} + rel.many}</option>
              {parents.map(p => <option key={p.id} value={String(p.id)}>{p[rel.labelKey] || rel.one}</option>)}
            </select>
          ) : null}
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label={${T('الترتيب', 'Sort')}}>
            <option value="new">{${T('الأحدث أولاً', 'Newest first')}}</option>
            <option value="old">{${T('الأقدم أولاً', 'Oldest first')}}</option>
            <option value="az">{${T('أبجدياً', 'A → Z')}}</option>
          </select>
          <button className="btn ghost" type="button" disabled={!rows.length}
            onClick={() => download(content.storeKey + '.csv',
              rel
                ? toCsv([...fields, { key: '__parent', label: rel.one }], visible.map(r => ({ ...r, __parent: parentName(r) })))
                : toCsv(fields.filter(f => f.type !== 'image'), visible))}>{${T('تصدير CSV', 'Export CSV')}}</button>
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
                  {imageField ? (
                    <img className="row-pic" loading="lazy"
                      src={imageOf(row, imageField.key, primary.key)}
                      alt={String(row[primary.key] || '')} />
                  ) : null}
                  <div className="row-main row-open" role="button" tabIndex={0} aria-haspopup="dialog"
                    aria-label={${T('عرض تفاصيل ', 'Show details for ')} + String(row[primary.key] || content.entityOne)}
                    onClick={() => setSelected(row)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(row); } }}>
                    <h3>
                      {row[primary.key] || ${T('(بلا عنوان)', '(untitled)')}}
                      {rel && parentName(row) ? <span className="row-parent">{parentName(row)}</span> : null}
                    </h3>
                    <dl className="row-meta">
                      {fields.filter(f => f.type !== 'image' && f.key !== primary.key && String(row[f.key] || '').trim()).map(f => (
                        <div key={f.key}><dt>{f.label}</dt><dd>{String(row[f.key])}</dd></div>
                      ))}
                      {rel && parentName(row) ? <div><dt>{rel.one}</dt><dd>{parentName(row)}</dd></div> : null}
                    </dl>
                    <span className="row-detail-hint">{${T('انقر لعرض التفاصيل', 'Click to view details')}}</span>
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

      {selected ? (
        <div className="record-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-detail-title"
            onMouseDown={(e) => e.stopPropagation()}>
            <header className="record-modal-head">
              <div>
                <p className="eyebrow">{content.entityOne}</p>
                <h2 id="record-detail-title">{selected[primary.key] || ${T('(بلا عنوان)', '(untitled)')}}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setSelected(null)} aria-label={${T('إغلاق التفاصيل', 'Close details')}}>×</button>
            </header>
            {imageField ? <img className="record-modal-pic" src={imageOf(selected, imageField.key, primary.key)} alt="" /> : null}
            <dl className="record-detail-list">
              {fields.filter(f => f.type !== 'image' && String(selected[f.key] || '').trim()).map(f => (
                <div key={f.key}><dt>{f.label}</dt><dd>{String(selected[f.key])}</dd></div>
              ))}
              {rel && parentName(selected) ? <div><dt>{rel.one}</dt><dd>{parentName(selected)}</dd></div> : null}
            </dl>
            <footer className="record-modal-actions">
              <button className="btn ghost" type="button" onClick={() => setSelected(null)}>{${T('إغلاق', 'Close')}}</button>
              <button className="btn" type="button" onClick={() => edit(selected)}>{${T('تعديل المهمة', 'Edit task')}}</button>
            </footer>
          </section>
        </div>
      ) : null}
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
.app-bar-in{max-width:var(--maxw,1180px);margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
/* A FLEX OR GRID CHILD DEFAULTS TO min-width:auto — it refuses to shrink below
   its own content, so ONE wide child pushes the whole document sideways.
   Measured at 390px: «Horizontal scrolling — div, div.app, header.app-bar,
   div.app-bar-in, main.app-main, div.wrap.social-wrap»: not six defects, one
   defect seen from six heights. */
.app-bar-in>*{min-width:0}
.app-id{display:flex;align-items:baseline;gap:10px;min-width:0}
/* The app's own name measured 3.25:1 against the bar — brand ink on a
   brand-tinted surface. Leaning it toward the page's text clears AA in
   both themes without losing the hue. */
.app-name{font-size:1.05rem;font-weight:800;margin:0;color:color-mix(in srgb,var(--brand,#111) 45%,var(--text,#111))}
.app-sub{color:var(--text-muted,#666);font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 44px, not 38: the audit measures touch targets and it was right to. */
.icon-btn{border:1px solid var(--border,#ddd);background:var(--surface,#fff);color:inherit;border-radius:999px;
  width:44px;height:44px;font-size:16px;cursor:pointer;line-height:1}
.icon-btn:hover{border-color:var(--brand,#333)}
.app-main{flex:1;width:100%}
.app-foot{max-width:var(--maxw,1180px);margin:0 auto;padding:16px;color:var(--text-muted,#666);font-size:13px;display:flex;gap:8px;flex-wrap:wrap}
.dot{opacity:.5}
.wrap{max-width:var(--maxw,1180px);margin:0 auto;padding:16px;display:grid;gap:16px}
.wrap>*{min-width:0}

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
/* 44px: «منجز» 51x36, «تعديل» 59x36, «حذف» 55x36 — three targets a thumb
   keeps missing, measured by the deep self-QA at 390px. */
.btn.tiny{padding:6px 12px;min-height:44px;font-size:.85rem;font-weight:500}
/* #c0392b measured 3.29:1 on the card — the last WCAG failure in the app.
   A darker red keeps the warning read at a glance and clears 4.5:1; the
   dark theme gets a lighter one, since the same ink on a dark card fails
   the other way. */
.btn.danger{background:transparent;color:#96271b;border-color:currentColor}
[data-theme="dark"] .btn.danger,.dark .btn.danger{color:#ff9f93}

.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.toolbar .search{flex:1 1 200px;width:auto}
.badge{margin-inline-start:auto;font-size:.8rem;color:var(--text-muted,#666);border:1px dashed var(--border,#ddd);border-radius:999px;padding:4px 12px}
/* #1e8e3e measured 4.21:1 against the panel — a tenth under AA. */
.badge.on{color:#15722f;border-style:solid;border-color:currentColor}
[data-theme="dark"] .badge.on{color:#6ee7a2}

.rows{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;
  border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:12px 14px;background:var(--bg,#fff)}
.row.done{opacity:.62}
.row.done h3{text-decoration:line-through}
.row-main{min-width:0;flex:1 1 260px}
.row-open{cursor:pointer;border-radius:8px;padding:2px;transition:background .16s ease,outline-color .16s ease}
.row-open:hover{background:var(--tint,#f6f6f6)}
.row-open:focus-visible{outline:2px solid var(--accent,#06c);outline-offset:3px}
.row-main h3{font-size:1rem;margin:0 0 4px}
.row-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0}
.row-meta div{display:flex;gap:6px;font-size:.85rem}
.row-meta dt{color:var(--text-muted,#666)}
.row-meta dd{margin:0}
.row-acts{display:flex;gap:6px;flex-wrap:wrap}
.row-detail-hint{display:block;margin-top:8px;color:var(--text-muted,#666);font-size:.8rem}
.record-modal-backdrop{position:fixed;z-index:20;inset:0;display:grid;place-items:center;padding:16px;background:rgb(0 0 0 / .46)}
.record-modal{width:min(100%,640px);max-height:min(86vh,760px);overflow:auto;background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:var(--radius-lg,16px);padding:18px;box-shadow:0 22px 70px rgb(0 0 0 / .28)}
.record-modal-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid var(--border,#ddd);padding-bottom:12px}
.record-modal-head h2{margin:2px 0 0;font-size:1.25rem}
.eyebrow{margin:0;color:var(--text-muted,#666);font-size:.82rem}
.record-detail-list{display:grid;gap:12px;margin:16px 0}
.record-detail-list div{display:grid;gap:4px;padding:10px 12px;background:var(--tint,#f6f6f6);border-radius:10px}
.record-detail-list dt{color:var(--text-muted,#666);font-size:.85rem}
.record-detail-list dd{margin:0;overflow-wrap:anywhere}
.record-modal-pic{width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin-top:16px}
.record-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border,#ddd);padding-top:14px}
/* a picture for every row — «مع صور نباتات» */
.row-pic{width:88px;height:66px;flex:none;object-fit:cover;border-radius:10px;border:1px solid var(--border,#e5e5e5);background:var(--tint,#f4f4f4)}
.pic-pick{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.pic-preview{width:112px;height:84px;object-fit:cover;border-radius:12px;border:1px solid var(--border,#e5e5e5);background:var(--tint,#f4f4f4)}
.pic-acts{display:flex;flex-direction:column;gap:6px;min-width:0}
.pic-acts input[type=file]{font-size:.82rem;padding:8px;min-height:44px;border:1px dashed var(--border,#ddd);border-radius:10px;background:transparent;max-width:100%}
.tbl-pic{width:52px;height:40px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#e5e5e5);display:block}
.rows.compact .row{padding:10px 12px}

/* the parent table — «الأطباء» above «المواعيد» */
.rel-panel{background:var(--tint,#f8f8f8)}
.rel-form{align-items:end}
.rel-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.rel-chip{display:flex;align-items:center;gap:6px;border:1px solid var(--border,#e5e5e5);
  border-radius:999px;padding:4px 6px 4px 4px;background:var(--bg,#fff)}
.rel-chip.on{border-color:var(--brand,#111);box-shadow:0 0 0 1px var(--brand,#111) inset}
.rel-pick{border:0;background:none;cursor:pointer;font:inherit;color:inherit;text-align:start;
  padding:4px 10px;border-radius:999px;display:flex;flex-direction:column;gap:1px;line-height:1.25}
.rel-pick b{font-size:.92rem}
.rel-pick em{font-style:normal;font-size:.76rem;color:var(--text-muted,#666)}
.row-parent{margin-inline-start:8px;font-size:.76rem;font-weight:500;vertical-align:middle;
  color:var(--text-muted,#666);border:1px solid var(--border,#e5e5e5);border-radius:999px;padding:2px 9px}
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

/* the feed */
.social-wrap{grid-template-columns:1fr}
@media(min-width:900px){.social-wrap{grid-template-columns:260px 1fr;align-items:start}}
.social-wrap>*{min-width:0}
.me-card{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.me-card b{display:block}
.avatar{width:44px;height:44px;flex:none;border-radius:999px;display:grid;place-items:center;
  background:var(--brand,#111);color:var(--on-brand,#fff);font-weight:800;font-size:1.1rem}
.composer-card{display:grid;gap:10px;border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:12px;margin-bottom:14px}
.composer-card textarea{min-height:76px}
/* min-height:auto measured 298x40 and earned «hard to hit with a thumb».
   A file picker is a control like any other: 44px, like the rest.
   (No backtick in this comment: it lives inside a template literal, and
   one backtick ends the literal and the export stops being a function.) */
.file-in{flex:1 1 200px;width:auto;padding:8px;min-height:44px;font-size:.85rem}
.tabbtn{background:transparent;border:1px solid var(--border,#ddd);border-radius:999px;padding:8px 16px;
  min-height:44px;font:inherit;color:inherit;cursor:pointer}
.tabbtn.on{background:var(--brand,#111);color:var(--on-brand,#fff);border-color:transparent;font-weight:700}
.feed{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.post{border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:12px 14px;background:var(--bg,#fff)}
.post-head{display:flex;align-items:center;gap:10px}
.post-who{flex:1;min-width:0}
.post-who b{display:block;line-height:1.2}
.post-text{margin:10px 0 0;white-space:pre-wrap;word-break:break-word}
.post-media{margin-top:10px;display:grid;gap:8px;justify-items:start}
.post-media img{max-width:100%;border-radius:var(--radius,12px);display:block}
.post-acts{display:flex;gap:8px;margin-top:10px}
.act{background:transparent;border:1px solid var(--border,#ddd);border-radius:999px;padding:6px 14px;
  /* 36px measured 53x40 on a phone and earned «hard to hit with a thumb»
     twice in the same report. WCAG asks for 44, so the button IS 44. */
  min-height:44px;font:inherit;color:var(--text-muted,#666);cursor:pointer}
.act.on{color:#e0245e;border-color:currentColor;font-weight:700}
.comments{margin-top:10px;border-top:1px solid var(--border,#e5e5e5);padding-top:10px;display:grid;gap:8px}
.comment{margin:0;font-size:.92rem}
.comment b{margin-inline-end:6px}

/* Owner sign-in — quiet until it is needed. */
.auth-open { font-size: 12px; padding: 6px 12px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
.auth-open:hover { background: var(--line); }
.auth-chip { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; }
.auth-chip button { font-size: 11px; padding: 4px 9px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
.auth-who { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .8; }
.auth-role { padding: 2px 8px; border-radius: 999px; background: var(--chip); border: 1px solid var(--line); font-size: 11px; white-space: nowrap; }
.auth-dot { width: 7px; height: 7px; border-radius: 999px; background: #10b981; flex: none; }
.auth-back { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: rgba(2,6,23,.55); }
.auth-card { width: min(380px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
.auth-card label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.auth-card input { padding: 9px 11px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: inherit; font: inherit; }
.auth-note { margin: 0; font-size: 11.5px; line-height: 1.7; opacity: .7; }
.auth-error { margin: 0; font-size: 12px; color: #f87171; }
.auth-actions { display: flex; justify-content: flex-end; gap: 8px; }
.auth-actions button { padding: 8px 16px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; font-size: 12.5px; }
.auth-actions .primary { background: var(--accent, #2563eb); border-color: transparent; color: #fff; }

/* ═══════════════════ THE DESIGN LIFT ═══════════════════
   «لا يعجبني تصميم جو في بناء المواقع والصفحات فهو يظهر بدائي.»
   Measured with a screenshot before a line was written: flat white cards on a
   flat ground, naked numbers, browser-default fields, one flat button, an
   empty state that is a colored strip. Everything below OVERRIDES the layout
   rules above through the same selectors — later wins — so every measured
   guarantee up there (44px targets, AA inks, min-width:0) stands untouched.
   Tokens only; both themes inherit automatically. */
:root{--shadow-xs:0 1px 2px rgb(15 23 42/.05),0 1px 1px rgb(15 23 42/.04);
  --shadow-sm:0 1px 2px rgb(15 23 42/.06),0 4px 12px rgb(15 23 42/.06);
  --shadow-md:0 2px 4px rgb(15 23 42/.05),0 12px 28px rgb(15 23 42/.10);
  --shadow-brand:0 8px 22px color-mix(in srgb,var(--brand,#2563eb) 30%,transparent);
  --ring:0 0 0 3px color-mix(in srgb,var(--accent,#2563eb) 28%,transparent)}
[data-theme="dark"],.dark{--shadow-xs:0 1px 2px rgb(0 0 0/.5);--shadow-sm:0 2px 8px rgb(0 0 0/.45);
  --shadow-md:0 10px 30px rgb(0 0 0/.5);--shadow-brand:0 8px 24px color-mix(in srgb,var(--brand,#3b82f6) 38%,transparent)}
/* An ambient ground: two brand glows instead of a flat sheet. */
body{background:
  radial-gradient(900px 420px at 85% -10%,color-mix(in srgb,var(--brand,#2563eb) 9%,transparent),transparent 60%),
  radial-gradient(760px 380px at -10% 0%,color-mix(in srgb,var(--accent,#0ea5e9) 8%,transparent),transparent 55%),
  var(--bg,#fff);background-attachment:fixed}
/* Glass bar with a brand monogram. */
.app-bar{background:color-mix(in srgb,var(--surface,#fff) 78%,transparent);
  -webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);
  border-bottom:1px solid color-mix(in srgb,var(--border,#e5e5e5) 70%,transparent);box-shadow:var(--shadow-xs)}
.app-name{display:inline-flex;align-items:center;gap:10px}
.app-name::before{content:'';width:12px;height:12px;border-radius:4px;flex:none;
  background:linear-gradient(135deg,var(--brand,#2563eb),var(--accent,#0ea5e9));
  box-shadow:0 2px 8px color-mix(in srgb,var(--brand,#2563eb) 45%,transparent)}
.icon-btn{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.icon-btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}
/* Stats read like a dashboard, not a receipt. */
.stat{border-radius:var(--radius-lg,16px);box-shadow:var(--shadow-sm);border-color:color-mix(in srgb,var(--border,#e5e5e5) 80%,transparent);
  display:flex;align-items:center;gap:14px;transition:transform .18s ease,box-shadow .18s ease}
.stat:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}
.stat-ico{flex:none;width:46px;height:46px;display:grid;place-items:center;font-size:22px;border-radius:14px;
  background:color-mix(in srgb,var(--brand,#2563eb) 12%,var(--surface,#fff));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brand,#2563eb) 18%,transparent)}
.stat b{font-size:1.75rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat:first-child b{background:linear-gradient(135deg,var(--brand,#2563eb),var(--accent,#0ea5e9));
  -webkit-background-clip:text;background-clip:text;color:transparent}
/* Panels: real elevation, and a title that carries the accent. */
.panel{border-radius:18px;box-shadow:var(--shadow-sm);border-color:color-mix(in srgb,var(--border,#e5e5e5) 80%,transparent)}
.panel h2{display:flex;align-items:center;gap:10px}
.panel h2::before{content:'';width:4px;height:1.05em;border-radius:99px;flex:none;
  background:linear-gradient(180deg,var(--brand,#2563eb),var(--accent,#0ea5e9))}
/* Fields a hand recognises: tinted, rounded, ringed on focus. */
input,select,textarea{background:color-mix(in srgb,var(--tint,#f6f6f6) 55%,var(--bg,#fff));
  border-radius:12px;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}
input:hover,select:hover,textarea:hover{border-color:color-mix(in srgb,var(--brand,#2563eb) 35%,var(--border,#ddd))}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent,#2563eb);box-shadow:var(--ring);background:var(--bg,#fff)}
select{appearance:none;-webkit-appearance:none;padding-inline-end:38px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round'/></svg>");
  background-repeat:no-repeat;background-position:left 14px center}
[dir="ltr"] select{background-position:right 14px center}
/* The primary button earns its name. */
.btn{background:linear-gradient(135deg,var(--brand,#2563eb),color-mix(in srgb,var(--brand,#2563eb) 55%,var(--accent,#0ea5e9)));
  border-radius:12px;box-shadow:var(--shadow-brand);transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}
.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
.btn:active{transform:translateY(0)}
.btn.ghost,.btn.danger{background:transparent;box-shadow:none}
.btn.ghost:hover{background:var(--tint,#f6f6f6);transform:none}
/* Rows are cards that answer the cursor. */
.row{border-radius:14px;box-shadow:var(--shadow-xs);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.row:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm);border-color:color-mix(in srgb,var(--brand,#2563eb) 25%,var(--border,#e5e5e5))}
/* An empty state that invites, instead of a colored strip. */
.empty{display:grid;justify-items:center;gap:10px;text-align:center;padding:34px 18px;
  background:transparent;border:1.5px dashed color-mix(in srgb,var(--border,#ccc) 85%,transparent);border-radius:16px;color:var(--text-muted,#666)}
.empty::before{content:'🗂️';font-size:34px;line-height:1;filter:grayscale(.15)}
/* The page rises to meet its reader — and holds still for those who ask it to. */
@media (prefers-reduced-motion:no-preference){
  .wrap>*{animation:liftIn .45s cubic-bezier(.2,.7,.3,1) both}
  .wrap>*:nth-child(2){animation-delay:.06s}.wrap>*:nth-child(3){animation-delay:.12s}
  .wrap>*:nth-child(4){animation-delay:.18s}.wrap>*:nth-child(5){animation-delay:.24s}
  @keyframes liftIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
}
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

/**
 * EVERY TABLE, AS A SCREEN — «قل ابنِ المدفوعات وأبنيها فوق هذا النظام».
 *
 * The backend learned to carry the rest of the system: vendors, customers,
 * coupons, shipments — doctors, patients, appointments. Reachable only by
 * `curl`, that is a database with a URL, not a system anyone can run. This is
 * the other half: one screen per table, driven by the SAME model the server
 * was generated from, so the two halves cannot drift apart.
 *
 * It is deliberately one generic component rather than four hand-written ones:
 * a table nobody wrote by hand is a table nobody forgot to update.
 */
export function fileTablesAdminJsx(model: any[], isAr: boolean): string {
    const MODEL = JSON.stringify(model.map(e => ({
        key: e.key, label: isAr ? e.ar : e.en,
        fields: (e.fields || []).map((f: any) => ({
            key: f.key, type: f.type, required: !!f.required,
            label: (isAr ? f.ar : f.en) || f.key,
        })),
        belongsTo: e.belongsTo || null,
    })));
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiListOn, apiCreateOn, apiDeleteOn, apiUpdateOn, getToken, canWriteNow, pickImage, cardFor } from '../app/store.js';

/** Which columns hold a picture — the same rule the server and the app use. */
const IMAGE_COL = /(^|_)(image|photo|picture|img)$/;

/** The system's tables, exactly as the server declares them. */
export const TABLES = ${MODEL};

/** The server answers in machine words; the screen must not. */
function human(error, table) {
  const e = String(error || '');
  if (!e) return ${T('تعذّر الحفظ.', 'Could not save.')};
  if (e.endsWith('_not_found')) {
    return ${T('السطر المرتبط غير موجود — اختر واحداً من القائمة.', 'The linked row does not exist — pick one from the list.')};
  }
  if (e.endsWith('_required')) {
    const field = e.slice(0, -('_required'.length));
    const f = (table.fields || []).find((x) => x.key === field);
    return ${T('حقل مطلوب: ', 'Required field: ')} + ((f && f.label) || field);
  }
  if (e === 'no_server') return ${T('لا يمكن الوصول إلى الخادم.', 'The server cannot be reached.')};
  // The three refusals of a system a team uses — three different sentences,
  // because «it did not save» teaches nobody anything.
  if (e === 'read_only') return ${T('حسابك للاطّلاع فقط — لا يملك صلاحية التغيير.', 'Your account is read-only — it may not change anything.')};
  if (e === 'not_your_row') return ${T('هذا الصف ليس لك — لا يعدّله إلا صاحبه أو المالك.', 'That row is not yours — only its author or the owner may change it.')};
  if (e === 'forbidden') return ${T('لا صلاحية لحسابك على هذا الإجراء.', 'Your account is not allowed to do that.')};
  if (e === 'save_failed' || e === 'unauthorized') {
    return ${T('سجّل الدخول أولاً — الكتابة محميّة.', 'Sign in first — writing is protected.')};
  }
  return e;
}

function TableView({ api, table, parentRows, mayWrite }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(0);

  const reload = useCallback(async () => {
    const list = await apiListOn(api, table.key);
    setRows(Array.isArray(list) ? list : []);
  }, [api, table.key]);
  useEffect(() => { reload(); }, [reload]);
  /**
   * SIGNING IN CHANGES WHAT THIS LIST IS.
   *
   * An employee's list is his own rows, and the server scopes it by the token
   * that arrives with the request. A list fetched before the sign-in is the
   * anonymous one — the whole shelf — and it would sit there looking correct.
   */
  useEffect(() => {
    const again = () => { reload(); };
    window.addEventListener('joe:auth', again);
    return () => window.removeEventListener('joe:auth', again);
  }, [reload]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = editing
      ? await apiUpdateOn(api, table.key, editing, draft)
      : await apiCreateOn(api, table.key, draft);
    setBusy(false);
    if (!r || r.ok === false) { setError(human(r && r.error, table)); return; }
    setDraft({}); setEditing(0);
    reload();
  };

  const remove = async (id) => {
    setError('');
    const r = await apiDeleteOn(api, table.key, id);
    if (r && r.ok === false) { setError(human(r.error, table)); return; }
    reload();
  };

  const edit = (row) => {
    const d = {};
    for (const f of table.fields) d[f.key] = row[f.key] ?? '';
    setDraft(d); setEditing(row.id);
  };

  return (
    <section className="tbl" aria-label={table.label}>
      <div className="tbl-head">
        <h3>{table.label}</h3>
        <span className="tbl-count">{rows.length}</span>
      </div>

      {mayWrite ? (
      <form className="tbl-form" onSubmit={submit}>
        {table.fields.map((f) => (
          f.key === (table.belongsTo && table.belongsTo.key) ? (
            <label key={f.key} className="tbl-field">
              <span>{f.label}</span>
              <select value={draft[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">{${T('— بلا ربط —', '— not linked —')}}</option>
                {(parentRows || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.title || p.code || ('#' + p.id)}</option>
                ))}
              </select>
            </label>
          ) : (
            IMAGE_COL.test(f.key) ? (
              <label key={f.key} className="tbl-field">
                <span>{f.label}</span>
                <div className="pic-pick">
                  <img className="pic-preview" src={draft[f.key] || cardFor(draft.name || draft.title || f.label)} alt="" />
                  <input type="file" accept="image/*" aria-label={f.label}
                    onChange={async (e) => {
                      const file = e.target.files && e.target.files[0];
                      const data = await pickImage(file, 480);
                      if (data) set(f.key, data);
                      e.target.value = '';
                    }} />
                </div>
              </label>
            ) : (
            <label key={f.key} className="tbl-field">
              <span>{f.label}{f.required ? ' *' : ''}</span>
              <input
                type={f.type === 'REAL' ? 'number' : 'text'}
                step={f.type === 'REAL' ? 'any' : undefined}
                value={draft[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                required={!!f.required}
              />
            </label>
            )
          )
        ))}
        <div className="tbl-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? ${T('جارٍ…', 'Saving…')} : editing ? ${T('حفظ التعديل', 'Save changes')} : ${T('إضافة', 'Add')}}
          </button>
          {editing ? (
            <button type="button" onClick={() => { setDraft({}); setEditing(0); }}>{${T('إلغاء', 'Cancel')}}</button>
          ) : null}
        </div>
      </form>
      ) : null}
      {error ? <p className="tbl-error" role="alert">{error}</p> : null}

      {rows.length ? (
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {table.fields.map((f) => <th key={f.key}>{f.label}</th>)}
                {mayWrite ? <th aria-label={${T('إجراءات', 'actions')}}></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  {table.fields.map((f) => (
                    /* A picture rendered as text is four thousand characters of
                       base64 inside one cell — measured, and unreadable. */
                    <td key={f.key}>{IMAGE_COL.test(f.key)
                      ? (r[f.key] ? <img className="tbl-pic" src={String(r[f.key])} alt="" loading="lazy" /> : '—')
                      : String(r[f.key] ?? '')}</td>
                  ))}
                  {mayWrite ? (
                  <td className="tbl-row-actions">
                    <button type="button" onClick={() => edit(r)}>{${T('تعديل', 'Edit')}}</button>
                    <button type="button" onClick={() => remove(r.id)}>{${T('حذف', 'Delete')}}</button>
                  </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="tbl-empty">{${T('لا صفوف بعد — أضف أول واحد من الأعلى.', 'No rows yet — add the first one above.')}}</p>
      )}
    </section>
  );
}

/**
 * The whole administration surface: one tab per table, and the parent's rows
 * handed to the child so a link is CHOSEN from real rows, never typed as an id
 * that may not exist.
 */
export default function TablesAdmin({ api }) {
  const [active, setActive] = useState(TABLES[0] ? TABLES[0].key : '');
  const [parents, setParents] = useState({});
  /**
   * SIGNED IN IS NOT THE SAME AS ALLOWED.
   *
   * An accountant signs in and may not write a thing; the screen must say so
   * instead of offering buttons that can only answer 403.
   */
  const [signedIn, setSignedIn] = useState(() => !!getToken());
  const [mayWrite, setMayWrite] = useState(() => canWriteNow());
  useEffect(() => {
    const sync = () => { setSignedIn(!!getToken()); setMayWrite(canWriteNow()); };
    window.addEventListener('joe:auth', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('joe:auth', sync); window.removeEventListener('storage', sync); };
  }, []);

  const table = useMemo(() => TABLES.find((t) => t.key === active) || TABLES[0], [active]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const needed = TABLES.filter((t) => t.belongsTo).map((t) => t.belongsTo.entity);
      const out = {};
      for (const key of [...new Set(needed)]) {
        const rows = await apiListOn(api, key);
        out[key] = Array.isArray(rows) ? rows : [];
      }
      if (alive) setParents(out);
    })();
    return () => { alive = false; };
  }, [api, active]);

  if (!api || !TABLES.length || !table) return null;

  return (
    <section className="admin-tables">
      <h2>${isAr ? 'إدارة النظام' : 'System administration'}</h2>
      {!signedIn ? (
        <p className="tbl-note">{${T('القراءة متاحة للجميع؛ للإضافة والتعديل سجّل الدخول من الأعلى.', 'Anyone can read; sign in above to add or change anything.')}}</p>
      ) : !mayWrite ? (
        <p className="tbl-note">{${T('حسابك للاطّلاع فقط — ترى كل شيء ولا تغيّر شيئاً.', 'Your account is read-only — you see everything and change nothing.')}}</p>
      ) : null}
      <div className="tbl-tabs" role="tablist">
        {TABLES.map((t) => (
          <button
            key={t.key} type="button" role="tab"
            aria-selected={t.key === active}
            className={t.key === active ? 'active' : ''}
            onClick={() => setActive(t.key)}
          >{t.label}</button>
        ))}
      </div>
      <TableView
        key={table.key}
        api={api}
        table={table}
        mayWrite={mayWrite}
        parentRows={table.belongsTo ? (parents[table.belongsTo.entity] || []) : []}
      />
    </section>
  );
}
`;
}

/**
 * «نظام يستعمله فريق» — THE OWNER'S ACCOUNTS SCREEN.
 *
 * The server has known three roles since this batch; without this screen the
 * only way to use them would be curl, and a business owner does not own curl.
 * It renders for the owner ONLY — and not because hiding it is security (the
 * server answers 403 to everybody else regardless), but because a button that
 * can only fail is a lie about what the screen can do.
 */
export function fileAccountsJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    const roleRows = ROLES.map(r => `  { key: '${r.key}', label: '${q(isAr ? r.ar : r.en)}', note: '${q(isAr ? r.noteAr : r.noteEn)}' },`).join('\n');
    return `import React, { useEffect, useState } from 'react';
import { apiUsers, apiAddUser, apiSetRole, apiRemoveUser, isOwnerNow } from '../app/store.js';

/** The three roles the server knows — same names, same order, one source. */
const ROLES = [
${roleRows}
];

const REFUSALS = {
  last_owner: ${T('لا يمكن ترك النظام بلا مالك.', 'A system cannot be left with no owner.')},
  cannot_delete_self: ${T('لا تستطيع حذف حسابك أنت.', 'You cannot delete your own account.')},
  email_taken: ${T('هذا البريد مستعمل في حساب آخر.', 'That email already belongs to an account.')},
  bad_email: ${T('البريد غير صالح.', 'That is not a valid email.')},
  bad_role: ${T('دور غير معروف.', 'Unknown role.')},
  forbidden: ${T('هذه الشاشة للمالك وحده.', 'This screen is the owner’s only.')},
  no_server: ${T('لا يمكن الوصول إلى الخادم.', 'The server cannot be reached.')},
};

export default function Accounts({ api }) {
  const [owner, setOwner] = useState(() => isOwnerNow());
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [made, setMade] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The role can change under this screen — a sign-in, a sign-out, or the
  // owner demoting himself somewhere else. Listening beats reading once.
  useEffect(() => {
    const sync = () => setOwner(isOwnerNow());
    window.addEventListener('joe:auth', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('joe:auth', sync); window.removeEventListener('storage', sync); };
  }, []);

  const reload = async () => {
    const list = await apiUsers(api);
    setUsers(Array.isArray(list) ? list : []);
  };
  useEffect(() => { if (owner) reload(); else setUsers([]); }, [api, owner]);

  if (!api || !owner) return null;

  const say = (code) => REFUSALS[code] || ${T('تعذّر تنفيذ الطلب.', 'That did not work.')};

  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setMade(null);
    const r = await apiAddUser(api, email.trim(), role);
    setBusy(false);
    if (!r.ok) { setError(say(r.error)); return; }
    // Shown ONCE — the server keeps only a scrypt hash of it.
    setMade({ email: r.user.email, password: r.password });
    setEmail('');
    reload();
  };

  const change = async (u, next) => {
    setError('');
    const r = await apiSetRole(api, u.id, next);
    if (!r.ok) { setError(say(r.error)); return; }
    reload();
  };

  const remove = async (u) => {
    const sure = window.confirm(${T('حذف حساب ', 'Delete the account ')} + u.email + '؟');
    if (!sure) return;
    setError('');
    const r = await apiRemoveUser(api, u.id);
    if (!r.ok) { setError(say(r.error)); return; }
    reload();
  };

  return (
    <section className="accounts">
      <h2>{${T('الحسابات والصلاحيات', 'Accounts and permissions')}}</h2>
      <ul className="role-legend">
        {ROLES.map((r) => (
          <li key={r.key}><b>{r.label}</b> — {r.note}</li>
        ))}
      </ul>

      <form className="acc-form" onSubmit={add}>
        <label className="acc-field">
          <span>{${T('بريد الحساب الجديد', 'New account’s email')}}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            placeholder="name@example.com" autoComplete="off" />
        </label>
        <label className="acc-field">
          <span>{${T('الدور', 'Role')}}</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? ${T('جارٍ…', 'Working…')} : ${T('أنشئ الحساب', 'Create account')}}
        </button>
      </form>

      {made ? (
        <div className="acc-made" role="status">
          <b>{${T('كلمة المرور تظهر مرة واحدة — انسخها الآن:', 'The password is shown once — copy it now:')}}</b>
          <code>{made.email}</code>
          <code>{made.password}</code>
          <p>{${T('لم تُحفظ في أي مكان — الخادم يحمل بصمتها فقط، ولا يمكن استرجاعها.', 'It is stored nowhere — the server keeps only its hash, and it cannot be read back.')}}</p>
          <button type="button" onClick={() => setMade(null)}>{${T('أخفِها', 'Hide')}}</button>
        </div>
      ) : null}

      {error ? <p className="acc-error">{error}</p> : null}

      {users.length ? (
        <div className="acc-scroll">
          <table>
            <thead>
              <tr>
                <th>{${T('البريد', 'Email')}}</th>
                <th>{${T('الدور', 'Role')}}</th>
                <th>{${T('إجراءات', 'Actions')}}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} onChange={(e) => change(u, e.target.value)}
                      aria-label={${T('دور ', 'Role of ')} + u.email}>
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="danger" onClick={() => remove(u)}>
                      {${T('حذف', 'Delete')}}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="acc-empty">{${T('لا حسابات بعد غير حسابك.', 'No accounts yet besides your own.')}}</p>
      )}
    </section>
  );
}
`;
}

/** The accounts screen's styles — the same quiet surface as the tables. */
export function fileAccountsCss(): string {
    return `
/* ── accounts and permissions ──────────────────────────────────────────── */
.accounts {
  max-width: var(--maxw, 1180px); margin: 32px auto 0; padding: 0 16px 8px;
  display: flex; flex-direction: column; gap: 14px;
}
.accounts > h2 { margin: 0; font-size: 20px; }
.role-legend { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 6px; }
.role-legend li { color: var(--muted); font-size: 14px; line-height: 1.7; }
.role-legend b { color: var(--text); }
.acc-form {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
  background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--radius, 12px); padding: 16px;
}
.acc-field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; flex: 1 1 200px; }
.acc-field span { font-size: 13px; color: var(--muted); }
.acc-field input, .acc-field select {
  min-height: 44px; padding: 8px 12px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px;
}
.acc-form button {
  min-height: 44px; padding: 8px 18px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px;
}
.acc-form .primary { background: var(--brand); color: #fff; border-color: transparent; }
.acc-made {
  display: flex; flex-direction: column; gap: 8px; padding: 14px 16px;
  border: 1px solid var(--brand); border-radius: var(--radius, 12px); background: var(--chip);
}
.acc-made code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px;
  padding: 8px 10px; border-radius: 8px; background: var(--card); border: 1px solid var(--line);
  overflow-wrap: anywhere; direction: ltr; text-align: start;
}
.acc-made p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.7; }
.acc-made button {
  align-self: flex-start; min-height: 44px; padding: 6px 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 14px;
}
.acc-error { margin: 0; color: #96271b; font-size: 14px; }
[data-theme="dark"] .acc-error { color: #ff9f93; }
.acc-empty { margin: 0; color: var(--muted); font-size: 14px; }
.acc-scroll { overflow-x: auto; }
.acc-scroll table { width: 100%; border-collapse: collapse; font-size: 14px; }
.acc-scroll th, .acc-scroll td { padding: 10px; text-align: start; border-bottom: 1px solid var(--line); }
.acc-scroll th { color: var(--muted); font-weight: 600; }
.acc-scroll select {
  min-height: 44px; padding: 6px 10px; border-radius: 9px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 14px;
}
.acc-scroll .danger {
  min-height: 44px; padding: 6px 14px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--line); background: transparent; color: #96271b; font-size: 14px;
}
[data-theme="dark"] .acc-scroll .danger { color: #ff9f93; }
`;
}

/** The screens' own styles — plain, readable, and theme-aware like the rest. */
export function fileTablesAdminCss(): string {
    return `
/* ── system tables ─────────────────────────────────────────────────────── */
/* The engine's own content sits inside the page container; a section that
   skips it runs edge to edge and reads as a different page. Measured in a real
   browser: «System administration» sat flush against the window while
   everything above it was centred in 1180px. */
.admin-tables {
  max-width: var(--maxw, 1180px); margin: 32px auto 0; padding: 0 16px 8px;
  display: flex; flex-direction: column; gap: 14px;
}
.admin-tables > h2 { margin: 0; font-size: 20px; }
.tbl-note { margin: 0; color: var(--muted); font-size: 14px; }
.tbl-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tbl-tabs button {
  min-height: 44px; padding: 8px 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px;
}
.tbl-tabs button.active { background: var(--brand); color: #fff; border-color: transparent; }
.tbl {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--radius, 12px); padding: 16px;
}
.tbl-head { display: flex; align-items: baseline; gap: 10px; }
.tbl-head h3 { margin: 0; font-size: 17px; }
.tbl-count {
  min-width: 26px; padding: 2px 8px; border-radius: 999px; text-align: center;
  background: var(--chip); color: var(--muted); font-size: 13px;
}
.tbl-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.tbl-field { display: flex; flex-direction: column; gap: 4px; min-width: 160px; flex: 1 1 160px; }
.tbl-field span { font-size: 13px; color: var(--muted); }
.tbl-field input, .tbl-field select {
  min-height: 44px; padding: 8px 12px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px;
}
.tbl-actions { display: flex; gap: 8px; }
.tbl-actions button, .tbl-row-actions button {
  min-height: 44px; padding: 8px 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px;
}
.tbl-actions .primary { background: var(--brand); color: #fff; border-color: transparent; }
.tbl-error { margin: 0; color: #b3261e; font-size: 14px; }
.tbl-empty { margin: 0; color: var(--muted); font-size: 14px; }
.tbl-scroll { overflow-x: auto; }
.tbl-scroll table { width: 100%; border-collapse: collapse; font-size: 14px; }
.tbl-scroll th, .tbl-scroll td { padding: 10px; text-align: start; border-bottom: 1px solid var(--line); }
.tbl-scroll th { color: var(--muted); font-weight: 600; }
.tbl-row-actions { display: flex; gap: 6px; }
`;
}

export function buildAppFiles(bp: AppBlueprint, o: AppBuildOptions, slugName: string): Record<string, string> {
    const engineFile: Record<AppBlueprint['engine'], [string, string]> = {
        map: ['src/components/MapApp.jsx', fileMapAppJsx(o.isArabic)],
        chat: ['src/components/ChatApp.jsx', fileChatAppJsx(o.isArabic)],
        weather: ['src/components/WeatherApp.jsx', fileWeatherAppJsx(o.isArabic)],
        records: ['src/components/RecordsApp.jsx', fileRecordsAppJsx(o.isArabic)],
        social: ['src/components/SocialApp.jsx', fileSocialAppJsx(o.isArabic)],
        shop: ['src/components/ShopApp.jsx', fileShopAppJsx(o.isArabic)],
    };
    const [enginePath, engineSrc] = engineFile[bp.engine];
    return {
        'package.json': fileAppPackageJson(slugName, bp),
        'index.html': fileAppIndexHtml(bp, o),
        '.gitignore': 'node_modules\ndist\n',
        'src/main.jsx': fileAppMainJsx(),
        'src/App.jsx': fileAppShellJsx(bp, o.isArabic, !!(o.model && o.model.length), !!o.api),
        'src/content.js': fileAppContentJs(bp, o),
        'src/app/store.js': fileAppStoreJs(),
        [enginePath]: engineSrc,
        ...(o.model && o.model.length ? { 'src/components/TablesAdmin.jsx': fileTablesAdminJsx(o.model, o.isArabic) } : {}),
        // The accounts screen ships whenever there IS a server to have accounts
        // on; it renders for the owner only, and returns null for everybody else.
        ...(o.api ? { 'src/components/Accounts.jsx': fileAccountsJsx(o.isArabic) } : {}),
        'src/styles/app.css': fileAppCss() + (bp.engine === 'shop' ? fileShopCss() : '')
            + (o.model && o.model.length ? fileTablesAdminCss() : '')
            + (o.api ? fileAccountsCss() : ''),
    };
}

/* ── engine 5: social — a real feed, not a page about one ────────────────── */

/**
 * THE FIFTH ENGINE, and the honest half of «ابنِ منصة تواصل اجتماعي».
 *
 * A full social platform is ten systems (live video, ads, moderation at
 * scale). This is the part that can be delivered as WORKING SOFTWARE and
 * proven: an identity, a composer that takes text and a real image, a feed
 * that persists, likes that count, comments that thread, following that
 * filters, and a profile that shows your own posts. Everything else the user
 * asked for is reported as NOT built — by name, in his own words.
 */
export function fileSocialAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createStore, uid, apiList, apiCreate, apiPost, apiGet, apiDelete, apiSiblingLive } from '../app/store.js';

const when = (iso) => {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return ${T('الآن', 'now')};
    if (diff < 3600) return Math.floor(diff / 60) + ${T(' د', 'm')};
    if (diff < 86400) return Math.floor(diff / 3600) + ${T(' س', 'h')};
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
};

/** A photo becomes a data URL the browser can keep — capped so storage survives. */
const readImage = (file) => new Promise((resolve) => {
  if (!file || !/^image\\//.test(file.type) || file.size > 3 * 1024 * 1024) return resolve(null);
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Downscale to 1280px wide: a phone photo would otherwise fill the
      // whole localStorage quota with one post.
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(null);
    img.src = String(fr.result);
  };
  fr.onerror = () => resolve(null);
  fr.readAsDataURL(file);
});

export default function SocialApp({ content }) {
  const postStore = useMemo(() => createStore(content.storeKey + ':posts'), [content.storeKey]);
  const followStore = useMemo(() => createStore(content.storeKey + ':following'), [content.storeKey]);

  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem(content.storeKey + ':me') || 'null'); } catch { return null; } });
  const [draftName, setDraftName] = useState('');
  const [posts, setPosts] = useState(() => postStore.read());
  const [following, setFollowing] = useState(() => followStore.read());
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [tab, setTab] = useState('all');          // all | following | mine
  const [query, setQuery] = useState('');
  const [openComments, setOpenComments] = useState('');
  const [commentText, setCommentText] = useState('');
  const [server, setServer] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { postStore.write(posts); }, [posts, postStore]);
  useEffect(() => { followStore.write(following); }, [following, followStore]);

  /**
   * A real server makes this a NETWORK. Without one the app says so plainly.
   *
   * The hearts, the threads and the follows come down with the posts, and
   * for a post that lives on the server the server's numbers WIN: two people
   * looking at the same post must see the same count. Local-only posts (no
   * server, or one that went away) keep their own copies untouched.
   */
  useEffect(() => {
    if (!content.api) return;
    let alive = true;
    const pull = async () => {
      const remote = await apiList(content.api);
      if (!alive || !remote) return;
      setServer(true);
      setPosts(prev => {
        const byId = new Map(prev.map(p => [String(p.id), p]));
        const merged = remote
          .filter(r => r && (r.text || r.body || r.image))
          .map(r => {
            const id = String(r.id);
            const local = byId.get(id);
            byId.delete(id);
            return {
              ...(local || {}),
              id, author: r.author || r.who || '—', handle: r.handle || '',
              text: r.text || r.body || '', image: r.image || null,
              at: r.at || r.createdAt || (local && local.at) || new Date().toISOString(),
              likes: Array.isArray(r.likes) ? r.likes : (local ? local.likes : []),
              comments: Array.isArray(r.comments) ? r.comments : (local ? local.comments : []),
              remote: true,
            };
          });
        const localOnly = [...byId.values()].filter(p => !p.remote);
        return [...merged, ...localOnly].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      });
    };
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [content.api]);

  // Who I follow is shared too — open the app on another device and the same
  // people are still followed.
  useEffect(() => {
    if (!content.api || !me) return;
    let alive = true;
    (async () => {
      const base = await apiSiblingLive(content.api, 'follows');
      if (!base || !alive) return;
      const d = await apiGet(base + '?follower=' + encodeURIComponent(me.handle));
      if (alive && d && Array.isArray(d.following)) setFollowing(d.following);
    })().catch(() => { /* offline — the local list stands */ });
    return () => { alive = false; };
  }, [content.api, me && me.handle]);

  if (!me) {
    return (
      <div className="wrap">
        <section className="panel narrow">
          <h2>{${T('من أنت؟', 'Who are you?')}}</h2>
          <p className="muted">{${T('اسمك يظهر على منشوراتك — محفوظ على جهازك وحده.', 'Your name appears on your posts — kept on this device only.')}}</p>
          <form className="toolbar" onSubmit={(e) => {
            e.preventDefault();
            const n = draftName.trim(); if (!n) return;
            const who = { name: n.slice(0, 40), handle: '@' + n.trim().toLowerCase().replace(/[^a-z0-9\\u0621-\\u064A]+/g, '') .slice(0, 20) };
            setMe(who);
            try { localStorage.setItem(content.storeKey + ':me', JSON.stringify(who)); } catch { /* private mode */ }
          }}>
            <input className="search" value={draftName} onChange={e => setDraftName(e.target.value)} placeholder={${T('اسمك…', 'Your name…')}} autoFocus />
            <button className="btn" type="submit">{${T('ادخل', 'Enter')}}</button>
          </form>
        </section>
      </div>
    );
  }

  const publish = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body && !image) return;
    const post = {
      id: uid(), author: me.name, handle: me.handle, text: body, image,
      at: new Date().toISOString(), likes: [], comments: [],
    };
    setPosts([post, ...posts]);
    setText(''); setImage(null);
    if (fileRef.current) fileRef.current.value = '';
    // The server's own id replaces the local one, so the next poll recognises
    // this post as already present instead of showing it twice.
    apiCreate(content.api, { author: post.author, handle: post.handle, text: post.text, image: post.image, at: post.at })
      .then((saved) => {
        const id = saved && (saved.post ? saved.post.id : saved.id);
        if (id) setPosts(cur => cur.map(p => (p.id === post.id ? { ...p, id: String(id) } : p)));
      })
      .catch(() => { /* offline — the local copy stands */ });
  };

  /**
   * Optimistic first, then the server's answer. The heart flips instantly
   * because a social app that waits on a round trip feels broken — and when
   * the server replies it hands back the AUTHORITATIVE list of handles, so a
   * like someone else added in the same second is not lost.
   */
  const toggleLike = (id) => {
    setPosts(cur => cur.map(p => (p.id !== id ? p : {
      ...p, likes: p.likes.includes(me.handle) ? p.likes.filter(h => h !== me.handle) : [...p.likes, me.handle],
    })));
    apiPost(content.api, '/' + encodeURIComponent(id) + '/like', { handle: me.handle })
      .then(d => {
        if (!d || !Array.isArray(d.likes)) return;
        setPosts(cur => cur.map(p => (p.id !== id ? p : { ...p, likes: d.likes })));
      })
      .catch(() => { /* offline — the optimistic flip stands */ });
  };

  const addComment = (id) => {
    const body = commentText.trim();
    if (!body) return;
    const local = { id: uid(), author: me.name, handle: me.handle, text: body, at: new Date().toISOString() };
    setPosts(cur => cur.map(p => (p.id !== id ? p : { ...p, comments: [...p.comments, local] })));
    setCommentText('');
    apiPost(content.api, '/' + encodeURIComponent(id) + '/comments', { author: me.name, handle: me.handle, text: body, at: local.at })
      .then(d => {
        const saved = d && d.comment;
        if (!saved || !saved.id) return;
        // Adopt the server's id so the next poll recognises this comment
        // instead of showing it twice.
        setPosts(cur => cur.map(p => (p.id !== id ? p : {
          ...p, comments: p.comments.map(c => (c.id === local.id ? { ...c, id: String(saved.id) } : c)),
        })));
      })
      .catch(() => { /* offline — the local comment stands */ });
  };

  const toggleFollow = async (handle) => {
    setFollowing(cur => (cur.includes(handle) ? cur.filter(h => h !== handle) : [...cur, handle]));
    const url = await apiSiblingLive(content.api, 'follows');
    if (!url) return;
    const d = await apiPost(url, '', { follower: me.handle, target: handle }).catch(() => null);
    if (d && Array.isArray(d.list)) setFollowing(d.list);   // offline: the local list stands
  };

  const visible = posts.filter(p => {
    if (tab === 'mine' && p.handle !== me.handle) return false;
    if (tab === 'following' && !following.includes(p.handle) && p.handle !== me.handle) return false;
    const n = query.trim().toLowerCase();
    if (n && !(String(p.text).toLowerCase().includes(n) || String(p.author).toLowerCase().includes(n))) return false;
    return true;
  });

  const mine = posts.filter(p => p.handle === me.handle).length;

  return (
    <div className="wrap social-wrap">
      <section className="panel social-side">
        <div className="me-card">
          <div className="avatar" aria-hidden="true">{String(me.name).trim().charAt(0)}</div>
          <div>
            <b>{me.name}</b>
            <p className="muted small">{me.handle}</p>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><b>{mine}</b><span>{${T('منشوراتي', 'My posts')}}</span></div>
          <div className="stat"><b>{following.length}</b><span>{${T('أتابع', 'Following')}}</span></div>
        </div>
        <span className={'badge ' + (server ? 'on' : '')}>
          {server ? ${T('متصل بالخادم — المنشورات والإعجابات والتعليقات مشتركة', 'Server connected — posts, likes and comments are shared')} : ${T('محلي على هذا الجهاز', 'Local to this device')}}
        </span>
      </section>

      <section className="panel social-main">
        <form className="composer-card" onSubmit={publish}>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)}
            placeholder={${T('بم تفكّر؟', "What's on your mind?")}} aria-label={${T('نص المنشور', 'Post text')}} />
          {image ? (
            <div className="post-media">
              <img src={image} alt={${T('صورة المنشور', 'Post image')}} />
              <button className="btn tiny danger" type="button" onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ''; }}>{${T('أزل الصورة', 'Remove photo')}}</button>
            </div>
          ) : null}
          <div className="actions">
            <input ref={fileRef} type="file" accept="image/*" className="file-in"
              onChange={async (e) => setImage(await readImage(e.target.files && e.target.files[0]))} aria-label={${T('أضف صورة', 'Add a photo')}} />
            <button className="btn" type="submit" disabled={!text.trim() && !image}>{${T('انشر', 'Post')}}</button>
          </div>
        </form>

        <div className="toolbar">
          {[['all', ${T('الكل', 'All')}], ['following', ${T('أتابعهم', 'Following')}], ['mine', ${T('منشوراتي', 'Mine')}]].map(([id, label]) => (
            <button key={id} type="button" className={'tabbtn' + (tab === id ? ' on' : '')} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
          <input className="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={${T('ابحث في المنشورات…', 'Search posts…')}} />
        </div>

        {visible.length === 0 ? <p className="empty">{content.emptyHint}</p> : (
          <ul className="feed">
            {visible.map(p => (
              <li className="post" key={p.id}>
                <header className="post-head">
                  <div className="avatar" aria-hidden="true">{String(p.author).trim().charAt(0)}</div>
                  <div className="post-who">
                    <b>{p.author}</b>
                    <span className="muted small">{p.handle} · {when(p.at)}</span>
                  </div>
                  {p.handle !== me.handle ? (
                    <button className={'btn tiny' + (following.includes(p.handle) ? ' ghost' : '')} type="button" onClick={() => toggleFollow(p.handle)}>
                      {following.includes(p.handle) ? ${T('أتابعه', 'Following')} : ${T('تابِع', 'Follow')}}
                    </button>
                  ) : (
                    <button className="btn tiny danger" type="button"
                      onClick={() => {
                        if (!window.confirm(${T('حذف هذا المنشور؟', 'Delete this post?')})) return;
                        setPosts(cur => cur.filter(x => x.id !== p.id));
                        // …and on the server as well, or the next poll would
                        // bring it back and undo the deletion in front of him.
                        apiDelete(content.api, p.id).catch(() => { /* offline */ });
                      }}>{${T('حذف', 'Delete')}}</button>
                  )}
                </header>
                {p.text ? <p className="post-text">{p.text}</p> : null}
                {p.image ? <div className="post-media"><img src={p.image} alt="" /></div> : null}
                <footer className="post-acts">
                  <button className={'act' + (p.likes.includes(me.handle) ? ' on' : '')} type="button" onClick={() => toggleLike(p.id)}>
                    ♥ {p.likes.length}
                  </button>
                  <button className="act" type="button" onClick={() => setOpenComments(openComments === p.id ? '' : p.id)}>
                    💬 {p.comments.length}
                  </button>
                </footer>
                {openComments === p.id ? (
                  <div className="comments">
                    {p.comments.map(c => (
                      <p className="comment" key={c.id}><b>{c.author}</b> <span>{c.text}</span></p>
                    ))}
                    <form className="toolbar" onSubmit={(e) => { e.preventDefault(); addComment(p.id); }}>
                      <input className="search" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder={${T('اكتب تعليقاً…', 'Write a comment…')}} />
                      <button className="btn tiny" type="submit" disabled={!commentText.trim()}>{${T('علّق', 'Comment')}}</button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
`;
}

/* ── engine 6: shop — a storefront that can actually take an order ───────── */

/**
 * THE SIXTH ENGINE, and the answer to «هل انت فاقد للذاكره».
 *
 * The product grid and the cart WERE built — in the static page builder. A
 * React store had neither, and «e-commerce platform» detected as `inventory`,
 * so the one request that most obviously needed a shop got a stock list with
 * prices on it: nothing to browse, nothing to add, nothing anyone could buy.
 *
 * Three things separate a shop from a records app, and all three are here:
 *   1. a CATALOGUE a customer reads — cards with a photo, a price, a category
 *      filter and a search box
 *   2. a CART that survives a reload — quantities, a running total, a badge
 *   3. a CHECKOUT that writes a REAL order to the server's /api/orders, so the
 *      merchant reads it in Joe's inbox rather than in a toast that vanishes
 *
 * Plus the merchant's own side: add a product, and it goes to the catalogue
 * endpoint so it is there for the next visitor, not just in this browser.
 */
export function fileShopAppJsx(isAr: boolean): string {
    const T = (ar: string, en: string) => `'${q(isAr ? ar : en)}'`;
    return `import React, { useEffect, useMemo, useState } from 'react';
import { createStore, uid, computeMetric, apiList, apiCreate, apiPost, apiSiblingLive } from '../app/store.js';

const money = (n) => {
  const v = Number(n || 0);
  return (Math.round(v * 100) / 100).toLocaleString();
};

/**
 * AN IMAGE ADDRESS A VISITOR CAN ACTUALLY FETCH.
 *
 * A row typed by the owner can hold anything in its image field — and one
 * really did: «"C:/Users/home/OneDrive/Pictures/Screenshots/rMdx….jpg"»,
 * quotation marks and all, pasted from a file browser. The catalogue rendered
 * it, every card showed a broken-image icon, and the server answered 404 for
 * a path that exists on exactly one computer on earth.
 *
 * The build-time guard cannot help here: these values arrive from the DATABASE
 * at runtime. So the card asks the same question the builder does, and shows
 * its placeholder instead of a broken picture.
 */
const webImage = (raw) => {
  let v = String(raw ?? '').trim();
  while (v && (v[0] === '"' || v[0] === "'")) v = v.slice(1);
  while (v && (v[v.length - 1] === '"' || v[v.length - 1] === "'")) v = v.slice(0, -1);
  v = v.trim();
  if (!v) return '';
  const low = v.toLowerCase();
  // Plain string work, no regex: this file is GENERATED from a template
  // literal, and every backslash in a pattern is one collapse away from an
  // unparseable bundle. Not a theory: the first version of this helper used
  // patterns, every escape in them was eaten on the way out, and the store
  // shipped a file that would not parse. The syntax gate caught it.
  if (low.indexOf('data:') === 0 || low.indexOf('http://') === 0
    || low.indexOf('https://') === 0 || low.indexOf('//') === 0) return v;
  const BACKSLASH = String.fromCharCode(92);
  if (low.indexOf('file:') === 0) return '';
  if (v.indexOf(BACKSLASH) >= 0) return '';
  if (v.length > 2 && v[1] === ':') return '';
  for (const root of ['/home/', '/users/', '/root/', '/var/', '/tmp/', '/mnt/']) {
    if (low.indexOf(root) === 0) return '';
  }
  return v;
};

export default function ShopApp({ content }) {
  const catalogue = useMemo(() => createStore(content.storeKey + ':products'), [content.storeKey]);
  const basket = useMemo(() => createStore(content.storeKey + ':cart'), [content.storeKey]);

  const [products, setProducts] = useState(() => catalogue.read());
  const [cart, setCart] = useState(() => basket.read());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState(false);
  const [draft, setDraft] = useState({ name: '', price: '', category: '', description: '', image: '', stock: '' });
  const [notice, setNotice] = useState('');
  const [order, setOrder] = useState({ customer: '', phone: '', note: '' });
  const [server, setServer] = useState(false);

  useEffect(() => { catalogue.write(products); }, [products, catalogue]);
  useEffect(() => { basket.write(cart); }, [cart, basket]);

  // The catalogue lives on the server when this project has one. Failure is
  // silent and local rows stay the truth — the badge never claims a server
  // that did not answer.
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await apiList(content.api);
      if (!alive || !remote) return;
      setServer(true);
      setProducts(prev => {
        const seen = new Set(prev.map(p => String(p.id)));
        const extra = remote.filter(p => p && !seen.has(String(p.id)));
        return extra.length ? [...extra.map(p => ({ ...p, id: String(p.id || uid()) })), ...prev] : prev;
      });
    })();
    return () => { alive = false; };
  }, [content.api]);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => String(p.category || '').trim()).filter(Boolean));
    return [...set];
  }, [products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(p => {
      if (category && String(p.category || '') !== category) return false;
      if (!needle) return true;
      return [p.name, p.description, p.category].some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [products, query, category]);

  const lines = useMemo(
    () => cart.map(c => ({ ...c, product: products.find(p => String(p.id) === String(c.id)) })).filter(l => l.product),
    [cart, products],
  );
  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.product.price || 0) * l.qty, 0), [lines]);
  const count = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const add = (product) => {
    setCart(prev => {
      const found = prev.find(c => String(c.id) === String(product.id));
      return found
        ? prev.map(c => (String(c.id) === String(product.id) ? { ...c, qty: c.qty + 1 } : c))
        : [...prev, { id: String(product.id), qty: 1 }];
    });
    setNotice(${T('أُضيف إلى السلة: ', 'Added to cart: ')} + product.name);
    setTimeout(() => setNotice(''), 2200);
  };
  const setQty = (id, qty) => setCart(prev => (qty <= 0
    ? prev.filter(c => String(c.id) !== String(id))
    : prev.map(c => (String(c.id) === String(id) ? { ...c, qty } : c))));

  /**
   * A REAL ORDER, or an honest refusal.
   *
   * With a backend the order becomes a row the merchant reads. Without one it
   * is kept in this browser and SAID SO — never a "thank you for your order"
   * for an order that went nowhere.
   */
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState('');
  const checkout = async (e) => {
    e.preventDefault();
    if (!lines.length) return;
    if (!String(order.customer || '').trim()) { setNotice(${T('اكتب اسمك أولاً.', 'Your name, first.')}); return; }
    setPlacing(true);
    const items = lines.map(l => l.product.name + ' ×' + l.qty).join('، ');
    const endpoint = await apiSiblingLive(content.api, 'orders');
    const sent = endpoint ? await apiPost(endpoint, '', {
      item: items, qty: count, customer: order.customer, phone: order.phone,
      note: (order.note || '') + ' — ' + ${T('الإجمالي: ', 'Total: ')} + money(total),
    }) : null;
    setPlacing(false);
    if (sent) {
      setPlaced(${T('وصل طلبك إلى المتجر. سنتواصل معك.', 'Your order reached the store. We will be in touch.')});
      setCart([]);
      setOrder({ customer: '', phone: '', note: '' });
    } else {
      setPlaced(${T('لا يوجد خادم متصل، فحُفظ الطلب في هذا المتصفح فقط — لم يصل إلى المتجر بعد.', 'No server is connected, so the order is saved in this browser only — it has not reached the store.')});
    }
    setTimeout(() => setPlaced(''), 6000);
  };

  const addProduct = (e) => {
    e.preventDefault();
    if (!String(draft.name || '').trim()) return;
    const product = { ...draft, id: uid(), createdAt: new Date().toISOString() };
    setProducts([product, ...products]);
    apiCreate(content.api, product);
    setDraft({ name: '', price: '', category: '', description: '', image: '', stock: '' });
  };

  return (
    <div className="wrap">
      <section className="stats" aria-label={${T('الأرقام', 'Numbers')}}>
        {content.metrics.map((m, i) => (
          <div className="stat" key={i}><i className="stat-ico" aria-hidden="true">{({count:'🧾',sum:'💰',todaySum:'📅',todayCount:'📅',sumProduct:'📦',avg:'📈',countWhere:'✅'})[m.kind] || '📊'}</i><div><b>{computeMetric(m, products)}</b><span>{m.label}</span></div></div>
        ))}
        <div className="stat"><i className="stat-ico" aria-hidden="true">🛒</i><div><b>{count}</b><span>{${T('في السلة', 'In cart')}}</span></div></div>
      </section>

      <section className="panel shop-bar">
        <input
          className="grow" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={${T('ابحث عن منتج…', 'Search products…')}} aria-label={${T('بحث', 'Search')}}
        />
        <select value={category} onChange={e => setCategory(e.target.value)} aria-label={${T('التصنيف', 'Category')}}>
          <option value="">{${T('كل التصنيفات', 'All categories')}}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" className="primary" data-cart-open onClick={() => setOpen(true)}>
          {${T('السلة', 'Cart')}} <span data-cart-count className="badge">{count}</span>
        </button>
        <button type="button" onClick={() => setMerchant(v => !v)}>
          {merchant ? ${T('عرض المتجر', 'View store')} : ${T('لوحة التاجر', 'Merchant panel')}}
        </button>
        {server ? <span className="tag live">{${T('متصل بالخادم', 'Server connected')}}</span> : null}
      </section>

      {notice ? <p className="notice" role="status">{notice}</p> : null}

      {merchant ? (
        <section className="panel">
          <h2>{${T('أضف منتجاً', 'Add a product')}}</h2>
          <form className="grid-form" onSubmit={addProduct}>
            {content.fields.map(f => (
              <label key={f.key}>
                <span>{f.label}</span>
                {f.type === 'textarea'
                  ? <textarea value={draft[f.key] || ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
                  : <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={draft[f.key] || ''}
                      onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}
                    />}
              </label>
            ))}
            <button className="primary" type="submit">{${T('حفظ المنتج', 'Save product')}}</button>
          </form>
        </section>
      ) : null}

      {visible.length === 0 ? (
        <p className="empty">{content.emptyHint}</p>
      ) : (
        <section className="products" aria-label={${T('المنتجات', 'Products')}}>
          {visible.map(p => (
            <article className="product" key={p.id}>
              {webImage(p.image) ? <img src={webImage(p.image)} alt={p.name} loading="lazy" /> : <div className="product-noimg" aria-hidden="true" />}
              <h3>{p.name}</h3>
              {p.category ? <span className="tag">{p.category}</span> : null}
              {p.description ? <p>{p.description}</p> : null}
              <div className="product-foot">
                <b>{money(p.price)}</b>
                <button type="button" className="primary" onClick={() => add(p)}>
                  {${T('أضف إلى السلة', 'Add to cart')}}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {open ? (
        <aside className="cart-panel" role="dialog" aria-label={${T('السلة', 'Cart')}}>
          <header>
            <b>{${T('سلتك', 'Your cart')}}</b>
            <button type="button" onClick={() => setOpen(false)} aria-label={${T('إغلاق', 'Close')}}>×</button>
          </header>
          {lines.length === 0 ? <p className="empty">{${T('السلة فارغة.', 'Your cart is empty.')}}</p> : (
            <>
              <ul className="cart-lines">
                {lines.map(l => (
                  <li key={l.id}>
                    <span className="cart-name">{l.product.name}</span>
                    <span className="qty">
                      <button type="button" onClick={() => setQty(l.id, l.qty - 1)} aria-label={${T('إنقاص', 'Decrease')}}>−</button>
                      <b>{l.qty}</b>
                      <button type="button" onClick={() => setQty(l.id, l.qty + 1)} aria-label={${T('زيادة', 'Increase')}}>+</button>
                    </span>
                    <span>{money(Number(l.product.price || 0) * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <p className="cart-total"><span>{${T('الإجمالي', 'Total')}}</span><b>{money(total)}</b></p>
              <form className="grid-form" onSubmit={checkout}>
                <label><span>{${T('الاسم', 'Name')}}</span>
                  <input value={order.customer} onChange={e => setOrder({ ...order, customer: e.target.value })} required />
                </label>
                <label><span>{${T('الهاتف', 'Phone')}}</span>
                  <input value={order.phone} onChange={e => setOrder({ ...order, phone: e.target.value })} />
                </label>
                <label><span>{${T('ملاحظة', 'Note')}}</span>
                  <input value={order.note} onChange={e => setOrder({ ...order, note: e.target.value })} />
                </label>
                <button className="primary" type="submit" disabled={placing}>
                  {placing ? ${T('يُرسل…', 'Sending…')} : ${T('أرسل الطلب', 'Place the order')}}
                </button>
              </form>
            </>
          )}
          {placed ? <p className="notice" role="status">{placed}</p> : null}
        </aside>
      ) : null}
    </div>
  );
}
`;
}

/**
 * The shop's own styling. The app CSS covers panels, forms and stats; a
 * storefront additionally needs a product grid that reads like a catalogue and
 * a cart that slides over the page instead of pushing it around.
 */
export function fileShopCss(): string {
    return `
.shop-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.shop-bar .grow { flex: 1 1 220px; }
.badge { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 999px; background: rgba(255,255,255,.22); font-size: 12px; font-weight: 700; }
.products { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-top: 18px; }
.product { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px;
  background: var(--surface); border: 1px solid var(--line); }
.product img, .product-noimg { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; background: var(--line); }
.product h3 { margin: 0; font-size: 15px; }
.product p { margin: 0; font-size: 13px; opacity: .75; line-height: 1.6; }
.product-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.product-foot b { font-size: 16px; }
.tag { align-self: flex-start; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--line); }
.tag.live { background: rgba(16,185,129,.15); color: #059669; }
.cart-panel { position: fixed; inset-block: 0; inset-inline-end: 0; width: min(400px, 92vw); z-index: 60;
  display: flex; flex-direction: column; gap: 12px; padding: 18px; overflow: auto;
  background: var(--surface); border-inline-start: 1px solid var(--line); box-shadow: 0 0 40px rgba(0,0,0,.25); }
.cart-panel header { display: flex; align-items: center; justify-content: space-between; }
.cart-panel header button { border: 0; background: transparent; font-size: 22px; cursor: pointer; color: inherit; }
.cart-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.cart-lines li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 14px; }
.cart-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qty { display: inline-flex; align-items: center; gap: 8px; }
.qty button { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: transparent; cursor: pointer; color: inherit; }
.cart-total { display: flex; justify-content: space-between; font-size: 15px; padding-top: 10px; border-top: 1px solid var(--line); }
.notice { margin: 10px 0 0; font-size: 13px; padding: 8px 12px; border-radius: 10px; background: rgba(16,185,129,.12); }
`;
}
