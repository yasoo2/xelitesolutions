import { chromium, type Browser, type BrowserContext, type Page, type Locator, type LaunchOptions } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';

/* ============================================================
   PER-USER ENCRYPTED SESSION PERSISTENCE
   ------------------------------------------------------------
   Each browser session (which is per-user in the online model) can persist its
   login state (cookies + origin localStorage = Playwright "storageState") so the
   user logs in ONCE and stays logged in — WITHOUT storing any password. The blob
   is encrypted at rest (AES-256-GCM) with a key derived per-session from a master
   secret, so one user's sessions are cryptographically isolated from another's.
   This is the shared foundation for both local (single user) and future online
   (hundreds of isolated users) operation.
   ============================================================ */
const SESSION_STATE_DIR = process.env.BROWSER_SESSION_DIR
  || path.join(process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', 'browser-sessions');

/** A stable, filesystem-safe id for a session's stored state. */
function sessionStateFile(sessionId: string): string {
  const hash = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 40);
  return path.join(SESSION_STATE_DIR, `${hash}.enc`);
}

/** Per-session key derived from a master secret so users are isolated. */
function sessionKey(sessionId: string): Buffer {
  const master = process.env.BROWSER_SESSION_SECRET || process.env.JWT_SECRET || 'joe-local-browser-secret';
  return crypto.createHash('sha256').update(`${master}::${sessionId}`).digest(); // 32 bytes
}

/** Persist the current login/session state for a browser session (encrypted). */
export async function saveBrowserSession(sessionId: string): Promise<{ ok: boolean; error?: string; origins?: number; cookies?: number }> {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return { ok: false, error: 'no_active_session' };
  try {
    const storage = await s.context.storageState();
    // Never persist an empty state — otherwise "logout then close" would recreate a
    // meaningless state file and make hasSavedBrowserSession lie. Logout (which
    // deletes the file) must stay logged out.
    if (!storage.cookies?.length && !storage.origins?.length) {
      return { ok: true, origins: 0, cookies: 0 };
    }
    const plaintext = Buffer.from(JSON.stringify(storage), 'utf-8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(sid), iv);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.mkdirSync(SESSION_STATE_DIR, { recursive: true });
    // Layout: [12-byte iv][16-byte tag][ciphertext]
    fs.writeFileSync(sessionStateFile(sid), Buffer.concat([iv, tag, enc]));
    return { ok: true, origins: storage.origins?.length || 0, cookies: storage.cookies?.length || 0 };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'save_failed' };
  }
}

/** Load & decrypt a saved session state (returns undefined if none/invalid). */
function loadBrowserSessionState(sessionId: string): any | undefined {
  const sid = String(sessionId || '').trim();
  const file = sessionStateFile(sid);
  try {
    if (!fs.existsSync(file)) return undefined;
    const blob = fs.readFileSync(file);
    if (blob.length < 28) return undefined;
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const enc = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(sid), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
  } catch {
    return undefined; // corrupt or wrong key -> start fresh
  }
}

/** Whether a saved (logged-in) session exists for this session id. */
export function hasSavedBrowserSession(sessionId: string): boolean {
  try { return fs.existsSync(sessionStateFile(String(sessionId || '').trim())); } catch { return false; }
}

/** Forget a saved session (logout / privacy). Also clears the live context. */
export async function clearBrowserSession(sessionId: string): Promise<{ ok: boolean }> {
  const sid = String(sessionId || '').trim();
  try { const f = sessionStateFile(sid); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  try { const s = sessions.get(sid); if (s) await s.context.clearCookies(); } catch { /* ignore */ }
  return { ok: true };
}

/** Debounced AUTOMATIC save of a session's login state once navigation settles, so
 *  any sign-in the user performs inside Joe's browser persists forever WITHOUT a
 *  manual "save" step. This is what makes "log into the site once, stay logged in
 *  across every later prompt" actually true. */
function scheduleSessionSave(sessionId: string, delayMs = 2500) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  if (s.saveTimer) { try { clearTimeout(s.saveTimer); } catch { /* ignore */ } }
  s.saveTimer = setTimeout(() => {
    s.saveTimer = null;
    void saveBrowserSession(sid).then(r => {
      if (r.ok && (r.cookies || 0) > 0) {
        try { console.log(`[BrowserManager] Auto-saved login state for ${sid} (${r.cookies} cookies)`); } catch { /* ignore */ }
      }
    }).catch(() => { /* non-fatal */ });
  }, delayMs);
  try { (s.saveTimer as any).unref?.(); } catch { /* ignore */ }
}

/* ============================================================
   LOCAL CHROME PROFILE MODE  (opt-in, per-user)
   ------------------------------------------------------------
   When enabled, Joe drives a REAL, persistent Chrome profile per session instead
   of a throwaway incognito context. The user logs into their own accounts ONCE
   inside Joe's window and stays logged in forever (the profile keeps cookies,
   localStorage, extensions, consent choices). This is "each user with their own
   account", and it's gated behind an explicit one-time CONSENT the user grants.
   Enable with USE_SYSTEM_CHROME=1 (uses the installed Google Chrome) or
   BROWSER_PERSISTENT_PROFILE=1 (uses the bundled Chromium as a persistent profile).
   ============================================================ */
export function isPersistentBrowserMode(): boolean {
  return (parseBool(process.env.USE_SYSTEM_CHROME) ?? false)
    || (parseBool(process.env.BROWSER_PERSISTENT_PROFILE) ?? false)
    // Asking for the user's real profile IS asking for a persistent one; the
    // flag used to be silently inert unless one of the two above was also set.
    || (parseBool(process.env.USE_USER_BROWSER_PROFILE) ?? false);
}

/** True when Joe should inherit the user's REAL browser profile (their existing
 *  logins) instead of a dedicated Joe profile. */
export function isUserRealProfileMode(): boolean {
  return (parseBool(process.env.USE_USER_BROWSER_PROFILE) ?? false);
}

/** Detect the user's REAL default-browser profile directory so Joe opens already
 *  logged in with the SAME account the user uses (Google, etc.) — no sign-in.
 *  Windows paths; an explicit BROWSER_USER_DATA_DIR (+ BROWSER_CHANNEL) wins.
 *  Returns { userDataDir, channel } or null when none is found. */
