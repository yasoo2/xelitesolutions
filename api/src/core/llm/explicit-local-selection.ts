/**
 * Explicit canonical-local selection/validation helper (PURE).
 *
 * Purpose: decide whether a user-selected `{ provider: 'local', model, baseUrl }`
 * tuple names a strict canonical loopback Ollama endpoint before the router
 * applies its generic blank/auto-mode/free-mode/dummy placeholder-key rule.
 * Local Ollama needs no key, so an absent/dummy key must never erase an
 * otherwise validated explicit local selection.
 *
 * Pure by construction: string/URL parsing only. No env, network, imports
 * from providers, SDK transports, or cost/policy lists.
 */

export interface ExplicitLocalSelectionInput {
  provider?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
}

export type ExplicitLocalKind =
  | 'eligible-local'
  | 'cloud-local'
  | 'not-explicit-local'
  | 'invalid-local';

export interface ExplicitLocalDecision {
  kind: ExplicitLocalKind;
  /** True only for a strict canonical loopback local model (non-cloud). */
  eligible: boolean;
  /** Trimmed selected model when eligible; otherwise undefined. */
  model?: string;
  /** SDK-ready base (`.../v1`) when eligible; otherwise undefined. */
  normalizedBaseUrl?: string;
  reason: string;
}

export type LocalKeyClass =
  | 'blank'
  | 'auto-mode'
  | 'free-mode'
  | 'free'
  | 'dummy'
  | 'non-ascii'
  | 'real';

const CANONICAL_LOCAL_PORT = '11434';
const AUTO_MODEL_TOKENS = ['auto', 'mock', 'free', 'default'];

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripIpv6Brackets(host: string): string {
  if (host.length > 2 && host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

/** Loopback host only: localhost, 127.0.0.1, ::1 (optionally bracketed). */
export function isLoopbackHostname(hostname: unknown): boolean {
  const raw = toTrimmedString(hostname).toLowerCase();
  if (!raw) return false;
  const host = stripIpv6Brackets(raw);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Classify a key without ever letting its class erase a validated selection. */
export function localKeyClass(apiKey: unknown): LocalKeyClass {
  const keyStr = toTrimmedString(apiKey);
  if (!keyStr) return 'blank';
  if (/[^\x00-\x7F]/.test(keyStr)) return 'non-ascii';
  if (keyStr === 'auto-mode') return 'auto-mode';
  if (keyStr === 'free-mode') return 'free-mode';
  if (keyStr === 'free') return 'free';
  if (keyStr === 'dummy') return 'dummy';
  return 'real';
}

/**
 * Keys the generic Auto-mesh predicate treats as placeholders. Exported so the
 * router can document that these classes are IGNORED for explicit canonical
 * local eligibility (local Ollama needs no key; a dummy key is ignored).
 */
export function isIgnorableLocalKey(apiKey: unknown): boolean {
  const cls = localKeyClass(apiKey);
  return (
    cls === 'blank' ||
    cls === 'auto-mode' ||
    cls === 'free-mode' ||
    cls === 'free' ||
    cls === 'dummy' ||
    cls === 'non-ascii'
  );
}

const RAW_CANONICAL_LOCAL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):11434(?:\/(?:v1\/?)?)?$/i;

function parseStrictHttpUrl(value: unknown): URL | null {
  const raw = toTrimmedString(value);
  if (!raw || /[\s<>\\^`{|}]/.test(raw)) return null;
  // Strict raw anchored canonical pattern FIRST: rejects URL-normalization
  // aliases (127.1, 2130706433, 0x7f000001), traversal (/other/../v1),
  // credentials (empty @), and query/hash delimiters (empty ?/#).
  if (!RAW_CANONICAL_LOCAL_PATTERN.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.search && url.search !== '') return null;
  if (url.hash && url.hash !== '') return null;
  return url;
}

/**
 * Strict canonical local endpoint: http + loopback host + port 11434 +
 * path root or /v1 only. Rejects credentials/query/hash/remote/other ports.
 */
export function isCanonicalLocalBaseUrl(baseUrl: unknown): boolean {
  const url = parseStrictHttpUrl(baseUrl);
  if (!url) return false;
  if (!isLoopbackHostname(url.hostname)) return false;
  if (url.port !== CANONICAL_LOCAL_PORT) return false;
  const path = url.pathname || '/';
  return path === '/' || path === '/v1' || path === '/v1/';
}

/**
 * Normalize a canonical root path to the SDK `/v1` base. Returns undefined
 * for anything non-canonical (fail closed; caller must not dispatch it).
 */
export function normalizeLocalBaseUrlForSdk(baseUrl: unknown): string | undefined {
  const raw = toTrimmedString(baseUrl);
  if (!isCanonicalLocalBaseUrl(raw)) return undefined;
  const url = parseStrictHttpUrl(raw);
  if (!url) return undefined;
  const host = stripIpv6Brackets(url.hostname.toLowerCase());
  const bracketed = host.includes(':') ? `[${host}]` : host;
  return `http://${bracketed}:${CANONICAL_LOCAL_PORT}/v1`;
}

function isAutoModelToken(model: string): boolean {
  return AUTO_MODEL_TOKENS.includes(model.toLowerCase());
}

function isCloudMarkedModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.endsWith('-cloud') || lower.endsWith(':cloud');
}

/**
 * Classify an explicit selection. Key class is never consulted for
 * eligibility: blank/auto-mode/free-mode/dummy keys keep a validated model.
 * Missing/blank/Auto-picker models are `not-explicit-local` (preserve the
 * Auto picker mesh). Non-string models, embedded whitespace/control names,
 * and non-canonical endpoints are `invalid-local`; `-cloud`/`:cloud`
 * suffixed names are `cloud-local`. The caller throws for
 * `invalid-local`/`cloud-local` before any dispatch.
 */
export function classifyExplicitLocalSelection(
  input: ExplicitLocalSelectionInput,
): ExplicitLocalDecision {
  const provider = toTrimmedString(input.provider).toLowerCase();
  if (provider !== 'local') {
    return { kind: 'not-explicit-local', eligible: false, reason: 'provider is not explicit local' };
  }
  if (input.model === undefined) {
    return { kind: 'not-explicit-local', eligible: false, reason: 'missing model preserves Auto picker' };
  }
  if (typeof input.model !== 'string') {
    return { kind: 'invalid-local', eligible: false, reason: 'malformed non-string model' };
  }
  const model = input.model.trim();
  if (!model || isAutoModelToken(model)) {
    return { kind: 'not-explicit-local', eligible: false, reason: 'blank or Auto-picker model preserves Auto picker' };
  }
  if (/[\s\x00-\x1F\x7F]/.test(model)) {
    return { kind: 'invalid-local', eligible: false, reason: 'model names embedded whitespace/control' };
  }
  if (isCloudMarkedModel(model)) {
    return { kind: 'cloud-local', eligible: false, reason: 'local cloud-marked model fails closed' };
  }
  if (!isCanonicalLocalBaseUrl(input.baseUrl)) {
    return { kind: 'invalid-local', eligible: false, reason: 'non-canonical local endpoint' };
  }
  const normalizedBaseUrl = normalizeLocalBaseUrlForSdk(input.baseUrl);
  if (!normalizedBaseUrl) {
    return { kind: 'invalid-local', eligible: false, reason: 'local base failed SDK normalization' };
  }
  return { kind: 'eligible-local', eligible: true, model, normalizedBaseUrl, reason: 'explicit canonical local' };
}
