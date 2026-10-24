/**
 * WHAT HE NAMED MUST BE WHAT WAS BUILT.
 *
 * Eval round 15 (P101): «أنشئ واجهة برمجية REST … فيها نقاط وصول لـالمرضى
 * والمواعيد والعلاجات، مع … اختبارات آلية لكل نقطة» was delivered as a stock
 * bookings API with no patients, appointments or treatments and no tests —
 * and Joe called it complete: none of its gates read the records the request
 * named. This module is Joe's own check, run at delivery time:
 *
 *   - requestedRecords(): the records the request names (the same readers the
 *     builders use: declaredTables, namedEntities, the served tables he
 *     listed), whether tests were asked for, and — per item — every listed
 *     item that produced no record (UNREAD: the delivery is then not verified,
 *     never «all built»).
 *   - collectServerEvidence(): route registrations harvested from the
 *     delivered source by language syntax (Express/Koa/Fastify chains, Flask/
 *     FastAPI decorators and prefixes, Django path(), Go handlers). Test files
 *     and HTTP-client calls are skipped; a route counts only with a handler.
 *     Keys bound to his label in the same object («key: 'alajats'» beside
 *     «العلاجات») are identifiers of that record.
 *   - probeServedResources(): GET-only runtime probe of the live server, with a
 *     negative control per prefix (a catch-all is inconclusive, not proof).
 *   - judgeRequestCoverage(): served (when a backend was asked for or the tree
 *     has one), tested (when tests were asked for), present (a static build).
 *     A probed 404 refutes static text, except for write-only or nested
 *     parameterised routes.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { declaredTables } from '../design/declared-tables';
import { alreadyOwned, curatedNounKey, listedReservedKeys, namedEntities } from '../design/named-entities';
import { keyForPhrase } from '../design/entity-inference';
import { isDeliverable, isInterfaceNoun, isPossessivePhrase, listRegion, splitListItems } from '../design/request-lists';

export interface RequestedRecord {
    /** His own words for it. */
    item: string;
    key: string;
    ar: string;
    en: string;
}

export interface RequestedRecords {
    entities: RequestedRecord[];
    /** Listed items that produced no record — never silently dropped. */
    unread: string[];
    /** The clause that asks for tests, verbatim, or null. */
    testsRequested: string | null;
}