export function getUserRealBrowserProfile(): { userDataDir: string; channel?: string; name: string } | null {
  const envDir = (process.env.BROWSER_USER_DATA_DIR || '').trim();
  if (envDir && fs.existsSync(envDir)) return { userDataDir: envDir, channel: (process.env.BROWSER_CHANNEL || 'chrome').trim() || undefined, name: 'مخصّص' };
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const macHome = os.homedir();
  const candidates: { dir: string; channel?: string; name: string }[] = [
    // Windows
    { dir: path.join(local, 'Google', 'Chrome', 'User Data'), channel: 'chrome', name: 'Chrome' },
    { dir: path.join(local, 'Microsoft', 'Edge', 'User Data'), channel: 'msedge', name: 'Edge' },
    { dir: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'), name: 'Brave' },
    { dir: path.join(roaming, 'Opera Software', 'Opera Stable'), name: 'Opera' },
    { dir: path.join(local, 'Chromium', 'User Data'), name: 'Chromium' },
    // macOS
    { dir: path.join(macHome, 'Library', 'Application Support', 'Google', 'Chrome'), channel: 'chrome', name: 'Chrome' },
    { dir: path.join(macHome, 'Library', 'Application Support', 'Microsoft Edge'), channel: 'msedge', name: 'Edge' },
    // Linux
    { dir: path.join(macHome, '.config', 'google-chrome'), channel: 'chrome', name: 'Chrome' },
    { dir: path.join(macHome, '.config', 'microsoft-edge'), channel: 'msedge', name: 'Edge' },
    { dir: path.join(macHome, '.config', 'chromium'), name: 'Chromium' },
  ];
  for (const c of candidates) { try { if (fs.existsSync(c.dir)) return { userDataDir: c.dir, channel: c.channel, name: c.name }; } catch { /* ignore */ } }
  return null;
}

/** Per-session Chrome profile directory (isolated per user in the online model).
 *  Defaults to a stable per-OS location (not /tmp) so logins survive restarts. */
export function getBrowserProfileDir(sessionId: string): string {
  const base = process.env.BROWSER_PROFILE_DIR
    || path.join(process.env.USERPROFILE || os.homedir() || '.', '.joe', 'chrome-profiles');
  const safe = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 32);
  return path.join(base, safe);
}

/* ============================================================
   HIS REAL BROWSER, WITHOUT ASKING HIM TO CLOSE IT.
   ============================================================
   Chrome guards a profile directory with a single-process lock: while his
   window is open, nothing else may open the same «User Data» folder. That one
   fact is why USE_USER_BROWSER_PROFILE has been pinned to "0" — the feature
   worked only if he first closed the browser he was using, which is no feature
   at all.

   A profile is not, however, only a folder that is locked. The part that
   carries his LOGINS is a handful of small files, and copying them into a
   folder Joe owns produces a Chrome that opens already signed in — beside his
   own window, not instead of it. The copy is made on his machine, by his own
   OS user, and never leaves it: Chrome's cookie key lives in «Local State»
   sealed by the OS to that same user, so this works there and nowhere else,
   which is exactly the property that makes it safe.

   Caches are deliberately left behind. They are the bulk of a profile and none
   of the value.
   ============================================================ */
const CLONE_PROFILE_FILES = [
  'Cookies', 'Cookies-journal',
  'Login Data', 'Login Data For Account',
  'Web Data', 'Preferences', 'Secure Preferences', 'Trust Tokens',
];
// «Network» is where Chrome has kept the cookie jar since v96; «Local Storage»
// is where half the web keeps its session token. IndexedDB is left out on
// purpose — it can be gigabytes of offline app data and holds no login.
const CLONE_PROFILE_DIRS = ['Network', 'Local Storage'];
const CACHE_DIR_RE = /[\\/](Cache|Code Cache|GPUCache|ScriptCache|DawnCache|Service Worker|Extension State|blob_storage)([\\/]|$)/i;

/**
 * Copy the login-bearing parts of the user's real profile into a directory Joe
 * can open while their browser stays running. Returns the new user-data-dir.
 */
export function cloneRealBrowserProfile(real: { userDataDir: string; name: string }): string {
  const profileName = (process.env.BROWSER_PROFILE_NAME || 'Default').trim() || 'Default';
  const key = crypto.createHash('sha256').update(`${real.userDataDir}|${profileName}`).digest('hex').slice(0, 16);
  const dest = process.env.BROWSER_PROFILE_CLONE_DIR
    || path.join(process.env.USERPROFILE || os.homedir() || '.', '.joe', 'real-profile-clones', key);
  const destProfile = path.join(dest, 'Default');
  fs.mkdirSync(destProfile, { recursive: true });
  // Chrome asks its first-run questions once per user-data-dir; this answers them.
  try { fs.writeFileSync(path.join(dest, 'First Run'), ''); } catch { /* optional */ }

  const copy = (from: string, to: string): boolean => {
    try {
      const st = fs.statSync(from);
      if (st.isDirectory()) {
        fs.cpSync(from, to, {
          recursive: true, force: true,
          filter: (s: string) => {
            if (CACHE_DIR_RE.test(s)) return false;
            // One oversized blob inside a profile is never a credential.
            try { const st2 = fs.statSync(s); if (st2.isFile() && st2.size > 64 * 1024 * 1024) return false; } catch { /* keep */ }
            return true;
          },
        });
        return true;
      }
      if (st.size > 256 * 1024 * 1024) return false;   // a profile file that big is a cache in disguise
      fs.copyFileSync(from, to);
      return true;
    } catch { return false; }
  };

  // «Local State» holds the key the cookies are encrypted with — without it the
  // copied cookie jar is unreadable noise, and the clone signs in to nothing.
  copy(path.join(real.userDataDir, 'Local State'), path.join(dest, 'Local State'));
  const src = path.join(real.userDataDir, profileName);
  for (const f of CLONE_PROFILE_FILES) copy(path.join(src, f), path.join(destProfile, f));
  for (const d of CLONE_PROFILE_DIRS) copy(path.join(src, d), path.join(destProfile, d));
  return dest;
}