const norm = (value: unknown) => String(value || '')
    .toLowerCase()
    .replace(/ـ/gu, '')
    .replace(/^(?:the|a|an)\s+/u, '')
    .replace(/^ال/u, '')
    .replace(/[.،؛,!?؟"'()«»:]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
const singularWord = (word: string) => word.replace(/ies$/u, 'y').replace(/(ch|sh|ss|x)es$/u, '$1').replace(/s$/u, '');

/** Everything after the list that is clearly not one of its items («… مع صور … وثيم …»). */
const LIST_TAIL = /\s+(?:مع|وبتصميم|بتصميم|بثيم|وثيم|and with|with a)\s+/iu;

const EN_TESTS = /\b(?:(?:unit|integration|automated|end[- ]to[- ]end|e2e|api|endpoint|regression|acceptance)\s+)?tests\b|\btest\s+(?:suites?|cases?|coverage|files?)\b|\b(?:unit|integration|automated|end[- ]to[- ]end|e2e)\s+test\b|\b(?:unit|integration|automated)\s+testing\b|\bspecs\b/iu;
const AR_TESTS = /اختبارات|(?:ال)?اختبار\s+(?:ال)?(?:آلي|آلية|الي|الية|وحدة|الوحدة|تكامل|التكامل)/u;

/** The clause that asks for tests as a deliverable (a noun: «tests», «unit tests», «اختبارات آلية»), or null. */
export function testsRequestedIn(request: string): string | null {
    const clauses = String(request || '').split(/[.!?؟\n;؛،,]+/u).map(c => c.trim()).filter(Boolean);
    const hit = clauses.find(clause => EN_TESTS.test(clause) || AR_TESTS.test(clause));
    return hit ? hit.slice(0, 240) : null;
}

/**
 * The records the request names, and every listed item it could not read.
 * Item accounting applies to a records list: one behind an interface head
 * («endpoints for», «نقاط وصول لـ», «manage», «إدارة الـ»), or any list of a
 * request that asks for its own backend. A landing page's «with a hero,
 * services, testimonials» is a list of sections, not records.
 */
export function requestedRecords(request: string, opts: { backendRequested?: boolean } = {}): RequestedRecords {
    const text = String(request || '');
    const declared = declaredTables(text, Number.MAX_SAFE_INTEGER);
    const named = declared.length ? declared : namedEntities(text);
    const entities: RequestedRecord[] = named
        .filter(entity => String(entity?.key || '').trim())
        .map(entity => ({ item: String(entity.ar || entity.en || entity.key), key: String(entity.key), ar: String(entity.ar || ''), en: String(entity.en || '') }));
    // A listed table the system already serves («الطلبات» → orders) is still
    // one of his records: it must be served too.
    const reservedKeys = listedReservedKeys(text);
    const reservedLabels = alreadyOwned(text);
    reservedKeys.forEach((key, i) => {
        if (!entities.some(entity => entity.key === key)) {
            const label = reservedLabels[i] || key;
            entities.push({ item: label, key, ar: label, en: key });
        }
    });

    const unread: string[] = [];
    const region = listRegion(text);
    const accountable = !!region && (region.marker === 'head' || (opts.backendRequested === true && entities.length > 0));
    if (region && accountable) {
        for (const item of splitListItems(region.region.split(LIST_TAIL)[0])) {
            if (isDeliverable(item) || isInterfaceNoun(item) || isPossessivePhrase(item)) continue;
            if (!entities.some(entity => itemNamesRecord(item, entity))) unread.push(item);
        }
    }
    return { entities, unread: Array.from(new Set(unread)), testsRequested: testsRequestedIn(text) };
}

function itemNamesRecord(item: string, entity: RequestedRecord): boolean {
    const i = norm(item);
    if (!i) return false;
    const labels = [entity.ar, entity.en, entity.key, entity.item].map(norm).filter(Boolean);
    if (labels.includes(i) || labels.map(singularWord).includes(singularWord(i))) return true;
    return curatedNounKey(item) === entity.key || keyForPhrase(item) === entity.key;
}

// ─── evidence in the delivered tree ─────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'public', 'coverage', '.cache', '.git', '.npm-cache',
    '.engineering-checkpoints', '__pycache__', 'venv', '.venv', '.next', '.joe', '.pytest_cache']);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go)$/iu;