/** A locked profile is his own browser being open — the normal case, not an error. */
function isProfileLockError(msg: string): boolean {
  return /ProcessSingleton|SingletonLock|already (running|in use)|cannot create|being used|profile appears to be in use|failed to create a unique/i.test(msg);
}

// ---- Consent: Joe must ask before driving the user's local browser profile ----
const CONSENT_DIR = process.env.BROWSER_CONSENT_DIR
  || path.join(process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', 'browser-consent');
function consentFile(sessionId: string): string {
  const hash = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 40);
  return path.join(CONSENT_DIR, `${hash}.ok`);
}
/** Whether this session's user has approved Joe using their local browser profile. */
export function hasBrowserConsent(sessionId: string): boolean {
  if (!isPersistentBrowserMode()) return true; // consent only matters in profile mode
  try { return fs.existsSync(consentFile(String(sessionId || '').trim())); } catch { return false; }
}
/** Record the user's approval (persisted, so we ask only once). */
export function grantBrowserConsent(sessionId: string): { ok: boolean } {
  try { fs.mkdirSync(CONSENT_DIR, { recursive: true }); fs.writeFileSync(consentFile(String(sessionId || '').trim()), new Date().toISOString()); return { ok: true }; }
  catch { return { ok: false }; }
}
/** Revoke approval (privacy / logout). */
export function revokeBrowserConsent(sessionId: string): { ok: boolean } {
  try { const f = consentFile(String(sessionId || '').trim()); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  return { ok: true };
}

type SessionState = {
  browser: Browser | null; // null when launched as a persistent profile context
  context: BrowserContext;
  page: Page;
  allowedOrigin: string | null;
  streaming: boolean;
  streamTimer: NodeJS.Timeout | null;
  maskLocators: Locator[];
  captureLocked: boolean;
  viewport: { w: number; h: number };
  lastUsedAt: number;
  saveTimer: NodeJS.Timeout | null; // debounced auto-save of login state
};

const sessions = new Map<string, SessionState>();
/**
 * Sessions a live panel is currently WATCHING. Membership means «stream to me
 * when a browser exists» — never «open one for me». See startStreaming.
 */
const watched = new Set<string>();

/** True when a browser session is live on a REAL page (not blank/about:blank) —
 *  i.e. the user is currently looking at a loaded site. Used by the planner to
 *  route bare interaction verbs («اضغط على الزر») as a CONTINUATION of that page
 *  instead of a fresh request or a text answer. Defaults to the panel session. */
export function hasLiveBrowserPage(sessionId = 'panel-browser'): boolean {
  const s = sessions.get(String(sessionId || '').trim());
  if (!s) return false;
  try {
    const u = String(s.page.url() || '');
    return !!u && u !== 'about:blank' && !u.startsWith('chrome://');
  } catch { return false; }
}

function broadcastStatus(sessionId: string, s: SessionState, extra?: { workerStatus?: string; blockingReason?: string }) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  let url = '';
  try {
    url = s.page.url() || '';
  } catch {
    url = '';
  }
  broadcastBrowserEvent(sid, {
    type: 'session_status',
    ts: Date.now(),
    sessionId: sid,
    url,
    workerStatus: (extra?.workerStatus || 'idle') as any,
    blockingReason: extra?.blockingReason as any,
  });
}

function parseBool(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return undefined;
}

function parseViewport(raw: string | undefined) {
  const fallback = { w: 1280, h: 720 };
  if (!raw) return fallback;
  const m = String(raw).trim().match(/^(\d{2,5})\s*[x,]\s*(\d{2,5})$/i);
  if (!m) return fallback;
  const w = Math.max(320, Math.min(3840, Number(m[1])));
  const h = Math.max(240, Math.min(2160, Number(m[2])));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return fallback;
  return { w, h };
}

export function getBrowserViewport() {
  return parseViewport(process.env.BROWSER_VIEWPORT);
}

/**
 * Locate an installed Chromium executable so the browser launches reliably even
 * when Playwright's default resolved path doesn't match what's installed (the
 * "browser doesn't work at all" case). Checks an explicit env override, then
 * Playwright's own resolved path, then scans PLAYWRIGHT_BROWSERS_PATH.
 */