const TEST_FILE = /(?:^|[\\/])(?:__tests__|tests?|spec)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|[\\/])test_[^\\/]+\.py$|_test\.(?:py|go)$/iu;
const CLIENT_FILE = /from\s+['"](?:react|react-dom|vue|svelte)(?:\/[^'"]*)?['"]|require\(\s*['"](?:react|vue|svelte)['"]\s*\)|\bdocument\.|\bwindow\./u;
/** Receivers that are HTTP clients, not routers: their .get('/x', …) calls a route, it does not serve one. */
const CLIENT_RECEIVERS = new Set(['axios', 'ky', 'got', 'fetch', 'superagent', 'supertest', 'agent', 'request', 'http', 'https', 'client', '$http', 'httpclient', 'apiclient', 'instance']);

export function isTestFile(file: string): boolean {
    return TEST_FILE.test(String(file || ''));
}

export function stripComments(text: string, file = ''): string {
    const t = String(text || '');
    if (/\.py$/iu.test(file)) return t.replace(/(^|\s)#.*$/gmu, '$1');
    return t
        .replace(/\/\*[\s\S]*?\*\//gu, ' ')
        .replace(/<!--[\s\S]*?-->/gu, ' ')
        .replace(/(^|[^:'"`\\])\/\/.*$/gmu, '$1');
}

export interface HarvestedRoute { path: string; method: string; file: string; dynamic: boolean }

export interface CoverageEvidence {
    routes: HarvestedRoute[];
    /** Mount prefixes read from the source, plus the first segment of each route («/api/»). */
    prefixes: string[];
    serverFiles: string[];
    testFiles: string[];
    /** Non-test source text (comments removed), for a static build's «present» check. */
    sourceText: string;
    testText: string;
    /** Keys bound to his label in the same object or JSON entry, per record key. */
    labelKeys: Record<string, string[]>;
}

const JS_ROUTE = /([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|all|use|route)\s*\(\s*(['"`])((?:\/|\$\{)[^'"`]*)\3\s*([,)])/giu;
const HANDLER_AFTER = /^\s*(?:async\s*)?(?:\(|function\b|\[|[A-Za-z_$][\w$.]*\s*(?:[,)]|\())/u;
const PY_DECORATOR = /@\s*([\w.]+)\.(get|post|put|patch|delete|route|api_route)\(\s*[rf]?['"]([^'"]*)['"]/gu;
const PY_PREFIX = /(?:APIRouter|Blueprint)\([^)]*?(?:prefix|url_prefix)\s*=\s*[rf]?['"]([^'"]+)['"]/gu;
const DJANGO_PATH = /\b(?:re_)?path\(\s*r?['"]\^?([^'"]*)['"]\s*,/gu;
const GO_HANDLE = /\b(?:HandleFunc|Handle)\(\s*"([^"]+)"/gu;
const LABEL_KEY = /\b(?:key|table|tableName|resource|collection|slug|path|route|endpoint|plural|name|id)\s*["']?\s*:\s*["'`]\/?(?:api\/)?([A-Za-z][\w-]{1,40})["'`]/gu;
const GENERIC_VALUES = new Set(['name', 'title', 'description', 'notes', 'phone', 'email', 'image', 'photo', 'price', 'quantity', 'amount',
    'reference', 'status', 'date', 'time', 'text', 'int', 'real', 'integer', 'string', 'number', 'boolean', 'id', 'key', 'value', 'label']);

function walk(root: string, out: string[], depth = 0): void {
    if (depth > 8 || out.length > 4000) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') { if (SKIP_DIRS.has(entry.name) || entry.isDirectory()) continue; }
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full, out, depth + 1); continue; }
        if (entry.isFile() && SOURCE_EXT.test(entry.name) && !/\.d\.ts$/iu.test(entry.name)) out.push(full);
    }
}

const isParamSegment = (segment: string) => /^(?::|\{|<|\*|\$\{)/u.test(segment) || segment.includes('${');

/** Route registrations, test files and label-bound keys in the delivered roots. */
export function collectServerEvidence(roots: string[], records: RequestedRecord[]): CoverageEvidence {
    const seen = new Set<string>();
    const files: string[] = [];
    for (const root of roots.map(r => String(r || '').trim()).filter(Boolean)) {
        let real = root;
        try { real = fs.realpathSync(root); } catch { continue; }
        if (seen.has(real)) continue;
        seen.add(real);
        walk(real, files);
    }
    const routes: HarvestedRoute[] = [];
    const prefixes = new Set<string>();
    const serverFiles: string[] = [];
    const testFiles: string[] = [];
    const source: string[] = [];
    const tests: string[] = [];
    const labelKeys: Record<string, Set<string>> = {};
    for (const file of Array.from(new Set(files))) {
        let raw = '';
        try {
            if (fs.statSync(file).size > 1_000_000) continue;
            raw = fs.readFileSync(file, 'utf8');
        } catch { continue; }
        const text = stripComments(raw, file);
        if (isTestFile(file)) { testFiles.push(file); tests.push(text); continue; }
        source.push(text);
        harvestLabelKeys(text, records, labelKeys);
        if (CLIENT_FILE.test(text)) continue;
        const before = routes.length;
        harvestRoutes(text, file, routes, prefixes);
        if (routes.length > before) serverFiles.push(file);
    }
    for (const route of routes) {
        const first = route.path.split('/').filter(Boolean)[0];
        if (first && !isParamSegment(first) && route.path.split('/').filter(Boolean).length > 1) prefixes.add(`/${first}/`);
    }
    return {
        routes,
        prefixes: Array.from(prefixes),
        serverFiles,
        testFiles,
        sourceText: source.join('\n'),
        testText: tests.join('\n'),
        labelKeys: Object.fromEntries(Object.entries(labelKeys).map(([k, v]) => [k, Array.from(v)])),
    };
}

function harvestRoutes(text: string, file: string, routes: HarvestedRoute[], prefixes: Set<string>): void {
    for (const m of text.matchAll(JS_ROUTE)) {
        const receiver = String(m[1] || '').toLowerCase();
        if (CLIENT_RECEIVERS.has(receiver)) continue;
        const method = String(m[2] || '').toLowerCase();
        const routePath = String(m[4] || '');
        const closer = m[5];
        const rest = text.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 120);
        if (closer === ')') {
            // app.route('/x').get(...) — the chained handlers follow.
            if (method !== 'route' || !/^\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(/iu.test(rest)) continue;
        } else if (!HANDLER_AFTER.test(rest)) {
            continue;
        }
        routes.push({ path: routePath, method, file, dynamic: routePath.includes('${') });
        if (method === 'use') prefixes.add(routePath.endsWith('/') ? routePath : `${routePath}/`);
    }
    for (const m of text.matchAll(PY_DECORATOR)) routes.push({ path: String(m[3] || ''), method: String(m[2] || '').toLowerCase(), file, dynamic: false });
    for (const m of text.matchAll(PY_PREFIX)) {
        const prefix = String(m[1] || '');
        if (prefix.startsWith('/')) prefixes.add(prefix.endsWith('/') ? prefix : `${prefix}/`);
    }
    for (const m of text.matchAll(DJANGO_PATH)) routes.push({ path: `/${String(m[1] || '').replace(/^\//u, '')}`, method: 'route', file, dynamic: false });
    for (const m of text.matchAll(GO_HANDLE)) routes.push({ path: String(m[1] || ''), method: 'route', file, dynamic: false });
}

function harvestLabelKeys(text: string, records: RequestedRecord[], out: Record<string, Set<string>>): void {
    for (const record of records) {
        const labels = Array.from(new Set([record.ar, record.item, /[a-z]/iu.test(record.en) ? record.en : ''].map(s => String(s || '').trim()).filter(s => s.length >= 2)));
        for (const label of labels) {
            const quoted = new RegExp(`["'\`]${label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}["'\`]`, 'gu');
            for (const hit of text.matchAll(quoted)) {
                const at = hit.index || 0;
                const open = text.lastIndexOf('{', at);
                const closeBefore = text.lastIndexOf('}', at);
                if (open < 0 || open < closeBefore || at - open > 400) continue;
                const close = text.indexOf('}', at);
                const window = text.slice(open, close < 0 ? at + 600 : Math.min(close + 1, at + 600));
                for (const kv of window.matchAll(LABEL_KEY)) {
                    const value = String(kv[1] || '').toLowerCase();
                    if (GENERIC_VALUES.has(value)) continue;
                    (out[record.key] ||= new Set()).add(value);
                }
            }
        }
    }
}

// ─── identifiers and the runtime probe ──────────────────────────────────────

function forms(phrase: string): string[] {
    const words = String(phrase || '').toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
    if (!words.length) return [];
    const variants = [words, [...words.slice(0, -1), singularWord(words[words.length - 1])]];
    const out = new Set<string>();
    for (const w of variants) {
        out.add(w.join('-'));
        out.add(w.join('_'));
        out.add(w.join(''));
        out.add(w[0] + w.slice(1).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(''));
    }
    return Array.from(out).filter(f => f.length >= 2);
}

/** The Latin identifiers a build can use for one record: key, singular, kebab/snake/camel of his English phrase, and keys bound to his label. */
export function identifiersFor(record: RequestedRecord, labelKeys: string[] = []): string[] {
    const latin = [record.key, /[a-z]/iu.test(record.en) && !/[\u0600-\u06FF]/u.test(record.en) ? record.en : '', ...labelKeys];
    return Array.from(new Set(latin.flatMap(forms)));
}

export type ProbeResult = 'served' | 'absent' | 'inconclusive';

const routeLike = (status: number, contentType: string) =>
    ((status >= 200 && status < 300) || status === 401 || status === 403 || status === 405) && !/text\/html/iu.test(contentType);

/**
 * GET-only runtime probe. Each prefix first answers a negative control
 * (an absent nonce path): a prefix that «serves» the absent path is a
 * catch-all and proves nothing. Never writes user data.
 */
export async function probeServedResources(
    baseUrl: string,
    prefixes: string[],
    records: Array<{ key: string; ids: string[] }>,
    opts: { signal?: AbortSignal; timeoutMs: number },
): Promise<Record<string, ProbeResult>> {
    const base = String(baseUrl || '').replace(/\/+$/u, '');
    const result: Record<string, ProbeResult> = Object.fromEntries(records.map(r => [r.key, 'inconclusive' as ProbeResult]));
    if (!base) return result;
    // node:http, not fetch: the same transport in the API process and in tests,
    // no redirect following, and a hard per-answer bound.
    const get = (url: string): Promise<{ status: number; type: string } | null> => new Promise(resolve => {
        if (opts.signal?.aborted) return resolve(null);
        let settled = false;
        const finish = (value: { status: number; type: string } | null) => {
            if (settled) return;
            settled = true;
            opts.signal?.removeEventListener('abort', onAbort);
            resolve(value);
        };
        let req: http.ClientRequest;
        const onAbort = () => { req?.destroy(); finish(null); };
        try {
            const target = new URL(url);
            const client = target.protocol === 'https:' ? https : http;
            req = client.request(target, { method: 'GET', timeout: Math.max(1, opts.timeoutMs) }, res => {
                const type = String(res.headers['content-type'] || '');
                res.resume();
                res.on('end', () => finish({ status: res.statusCode || 0, type }));
                res.on('error', () => finish({ status: res.statusCode || 0, type }));
            });
        } catch {
            return finish(null);
        }
        req.on('timeout', () => { req.destroy(); finish(null); });
        req.on('error', () => finish(null));
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        req.end();
    });
    const candidates = Array.from(new Set(['/api/', '/', ...prefixes].map(p => {
        const withLead = p.startsWith('/') ? p : `/${p}`;
        return withLead.endsWith('/') ? withLead : `${withLead}/`;
    })));
    const nonce = `__joe_absent_${Date.now().toString(36)}`;
    let conclusive = 0;
    for (const prefix of candidates) {
        const control = await get(`${base}${prefix}${nonce}`);
        if (!control || routeLike(control.status, control.type)) continue;
        conclusive++;
        for (const record of records) {
            if (result[record.key] === 'served') continue;
            for (const id of record.ids.slice(0, 8)) {
                const answer = await get(`${base}${prefix}${id}`);
                if (answer && routeLike(answer.status, answer.type)) { result[record.key] = 'served'; break; }
            }
        }
    }
    if (conclusive > 0) for (const record of records) if (result[record.key] !== 'served') result[record.key] = 'absent';
    return result;
}

// ─── the verdict ────────────────────────────────────────────────────────────

export interface RecordCoverage {
    key: string;
    ar: string;
    en: string;
    item: string;
    served: boolean | null;
    tested: boolean | null;
    present: boolean | null;
    evidence: string[];
}

export interface RequestCoverageReport {
    checked: number;
    records: RecordCoverage[];
    missing: RecordCoverage[];
    unread: string[];
    testsRequested: string | null;
    servedApplies: boolean;
    /** The server file that registers most routes — the repair target. */
    serverFile: string;
    /** Resources the server already serves statically — the pattern a repair follows. */
    patternResources: string[];
    prefixes: string[];
}

const wordIn = (text: string, id: string) => new RegExp(`(^|[^A-Za-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}([^A-Za-z0-9]|$)`, 'iu').test(text);

export function judgeRequestCoverage(input: {
    records: RequestedRecords;
    evidence: CoverageEvidence;
    probe?: Record<string, ProbeResult>;
    backendRequested: boolean;
}): RequestCoverageReport {
    const { records, evidence } = input;
    const servedApplies = input.backendRequested === true || evidence.routes.length > 0;
    const out: RecordCoverage[] = records.entities.map(record => {
        const ids = identifiersFor(record, evidence.labelKeys[record.key] || []);
        const why: string[] = [];
        let served: boolean | null = null;
        let present: boolean | null = null;
        if (servedApplies) {
            const match = staticRouteMatch(evidence.routes, ids);
            const probed = input.probe?.[record.key];
            if (match) why.push(`route ${match.route.method.toUpperCase()} ${match.route.path} (${path.basename(match.route.file)})`);
            if (probed) why.push(`probe: ${probed}`);
            served = probed === 'served'
                || (!!match && (probed !== 'absent' || match.writeOnly || match.nested));
        } else {
            present = ids.some(id => wordIn(evidence.sourceText, id))
                || [record.ar, record.item].some(label => label && new RegExp(`["'\`][^"'\`]*${label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[^"'\`]*["'\`]`, 'u').test(evidence.sourceText));
        }
        const tested = records.testsRequested ? ids.some(id => wordIn(evidence.testText, id)) : null;
        return { key: record.key, ar: record.ar, en: record.en, item: record.item, served, tested, present, evidence: why };
    });
    const counts = new Map<string, number>();
    for (const route of evidence.routes) counts.set(route.file, (counts.get(route.file) || 0) + 1);
    const serverFile = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const patternResources = Array.from(new Set(evidence.routes
        .filter(route => !route.dynamic)
        .map(route => route.path.split('/').filter(Boolean).filter(s => !isParamSegment(s)).pop() || '')
        .filter(s => s && !/^(?:api|health|auth|login|logout|me)$/iu.test(s))));
    return {
        checked: out.length,
        records: out,
        missing: out.filter(r => r.served === false || r.tested === false || r.present === false),
        unread: records.unread,
        testsRequested: records.testsRequested,
        servedApplies,
        serverFile,
        patternResources,
        prefixes: evidence.prefixes,
    };
}

function staticRouteMatch(routes: HarvestedRoute[], ids: string[]): { route: HarvestedRoute; writeOnly: boolean; nested: boolean } | null {
    const wanted = new Set(ids.map(id => id.toLowerCase()));
    const matches: Array<{ route: HarvestedRoute; writeOnly: boolean; nested: boolean }> = [];
    for (const route of routes) {
        const segments = route.path.split('/').filter(Boolean);
        for (let i = 0; i < segments.length; i++) {
            if (isParamSegment(segments[i]) || !wanted.has(segments[i].toLowerCase())) continue;
            matches.push({
                route,
                writeOnly: ['post', 'put', 'patch', 'delete'].includes(route.method),
                nested: i > 0 && isParamSegment(segments[i - 1]),
            });
        }
    }
    // Prefer a match the probe cannot refute (write-only or nested under a parameter).
    return matches.find(m => m.writeOnly || m.nested) || matches[0] || null;
}

/** The delivery error for missing records, naming each and what is missing. */
export function coverageError(report: RequestCoverageReport): string {
    const items = report.missing.map(record => {
        const label = record.ar && record.ar !== record.key ? `${record.key} — ${record.ar}` : record.key;
        const what = [
            record.served === false ? 'not served' : '',
            record.tested === false ? 'untested' : '',
            record.present === false ? 'not built' : '',
        ].filter(Boolean).join(', ');
        return `${label} (${what})`;
    });
    return `requested_entities_not_delivered: ${items.join('; ')}`.slice(0, 900);
}