export function findChromiumExecutable(): string | undefined {
  const envPath = (process.env.BROWSER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '').trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  // Playwright's own resolved path (works when the matching build is installed).
  try {
    const pw = require('playwright');
    const p = pw?.chromium?.executablePath?.();
    if (p && fs.existsSync(p)) return p;
  } catch { /* ignore */ }

  // Scan the browsers cache for any installed chromium build (any version).
  const base = (process.env.PLAYWRIGHT_BROWSERS_PATH || '').trim();
  if (base && fs.existsSync(base)) {
    try {
      const dirs = fs.readdirSync(base).filter((d) => /^chromium(-|_)/.test(d));
      for (const d of dirs) {
        const candidates = [
          path.join(base, d, 'chrome-linux', 'chrome'),
          path.join(base, d, 'chrome-linux', 'headless_shell'),
          path.join(base, d, 'chrome-win', 'chrome.exe'),
          path.join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        ];
        for (const c of candidates) { if (fs.existsSync(c)) return c; }
      }
    } catch { /* ignore */ }
  }

// A local Joe installation must still work when Playwright's optional browser
  // download was skipped. Search well-known system-browser locations last: the
  // explicit override and a version-matched Playwright browser always win.
  const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const systemCandidates = [
    // Linux distributions and common container images.
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/opt/google/chrome/chrome',
    // Windows installs (Joe's primary local target).
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    // macOS installs.
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const candidate of systemCandidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function getChromiumLaunchOptions(): LaunchOptions {
  const headlessEnv = parseBool(process.env.BROWSER_HEADLESS);
  const headedEnv = parseBool(process.env.BROWSER_HEADED) ?? parseBool(process.env.BROWSER_HEADFUL);
  const headless = headlessEnv !== undefined ? headlessEnv : headedEnv ? false : true;

  const args: string[] = [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-gl=swiftshader',
    '--use-angle=swiftshader',
    // Hide the automation flag so navigator.webdriver isn't true (bot-detection tell).
    '--disable-blink-features=AutomationControlled',
  ];
  const noSandbox = parseBool(process.env.BROWSER_NO_SANDBOX) ?? parseBool(process.env.BROWSER_DISABLE_SANDBOX);
  if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');

  const opts: LaunchOptions = { headless, args, ignoreDefaultArgs: ['--enable-automation'] };
  const exe = findChromiumExecutable();
  if (exe) opts.executablePath = exe;
  return opts;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function tryAcquireCaptureLock(s: SessionState, wait: boolean, timeoutMs: number) {
  const startedAt = Date.now();
  while (s.captureLocked) {
    if (!wait) return false;
    if (Date.now() - startedAt > timeoutMs) return false;
    await sleep(50);
  }
  s.captureLocked = true;
  return true;
}

async function captureJpeg(
  s: SessionState,
  opts: { quality: number; timeoutMs: number; mask?: Locator[]; waitForLock: boolean },
) {
  const locked = await tryAcquireCaptureLock(s, opts.waitForLock, opts.timeoutMs);
  if (!locked) return null;
  try {
    return await s.page.screenshot({
      type: 'jpeg',
      quality: opts.quality,
      animations: 'disabled',
      /**
       * THE STREAM MUST NOT EDIT THE PAGE IT IS FILMING.
       *
       * Playwright's default `caret: 'hide'` writes
       * `style="caret-color: transparent !important"` onto every input before
       * the shot and strips it afterwards. At stream FPS that is a DOM
       * mutation six times a second — and the self-QA decides «this button is
       * dead» by comparing the DOM before and after a click. Measured on an
       * idle page with nothing clicked: the body fingerprint flipped between
       * two values in 11 of 25 samples, so on any page with a form the verdict
       * on a dead button was part coin-flip.
       *
       * A blinking caret costs one JPEG artefact. A camera that rewrites the
       * subject costs the measurement.
       */
      caret: 'initial',
      timeout: opts.timeoutMs,
      mask: opts.mask && opts.mask.length ? opts.mask : undefined,
    });
  } finally {
    s.captureLocked = false;
  }
}

export async function screenshotSessionJpeg(sessionId: string, opts?: { quality?: number; timeoutMs?: number }) {
  const sid = String(sessionId || '').trim();
  const s = await getBrowserSession(sid);
  const quality = Math.max(1, Math.min(100, Number(opts?.quality ?? 55)));
  const timeoutMs = Math.max(1000, Number(opts?.timeoutMs ?? 60000));
  const buf = await captureJpeg(s, { quality, timeoutMs, waitForLock: true });
  if (!buf) throw new Error('screenshot_failed');
  return buf;
}

let activeRuns = 0;
const runWaiters: Array<() => void> = [];

export async function withBrowserConcurrency<T>(fn: () => Promise<T>) {
  const max = Math.max(1, Math.min(8, Number(process.env.BROWSER_MAX_CONCURRENCY || 1)));
  if (activeRuns >= max) {
    await new Promise<void>((resolve) => runWaiters.push(resolve));
  }
  activeRuns += 1;
  try {
    return await fn();
  } finally {
    activeRuns -= 1;
    const next = runWaiters.shift();
    if (next) next();
  }
}

export function touchSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.lastUsedAt = Date.now();
}

let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanupLoop() {
  if (cleanupTimer) return;
  const tickMs = 60_000;
  cleanupTimer = setInterval(() => {
    const idleMs = Math.max(60_000, Number(process.env.BROWSER_IDLE_TIMEOUT_MS || 900_000));
    const cutoff = Date.now() - idleMs;
    for (const [sid, s] of sessions.entries()) {
      if (s.lastUsedAt < cutoff) {
        void stopSession(sid);
      }
    }
  }, tickMs);
  try {
    (cleanupTimer as any).unref?.();
  } catch { }
}

/**
 * AND WHEN IT DIES ANYWAY, IT LEAVES A NOTE.
 *
 * His machine passed every step of the standalone diagnosis — Chromium up in
 * 271ms, panel session up in 856ms, the audit BORROWING the panel — while the
 * same audit inside the running server fell back to a private browser on every
 * build. So the fault is not the machine; it is something the server process
 * does that a fresh process does not, and no screenshot can show me that.
 *
 * Every failure to create a browser session is now written to
 * `api/data/browser-errors.log` WITH THE STAGE it died at, and the diagnosis
 * reads that file first. One build then one command, and the reason is on the
 * table instead of in a guess.
 */
export function browserErrorLogPath(): string {
  const override = String(process.env.JOE_BROWSER_ERROR_LOG || '').trim();
  if (override) return override;
  const isApiDir = path.basename(process.cwd()) === 'api';
  const root = isApiDir ? process.cwd() : path.join(process.cwd(), 'api');
  return path.join(root, 'data', 'browser-errors.log');
}

const BROWSER_LOG_MAX = 64 * 1024;

export function noteBrowserFailure(sessionId: string, stage: string, err: any): void {
  const entry = `[${new Date().toISOString()}] session=${sessionId} stage=${stage} :: `
    + String(err?.message || err || 'unknown').replace(/\s+/g, ' ').slice(0, 600) + '\n';
  try { console.error(`[BrowserManager] ${stage} failed for ${sessionId}: ${String(err?.message || err).slice(0, 200)}`); } catch { }
  try {
    const file = browserErrorLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let prev = '';
    try { prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''; } catch { prev = ''; }
    const next = (prev + entry);
    fs.writeFileSync(file, next.length > BROWSER_LOG_MAX ? next.slice(next.length - BROWSER_LOG_MAX) : next, 'utf-8');
  } catch { /* a log that cannot be written must not break a build */ }
}

/**
 * THE PANEL'S BROWSER IS NOT ALLOWED TO STAY DEAD.
 *
 * «لم يتحرك متصفح جو … كل شي وهمي». The audit's own private fallback launches
 * with the SAME executable and nearly the same options as this — so when the
 * panel session cannot start while the private one can, the difference is one
 * of the extras: a headed mode the machine will not give, a flag Chromium
 * rejects, a profile that is locked. Every one of those used to end as a throw
 * that nobody printed, and the panel he was told to watch stayed white forever.
 *
 * Configured options first; a bare headless launch second. Losing a preference
 * is a smaller failure than losing the browser.
 */
async function launchPlainChromium(): Promise<Browser> {
  const first = getChromiumLaunchOptions();
  try {
    return await chromium.launch(first);
  } catch (e1: any) {
    const bare: LaunchOptions = { headless: true };
    if (first.executablePath) bare.executablePath = first.executablePath;
    try {
      const b = await chromium.launch(bare);
      try { console.log(`[BrowserManager] Configured launch failed (${String(e1?.message || e1).slice(0, 120)}) — recovered with a bare headless launch.`); } catch { }
      return b;
    } catch (e2: any) {
      // The engine really is not there. Say exactly how to fix it.
      throw Object.assign(new Error(
        `browser_launch_failed: ${e1?.message || e1} | bare: ${e2?.message || e2}. ` +
        `تعذّر تشغيل متصفح Joe. شغّل هذا الأمر مرة واحدة داخل مجلد النظام: ` +
        `"npx playwright install chromium" ثم أعد التشغيل. ` +
        `(يمكن أيضاً ضبط BROWSER_EXECUTABLE_PATH على مسار Chrome/Chromium مثبّت لديك.)`
      ), { joeStage: 'launch' });
    }
  }
}

export async function createSession(sessionId: string) {
  const cfg = DEFAULT_BROWSER_CONFIG;
  const viewport = getBrowserViewport();

  let browser: Browser | null = null;
  let persistentContext: BrowserContext | null = null;
  const { BinaryService } = require('../services/BinaryService');

  /* MODIFIED: Logging and Fallback */
  let wsEndpoint = process.env.BROWSER_WS_ENDPOINT || '';

  if (process.env.BROWSER_DEBUG_LOG === 'true') {
    try {
      const logPath = path.join(__dirname, '../stream_debug.log');
      fs.appendFileSync(logPath, `[createSession] Env WS: '${wsEndpoint}'\n`);
    } catch { }
  }

  if (!wsEndpoint) {
    // No WS endpoint provided, will attempt local launch
  }

  const apiKey = process.env.WORKER_API_KEY || '';

  if (wsEndpoint) {
    // Determine connection URL (with auth if needed)
    // If wsEndpoint is the base URL (http://host:port), we might need to fetch the WS URL first or use connect({ wsEndpoint }) if it's direct.
    // However, playwright expects a direct WS url. 
    // Usually browser-worker returns { wsEndpoint: '...' } on start. But usually we want a persistent connection.
    // If the worker exposes `ws://host:port`, we use that.

    // Assuming standard Playwright server or compatible wrapper
    // If we have an API key, we might need to pass it in headers.
    // Retry logic for browser worker connection
    let attempt = 0;
    const maxRetries = 10;
    while (!browser) {
      try {
        browser = await chromium.connect(wsEndpoint, {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
        });
        /* MODIFIED: Log success */
        if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connected to ${wsEndpoint}\n`); } catch { } }
      } catch (e) {
        attempt++;
        if (attempt >= maxRetries) {
          if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Failed to connect after ${maxRetries} attempts\n`); } catch { } }
          throw e; // Final failure
        }
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff max 10s
        if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connection failed, retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})\n`); } catch { } }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } else if (isPersistentBrowserMode()) {
    // Persistent local profile: a REAL Chrome/Chromium profile that keeps the
    // user's logins across tasks. launchPersistentContext returns the CONTEXT
    // directly (there is no separate Browser handle — context.browser() is null).
    try {
      const base = getChromiumLaunchOptions();

      // Decide which profile to use: the user's REAL browser profile (so Joe is
      // already logged in with their account, no sign-in) when enabled and found;
      // otherwise a dedicated persistent Joe profile.
      const real = isUserRealProfileMode() ? getUserRealBrowserProfile() : null;
      const profileDir = real ? real.userDataDir : getBrowserProfileDir(sessionId);
      if (!real) fs.mkdirSync(profileDir, { recursive: true });

      const persistentOpts: any = {
        ...base,
        viewport: { width: viewport.w, height: viewport.h },
        locale: 'ar',
        acceptDownloads: true,
        // Reduce the "controlled by automation" banner / first-run noise, and hide
        // the automation flag that makes navigator.webdriver=true (what GitHub/Google
        // detect to block the login as a "bot").
        ignoreDefaultArgs: ['--enable-automation'],
        args: [...(base.args || []), '--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
      };
      // Prefer the channel matching the detected real browser (chrome/msedge), else
      // USE_SYSTEM_CHROME picks installed Chrome. Falls back to bundled Chromium.
      const wantChannel = real?.channel || ((parseBool(process.env.USE_SYSTEM_CHROME) ?? false) ? 'chrome' : '');
      if (wantChannel) { persistentOpts.channel = wantChannel; delete persistentOpts.executablePath; }
      let usedDir = profileDir;
      let usedWhat = real ? `user's real ${real.name} — inherits login` : (parseBool(process.env.USE_SYSTEM_CHROME) ?? false) ? 'system Chrome' : 'bundled Chromium';
      try {
        persistentContext = await chromium.launchPersistentContext(profileDir, persistentOpts);
      } catch (inner: any) {
        const msg = String(inner?.message || inner || '');
        // His browser is open on that profile. That used to end the attempt and
        // ask him to close it; now it just means Joe opens a copy beside it.
        if (real && isProfileLockError(msg) && (parseBool(process.env.BROWSER_CLONE_LOCKED_PROFILE) ?? true)) {
          const clone = cloneRealBrowserProfile(real);
          try {
            persistentContext = await chromium.launchPersistentContext(clone, persistentOpts);
            usedDir = clone;
            usedWhat = `copy of the user's real ${real.name} — logins carried over, their own window untouched`;
          } catch (second: any) {
            throw new Error(
              `browser_profile_locked: متصفحك (${real.name}) مفتوح، وتعذّر أيضاً فتح نسخة من ملفك الشخصي ` +
              `(${String(second?.message || second).slice(0, 160)}). أغلق نوافذ ${real.name} ثم أعد المحاولة، ` +
              `أو استخدم زر «🧩 متصفحي» عبر إضافة Joe Browser Connector.`
            );
          }
        } else {
          // channel not installed -> retry with the bundled Chromium (dedicated profile only).
          delete persistentOpts.channel;
          const exe = findChromiumExecutable(); if (exe) persistentOpts.executablePath = exe;
          const fallbackDir = real ? getBrowserProfileDir(sessionId) : profileDir;
          if (real) fs.mkdirSync(fallbackDir, { recursive: true });
          persistentContext = await chromium.launchPersistentContext(fallbackDir, persistentOpts);
          usedDir = fallbackDir;
          usedWhat = 'bundled Chromium (dedicated profile)';
        }
      }
      try { console.log(`[BrowserManager] Persistent profile launched: ${usedDir} (${usedWhat})`); } catch { }
    } catch (e: any) {
      const m = String(e?.message || e);
      /**
       * A locked or unusable PROFILE is not a reason to have no browser.
       * It used to be: the throw travelled up to the audit, which caught it
       * silently and ran somewhere he could not see — «كل شي وهمي». Joe now
       * opens a profile-less browser instead and says what it cost (saved
       * logins), which is a loss he can see and act on.
       */
      try {
        browser = await launchPlainChromium();
        persistentContext = null;
        console.log(`[BrowserManager] Persistent profile unavailable (${m.slice(0, 140)}) — running without it; saved logins are not available this run.`);
      } catch {
        if (m.startsWith('browser_profile_locked')) throw e; // pass the actionable message through
        throw new Error(
          `browser_launch_failed: ${m}. ` +
          `تعذّر تشغيل متصفح جو بملف التعريف الدائم. تأكّد من تثبيت Google Chrome، ` +
          `أو أزل USE_SYSTEM_CHROME لاستخدام Chromium المرفق.`
        );
      }
    }
  } else {
    browser = await launchPlainChromium();
  }

  if (!browser && !persistentContext) throw new Error('browser_connection_failed_after_retries');

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  // Restore this session's saved login state (per-user isolated, encrypted) so
  // the user stays logged in across tasks without re-entering credentials.
  const savedState = loadBrowserSessionState(sessionId);
  if (savedState) {
    try { console.log(`[BrowserManager] Restoring saved session for ${sessionId} (${savedState.cookies?.length || 0} cookies)`); } catch { }
  }

  // In persistent-profile mode the profile IS the login state, so we reuse the
  // context that launchPersistentContext already opened (and its first page).
  // Opt-in for users behind a TLS-inspecting corporate proxy (their proxy signs
  // pages with a CA the bundled Chromium doesn't trust). Default OFF.
  const ignoreHttpsErrors = (parseBool(process.env.BROWSER_IGNORE_HTTPS_ERRORS) ?? false);
  const baseContextOpts = {
    viewport: { width: viewport.w, height: viewport.h },
    locale: 'ar',
    userAgent: selectedUA,
    ignoreHTTPSErrors: ignoreHttpsErrors,
    extraHTTPHeaders: {
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    },
  };
  /**
   * AND A STALE LOGIN STATE IS NOT A REASON TO HAVE NO BROWSER EITHER.
   *
   * `storageState` is validated by Playwright: a cookie written by an older
   * Chromium — a `sameSite` it no longer accepts, a field it now requires —
   * makes newContext() THROW. The state decrypts fine, so the loader's own
   * guard never fires, and the session dies at creation. On a machine that has
   * one saved bad cookie that is EVERY run, for ever: the panel connects, the
   * audit falls back to a private browser, and the page never appears.
   */
  let context: BrowserContext;
  if (persistentContext) {
    context = persistentContext;
  } else {
    try {
      context = await browser!.newContext({ ...baseContextOpts, ...(savedState ? { storageState: savedState } : {}) });
    } catch (e: any) {
      if (!savedState) throw Object.assign(e, { joeStage: e?.joeStage || 'newContext' });
      context = await browser!.newContext(baseContextOpts);
      try {
        console.log(`[BrowserManager] Saved login state for ${sessionId} was rejected (${String(e?.message || e).slice(0, 140)}) — starting clean; you may need to sign in again.`);
      } catch { }
      // A state the browser refuses is a state that must not be tried again.
      try { fs.unlinkSync(sessionStateFile(String(sessionId || '').trim())); } catch { /* already gone */ }
    }
  }

  // Apply Stealth (best-effort external plugin, if present)
  try {
    const { stealth } = require('playwright-stealth');
    await stealth(context);
  } catch (e) {
    if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Stealth plugin failed: ${String(e)}\n`); } catch { } }
  }

  // ANTI-BOT-DETECTION: hide the JS signals that flag this as an automated browser
  // (navigator.webdriver, missing plugins/chrome object, headless permission quirks,
  // generic WebGL vendor). Without this, GitHub/Google restrict the login as a "bot"
  // even when the USER is driving it manually. This addresses the detectable-automation
  // part; residential IP + human interaction cover the rest (data-centre IPs may still
  // be flagged — that is the site's policy, not something to evade further).
  try {
    await context.addInitScript(() => {
      try {
        // 1) navigator.webdriver -> undefined (the #1 tell).
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });
        // 2) A realistic (non-empty) plugins + mimeTypes list.
        const fakePlugin = (name: string, filename: string, desc: string) => ({ name, filename, description: desc, length: 1 });
        const plugins = [
          fakePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
          fakePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
          fakePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
        ];
        Object.defineProperty(navigator, 'plugins', { get: () => plugins });
        // 3) Languages consistent with the Accept-Language header.
        Object.defineProperty(navigator, 'languages', { get: () => ['ar', 'en-US', 'en'] });
        // 4) window.chrome present (headless Chromium lacks it).
        if (!(window as any).chrome) (window as any).chrome = { runtime: {} };
        // 5) Notification permission query shouldn't report the headless "denied/prompt" quirk.
        const origQuery = (window.navigator as any).permissions?.query?.bind((window.navigator as any).permissions);
        if (origQuery) {
          (window.navigator as any).permissions.query = (p: any) =>
            p && p.name === 'notifications'
              ? Promise.resolve({ state: (Notification as any).permission })
              : origQuery(p);
        }
        // 6) Generic WebGL vendor/renderer -> realistic values.
        const getParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (param: number) {
          if (param === 37445) return 'Intel Inc.';                 // UNMASKED_VENDOR_WEBGL
          if (param === 37446) return 'Intel Iris OpenGL Engine';   // UNMASKED_RENDERER_WEBGL
          return getParam.call(this, param);
        };
      } catch { /* never break the page */ }
    });
  } catch { /* addInitScript unsupported -> non-fatal */ }

  // EVERY browser skill sends a function into the page with page.evaluate, and a
  // compiler that keeps function names wraps each one in a `__name(...)` helper
  // the browser has never heard of. Measured on a real page: fourteen of the
  // twenty-nine tools — the SEO audit, contrast, accessibility, extraction,
  // click, form fill, autofix — all died with the same
  // «ReferenceError: __name is not defined». Three audit modules already
  // carried this shim privately; it belongs here, where every tool's page is
  // born, so the toolbox works whatever compiled or ran it.
  try {
    await context.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });');
  } catch { /* an old Playwright without addInitScript is not a reason to fail */ }

  context.setDefaultNavigationTimeout(cfg.navTimeoutMs);
  context.setDefaultTimeout(cfg.actionTimeoutMs);
  const page: Page = await (persistentContext ? (context.pages()[0] ? Promise.resolve(context.pages()[0]) : context.newPage()) : context.newPage())
    .catch((e: any) => { throw Object.assign(e, { joeStage: e?.joeStage || 'newPage' }); });

  const state: SessionState = {
    browser,
    context,
    page,
    allowedOrigin: null,
    streaming: false,
    streamTimer: null,
    maskLocators: [],
    captureLocked: false,
    viewport,
    lastUsedAt: Date.now(),
    saveTimer: null,
  };

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    // A top-level navigation just settled (often right after a login redirect):
    // persist the login state automatically so the user stays signed in later.
    try { scheduleSessionSave(sessionId); } catch { }
    try {
      broadcastStatus(sessionId, state, { workerStatus: 'idle' });
    } catch { }
    try {
      const u = new URL(frame.url());
      const origin = u.origin;
      if (!state.allowedOrigin) {
        state.allowedOrigin = origin;
        return;
      }
      if (DEFAULT_BROWSER_CONFIG.strictSameSite && origin !== state.allowedOrigin) {
        broadcastBrowserEvent(sessionId, {
          type: 'goto_blocked',
          stepId: 'policy',
          ts: Date.now(),
          url: frame.url(),
          reason: 'same_site_blocked',
          message: 'cross_site_navigation_blocked',
        });
        try {
          broadcastStatus(sessionId, state, { workerStatus: 'idle', blockingReason: 'same_site_blocked' });
        } catch { }
        try {
          void page.goBack({ waitUntil: 'domcontentloaded' });
        } catch { }
      }
    } catch { }
  });

  try {
    broadcastStatus(sessionId, state, { workerStatus: 'idle' });
  } catch { }

  return state;
}

// In-flight creations, keyed by session id. Without this, two concurrent calls
// (e.g. the agent starting a task while the panel's WS client connects) BOTH miss
// the sessions map and EACH launch a browser: the agent drives one instance while
// the panel streams the other — the user watches a blank page while the agent
// works invisibly. One creation per id; everyone else awaits the same promise.
const pendingSessions = new Map<string, Promise<SessionState>>();

export async function getBrowserSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('sessionId_required');
  const existing = sessions.get(sid);
  if (existing) {
    existing.lastUsedAt = Date.now();
    ensureCleanupLoop();
    return existing;
  }
  const inFlight = pendingSessions.get(sid);
  if (inFlight) return inFlight;
  const creation = (async () => {
    try {
      const created = await createSession(sid).catch((e: any) => {
        // The note his next build will leave behind — with the STAGE it died at.
        noteBrowserFailure(sid, String(e?.joeStage || 'create'), e);
        throw e;
      });
      sessions.set(sid, created);
      ensureCleanupLoop();
      // A panel may already be watching this id and waiting for exactly this.
      try { resumeStreamingIfWatched(sid); } catch { /* streaming is best-effort */ }
      return created;
    } finally {
      pendingSessions.delete(sid);
    }
  })();
  pendingSessions.set(sid, creation);
  return creation;
}

export function setStreamMask(sessionId: string, maskLocators: Locator[]) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.maskLocators = Array.isArray(maskLocators) ? maskLocators : [];
  s.lastUsedAt = Date.now();
}

/**
 * LOOKING AT THE PANEL IS NOT A REQUEST TO OPEN A BROWSER.
 *
 * This used to call getBrowserSession(), which LAUNCHES a real Chromium —
 * so merely showing the Browser tab (or the workspace opening on it) started
 * a browser the user never asked for, and with BROWSER_HEADED a window
 * appeared on his desktop in the middle of a build: «في اثناء البناء تم فتح
 * المتصفح … بدون اي فائده». It also began a JPEG capture loop at stream FPS
 * against a blank page, for as long as the panel stayed open.
 *
 * The panel now ATTACHES to a browser that already exists. If none does, it
 * shows its empty state and costs nothing; the first real navigation — the
 * user typing a URL, or a browser tool running — creates the session, and
 * `resumeStreamingIfWatched` starts the stream at that moment.
 */
export function startStreaming(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  watched.add(sid);
  void (async () => {
    const s = sessions.get(sid);
    if (!s || s.streaming) return;
    s.streaming = true;
    s.lastUsedAt = Date.now();
    try {
      broadcastStatus(sid, s, { workerStatus: 'idle' });
    } catch { }
    const cfg = DEFAULT_BROWSER_CONFIG;
    const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, cfg.streamFps)));
    s.streamTimer = setInterval(async () => {
      if (!s || !s.streaming) return;
      try {
        const buf = await captureJpeg(s, {
          quality: 55,
          timeoutMs: Math.max(1000, Math.min(8000, cfg.actionTimeoutMs)),
          waitForLock: false,
          mask: s.maskLocators.length ? s.maskLocators : undefined,
        });

        // Debug logging disabled in production to avoid excessive disk I/O
        // Enable via BROWSER_DEBUG_LOG=true for troubleshooting
        if (process.env.BROWSER_DEBUG_LOG === 'true') {
          try {
            const logPath = path.join(__dirname, '../stream_debug.log');
            const msg = `[${new Date().toISOString()}] SID=${sid} Streaming Loop. Buf? ${!!buf} Len=${buf?.length}\n`;
            fs.appendFileSync(logPath, msg);
          } catch { }
        }

        if (!buf) return;
        broadcastBrowserEvent(sid, {
          type: 'stream_frame',
          ts: Date.now(),
          jpegBase64: Buffer.from(buf).toString('base64'),
          w: s.viewport.w,
          h: s.viewport.h,
        });
        s.lastUsedAt = Date.now();
      } catch { }
    }, intervalMs);
  })();
}

/**
 * A browser was just created for a session someone is WATCHING — start the
 * stream now. This is the other half of the lazy panel: the frames begin the
 * moment there is really something to show, not the moment a tab is drawn.
 */
/** How many browser sessions are actually alive — what a proof can count. */
export function liveBrowserSessionCount(): number { return sessions.size; }

export function resumeStreamingIfWatched(sessionId: string) {
    const sid = String(sessionId || '').trim();
    if (sid && watched.has(sid)) startStreaming(sid);
}

/**
 * START CHROMIUM BEFORE HE IS ASKED TO WATCH IT — «مازال يفتح المتصفح دون عمل شيء».
 *
 * His screenshot was taken at «🔎 Self-QA in a real browser…»: the panel said
 * «connected · 1280×720», the URL bar said «No page loaded», and the viewport
 * was white. Nothing was broken — the browser was still STARTING. Measured
 * here: the first frame that actually showed the audited page arrived 3.8s
 * after the audit began, and that is a fast Linux box with a warm disk.
 *
 * The launch does not have to happen then. A build that ends in a self-QA
 * knows from its first second that it will need a browser, and it spends the
 * minute before it running `npm install` and `vite build`. So the session is
 * created THERE, in parallel with work that was happening anyway — no extra
 * browser, the same one, merely already awake when the audit arrives.
 *
 * Fire-and-forget by contract: a build must never fail, stall, or say anything
 * different because a warm-up did not work out.
 */
export function warmBrowserSession(sessionId: string): void {
    const sid = String(sessionId || '').trim();
    if (!sid || sessions.has(sid) || pendingSessions.has(sid)) return;
    void getBrowserSession(sid)
        .then(() => { try { resumeStreamingIfWatched(sid); } catch { /* streaming is a bonus */ } })
        .catch(() => { /* the audit will launch its own — exactly as before */ });
}

/**
 * THE PANEL MUST KNOW THE PAGE GOT NARROWER.
 *
 * Every frame is broadcast with `s.viewport` as its declared size, and the
 * client draws the JPEG into a canvas of exactly that size. So when the self-QA
 * re-lays the app out at 390px to check it on a phone — which is the whole
 * point of a responsive pass he can watch — a stale viewport would stretch a
 * phone-shaped screenshot across a desktop-shaped canvas and show him a smear.
 *
 * Returns what the viewport WAS, so the caller can put it back; it is the
 * user's own browser, borrowed, and it goes home the size it arrived.
 */
export function setSessionViewport(sessionId: string, w: number, h: number): { w: number; h: number } | null {
  const s = sessions.get(String(sessionId || '').trim());
  if (!s) return null;
  const was = { w: s.viewport.w, h: s.viewport.h };
  if (w > 0 && h > 0) s.viewport = { w: Math.round(w), h: Math.round(h) };
  return was;
}

/** The size the panel currently believes it is showing. */
export function sessionViewport(sessionId: string): { w: number; h: number } | null {
  const s = sessions.get(String(sessionId || '').trim());
  return s ? { w: s.viewport.w, h: s.viewport.h } : null;
}

export function stopStreaming(sessionId: string) {
  const sid = String(sessionId || '').trim();
  watched.delete(sid);
  const s = sessions.get(sid);
  if (!s) return;
  s.streaming = false;
  if (s.streamTimer) {
    try { clearInterval(s.streamTimer); } catch { }
    s.streamTimer = null;
  }
  try {
    broadcastStatus(sid, s, { workerStatus: 'idle' });
  } catch { }
}

export async function stopSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  sessions.delete(sid);
  s.streaming = false;
  if (s.streamTimer) {
    try { clearInterval(s.streamTimer); } catch { }
    s.streamTimer = null;
  }
  if (s.saveTimer) { try { clearTimeout(s.saveTimer); } catch { } s.saveTimer = null; }
  // Capture the final login state before tearing the context down so the last
  // sign-in of the session is never lost.
  try { sessions.set(sid, s); await saveBrowserSession(sid); } catch { } finally { sessions.delete(sid); }
  try { await s.context.close(); } catch { }
  try { if (s.browser) await s.browser.close(); } catch { }
}

export async function healthcheckBrowser() {
  const startedAt = Date.now();
  const viewport = getBrowserViewport();
  let browser: Browser | null = null;
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  const apiKey = process.env.WORKER_API_KEY;

  try {
    if (wsEndpoint) {
      // Use connect logic for healthcheck
      browser = await chromium.connect(wsEndpoint, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
      });
    } else {
      // Fallback
      browser = await chromium.launch(getChromiumLaunchOptions());
    }

    const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } });
    try {
      const page = await context.newPage();
      const url = 'https://example.com';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const buf = await page.screenshot({ type: 'jpeg', quality: 65, animations: 'disabled' });

      // Save artifact if possible
      const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
      try {
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const fname = `health-browser-${Date.now()}.jpg`;
        const full = path.join(artifactDir, fname);
        fs.writeFileSync(full, buf);
        const href = `/artifacts/${encodeURIComponent(fname)}`;
        return { ok: true as const, ms: Date.now() - startedAt, url, screenshotHref: href };
      } catch {
        // If write fails, still return ok
        return { ok: true as const, ms: Date.now() - startedAt, url };
      }
    } finally {
      try { await context.close(); } catch { }
    }
  } catch (e: any) {
    throw e;
  } finally {
    try { await browser?.close(); } catch { }
  }
}
