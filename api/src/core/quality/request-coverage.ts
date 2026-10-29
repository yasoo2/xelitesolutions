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
 *     listed), whether tests were asked for, every listed item that produced
 *     no record (UNREAD), and every rule he stated that only a live
 *     multi-account probe could measure (CAPABILITIES) — both make the
 *     delivery «not verified», never «all built».
 *   - collectServerEvidence(): route registrations harvested from the
 *     delivered source by language syntax (Express/Koa/Fastify chains, Flask/
 *     FastAPI decorators and prefixes, Django path(), Go handlers), and the
 *     page source (.html/.vue/.svelte) for a static build's «present» check.
 *     A route counts only on a receiver that serves (an application or a
 *     router), never on an HTTP client; test files are test evidence only.
 *   - probeServedResources(): GET-only runtime probe of the live server, on
 *     the exact path each record's route registers, with a negative control
 *     per parent path (a catch-all is inconclusive, never proof).
 *   - judgeRequestCoverage(): served / tested / present per record. A
 *     registered GET route the probe finds absent is NOT served; a record the
 *     probe could not see is reported unverified, never silently passed.
 *   - runRequestedTests(): «tested» means his tests RAN and passed — a word
 *     in a skipped test was never evidence.
 *
 * Round 20 (adversarial review of round 19) — what this version fixes:
 * Arabic admin lists led by «إضافة وتعديل وحذف وبحث في …» were never read
 * (18/50 admin prompts silently skipped); a trailing rule «and each staff
 * member only sees their own records» counted as an unread record, so 49/50
 * full-stack prompts could never be verified; a landing page's sections
 * («الخدمات، وآراء العملاء») were demanded as records while .html was never
 * read; a POST route outvoted a GET route the probe found absent; versioned,
 * nested and FastAPI trailing-slash routes were refuted by a probe of the
 * wrong prefix; frontend API-client calls counted as server routes; «tested»
 * was a word search; «tests» in a records list was read as a deliverable.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { declaredTables } from '../design/declared-tables';
import { alreadyOwned, curatedNounKey, listedReservedKeys, namedEntities, nounKeyOfItem } from '../design/named-entities';
import { keyForPhrase } from '../design/entity-inference';
import { isDeliverable, isInterfaceNoun, isPossessivePhrase, listRegion, splitListItems, type ListMarker } from '../design/request-lists';
import { requestedArtifact, statesManagingPurpose } from '../design/requested-artifact';
import { emptyTestRun, judgeTestRun } from './test-run-evidence';
import { pythonExecutable } from './python-executable';
import { isRealScript } from './placeholder-script';
import { pythonTestCommand } from './python-test-runner';
import { isMachineStateDirectory } from '../../shared/utils/project-tree';

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
    /**
     * Rules he stated that only a live multi-account probe can measure
     * («each staff member only sees their own records»). Named, never
     * dropped; until such a probe exists the delivery stays «not verified».
     */
    capabilities?: string[];
    /**
     * Behaviour clauses found inside the list («customers pick a date and time
     * slot») — measured by the scope audit and the acceptance ledger, not by
     * record coverage. Kept for the report and the log.
     */
    clauses?: string[];
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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Everything after the list that is clearly not one of its items («… مع صور … وثيم …»). */
const LIST_TAIL = /\s+(?:مع|وبتصميم|بتصميم|بثيم|وثيم|and with|with a)\s+/iu;

// ─── what the list names, after the actions and the rules are taken off ─────

// One list reader for builders and this gate (round 20): the actions and the
// trailing rule come off a list the same way everywhere, so the gate never
// demands a record the builder could not have read.
import { isActionWord, stripLeadingActions, withoutLeadingAction, isFeaturePhrase, normaliseListedRequest, type NormalisedRequest } from '../design/listed-request';
export { isActionWord, stripLeadingActions, isFeaturePhrase, normaliseListedRequest };
export type { NormalisedRequest };

/** The rule «each X only sees their own records» — the per-user isolation only a multi-account probe can measure. */
function perUserRule(clause: string): boolean {
    try { return requestedArtifact(clause).evidence.serverClaims.includes('per-user records'); } catch { return false; }
}

const PER_USER_CAPABILITY = (clause: string) => `per-user record isolation — «${clause.slice(0, 140)}»`;

// ─── which requests ask for tests, and which owe records ────────────────────

/**
 * Tests as a DELIVERABLE: a qualified noun («unit tests», «اختبارات آلية»), a
 * test artifact («test suite»), or a frame that asks for them («write tests»,
 * «with tests», «مع اختبارات»). A bare «tests» inside a records list («students,
 * teachers and tests») is a table of exams, and «a quiz app that tests kids» is
 * a verb — neither asks for automated tests.
 */
const EN_TESTS = /\b(?:unit|integration|automated|automatic|end[- ]to[- ]end|e2e|api|endpoint|regression|acceptance|smoke|functional)\s+(?:tests?|testing|specs?)\b|\btest\s+(?:suites?|cases?|coverage|files?|scripts?)\b|\b(?:write|writing|add|adding|include|including|plus|ship|provide|with)\s+(?:(?:some|full|complete|proper|thorough|their|its|the|a)\s+)?(?:tests|specs)\b|\btests?\s+for\s+(?:every|each|all)\b/iu;
const AR_TESTS = /اختبار(?:ات)?\s+(?:ال)?(?:آلي|آلية|آليه|الي|الية|اليه|تلقائي|تلقائية|وحدة|الوحدة|وحدات|تكامل|التكامل|شاملة|شامله|لكل)|(?:مع|اكتب|أضف|اضف|بإضافة|باضافة)\s+(?:ال)?اختبارات|اختبارات\s+(?:ل|لـ)?كل\s/u;

/** The clause that asks for tests as a deliverable, or null. */
export function testsRequestedIn(request: string): string | null {
    const clauses = String(request || '').split(/[.!?؟\n;؛]+/u).map(c => c.trim()).filter(Boolean);
    const hit = clauses.find(clause => EN_TESTS.test(clause) || AR_TESTS.test(clause));
    return hit ? hit.slice(0, 240) : null;
}

/**
 * The fact the coverage gate was written for: the request asks for a server
 * of its own — a declared backend, a database, sign-in, accounts or roles, or
 * an API as the thing to build. Not every claim the router reads as needing a
 * server (an invoice in a list of records is a record, not a backend).
 */
export function backendRequestedFor(request: string): boolean {
    try {
        const a = requestedArtifact(String(request || ''));
        return a.kind === 'api' || a.evidence.serverClaims.some(c => /^(?:backend|database|sign-in|accounts|roles):/u.test(c));
    } catch {
        return false;
    }
}

/**
 * The records the request names, and every listed item it could not read.
 * Item accounting applies to a records list: one behind an interface head
 * («endpoints for», «نقاط وصول لـ», «manage», «إدارة الـ»), one led by actions
 * on records («إضافة وتعديل … في X»), a colon list of a request whose purpose
 * is managing records, or any list of a request that asks for its own
 * backend. A presentation page's «hero, services, testimonials» are sections
 * the scope audit checks — never record obligations.
 */
export function requestedRecords(request: string, opts: { backendRequested?: boolean } = {}): RequestedRecords {
    const text = String(request || '');
    const testsRequested = testsRequestedIn(text);
    const none: RequestedRecords = { entities: [], unread: [], capabilities: [], clauses: [], testsRequested };
    const backend = opts.backendRequested === true;
    let artifact: ReturnType<typeof requestedArtifact> | null = null;
    try { artifact = requestedArtifact(text); } catch { artifact = null; }
    if (artifact?.evidence.presentation) return none;
    if ((artifact?.kind === 'page' || artifact?.kind === 'game') && !backend && !statesManagingPurpose(text)) return none;

    const shaped = normaliseListedRequest(text);
    const isRecordLike = (label: string) => !isActionWord(label) && !isFeaturePhrase(label);
    const declared = declaredTables(shaped.text, Number.MAX_SAFE_INTEGER)
        .filter(entity => isRecordLike(String(entity?.key || '')) && isRecordLike(String(entity?.ar || '')));
    const named = declared.length ? declared : namedEntities(shaped.text);
    const entities: RequestedRecord[] = named
        .filter(entity => String(entity?.key || '').trim())
        .filter(entity => isRecordLike(String(entity.ar || entity.en || entity.key)) && isRecordLike(String(entity.key)))
        .map(entity => ({ item: String(entity.ar || entity.en || entity.key), key: String(entity.key), ar: String(entity.ar || ''), en: String(entity.en || '') }));
    // A listed table the system already serves («الطلبات» → orders) is still
    // one of his records: it must be served too.
    const reservedKeys = listedReservedKeys(shaped.text);
    const reservedLabels = alreadyOwned(shaped.text);
    reservedKeys.forEach((key, i) => {
        if (!entities.some(entity => entity.key === key)) {
            const label = reservedLabels[i] || key;
            entities.push({ item: label, key, ar: label, en: key });
        }
    });

    const unread: string[] = [];
    const capabilities: string[] = [];
    const clauses: string[] = [];
    for (const rule of shaped.rules) {
        if (perUserRule(rule)) capabilities.push(PER_USER_CAPABILITY(rule));
        else clauses.push(rule);
    }
    const accountable = !!shaped.region && (
        shaped.marker === 'head'
        || shaped.actionLed
        // «لإدارة مشتل: النباتات والموردون والطلبيات» — a records list once its
        // nouns are read as records; «لإدارة …: عرض المنتجات بالصور…» lists features.
        || (shaped.marker === 'colon' && statesManagingPurpose(text) && entities.length >= 2)
        || (backend && entities.length > 0));
    if (shaped.region && accountable) {
        for (const raw of splitListItems(shaped.region.split(LIST_TAIL)[0])) {
            if (isActionWord(raw) || isFeaturePhrase(raw)) continue;
            const item = withoutLeadingAction(raw);
            if (!item || isDeliverable(item) || isInterfaceNoun(item) || isPossessivePhrase(item) || isActionWord(item) || isFeaturePhrase(item)) continue;
            if (perUserRule(item)) { capabilities.push(PER_USER_CAPABILITY(item)); continue; }
            // A record is named by a noun phrase; four words and more is a clause.
            if (item.split(/\s+/).length > 4) { clauses.push(item); continue; }
            if (entities.some(entity => itemNamesRecord(item, entity))) continue;
            // A dictionary noun in a proven records list is one of his records,
            // even where namedEntities' two-noun floor declined the list. A
            // two-word item is read as the builders read it (round 21 review):
            // «صور المنتجات», "customer testimonials" are content about products
            // and customers, not those tables, so no server is failed for them.
            const tokens = item.split(/\s+/);
            const key = curatedNounKey(item) || (tokens.length <= 2 ? nounKeyOfItem(item) : '');
            if (key && !entities.some(entity => entity.key === key)) {
                entities.push({ item, key, ar: /[؀-ۿ]/u.test(item) ? item : '', en: /[؀-ۿ]/u.test(item) ? key : item });
                continue;
            }
            unread.push(item);
        }
    }
    // The rule may sit outside the list («…، وكل موظف يرى سجلاته فقط»): still named.
    if (!capabilities.length && artifact?.evidence.serverClaims.includes('per-user records')) {
        const clause = text.split(/[.!?؟\n;؛،,]+/u).map(c => c.trim()).find(c => c && perUserRule(c));
        capabilities.push(PER_USER_CAPABILITY(clause || 'per-user records'));
    }
    return {
        entities,
        unread: Array.from(new Set(unread)),
        capabilities: Array.from(new Set(capabilities)),
        clauses: Array.from(new Set(clauses)),
        testsRequested,
    };
}

function itemNamesRecord(item: string, entity: RequestedRecord): boolean {
    const i = norm(item);
    if (!i) return false;
    const labels = [entity.ar, entity.en, entity.key, entity.item].map(norm).filter(Boolean);
    if (labels.includes(i) || labels.map(singularWord).includes(singularWord(i))) return true;
    if (curatedNounKey(item) === entity.key || keyForPhrase(item) === entity.key) return true;
    // The builders read a two-word item by its head, then by its possessor
    // unless the head is content about it («مواعيد المرضى» → appointments,
    // «صور المنتجات» → none): the same reading here, so an item they built is
    // never «unread» and content they rightly did not build is never a record.
    const tokens = String(item || '').trim().split(/\s+/);
    return tokens.length <= 2 && nounKeyOfItem(item) === entity.key;
}

// ─── evidence in the delivered tree ─────────────────────────────────────────

/** Compiled or copied output: never the source that registers a route. */
const BUILD_OUTPUT = new Set(['dist', 'build']);
/** Folders (and then files) read side by side, a bounded number at a time. */
const READ_CONCURRENCY = 32;
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go)$/iu;
/** Page source: read for a static build's «present» check, never harvested for routes. */
const MARKUP_EXT = /\.(?:html?|vue|svelte)$/iu;
const TEST_FILE = /(?:^|[\\/])(?:__tests__|tests?|spec)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|[\\/])test_[^\\/]+\.py$|_test\.(?:py|go)$|(?:^|[\\/])tests?\.(?:py|[cm]?[jt]s)$/iu;
const CLIENT_FILE = /from\s+['"](?:react|react-dom|vue|svelte)(?:\/[^'"]*)?['"]|require\(\s*['"](?:react|vue|svelte)['"]\s*\)|\bdocument\.|\bwindow\./u;
/** Receivers that are HTTP clients, not routers: their .get('/x', …) calls a route, it does not serve one. */
const CLIENT_RECEIVERS = new Set(['axios', 'ky', 'got', 'fetch', 'superagent', 'supertest', 'agent', 'request', 'http', 'https', 'client', '$http', 'httpclient', 'apiclient', 'instance', 'api', 'service', 'services']);
const BUNDLER_DEP = /^(?:vite|webpack|parcel|react-scripts|next|nuxt|@angular\/cli|@sveltejs\/kit|astro|esbuild|rollup|gatsby|@vue\/cli-service)$/iu;

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

export interface HarvestedRoute {
    path: string;
    method: string;
    file: string;
    dynamic: boolean;
    /**
     * The path as written IS the served path: registered on an application
     * object (express(), Flask(), FastAPI(), a Go mux). A router's or a
     * blueprint's paths depend on where it is mounted, which the probe may not
     * know — they can prove a record, never refute it.
     */
    known: boolean;
}

export interface CoverageEvidence {
    routes: HarvestedRoute[];
    /** Mount prefixes read from the source, plus the parent path of each served resource («/api/v1/»). */
    prefixes: string[];
    /** Files that register routes, the one with the most routes first. */
    serverFiles: string[];
    testFiles: string[];
    /** Non-test source and page text (comments removed), for a static build's «present» check. */
    sourceText: string;
    testText: string;
    /** Keys bound to his label in the same object or JSON entry, per record key. */
    labelKeys: Record<string, string[]>;
}

const JS_ROUTE = /([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|all|use|route)\s*\(\s*(['"`])((?:\/|\$\{)[^'"`]*)\3\s*([,)])/giu;
const HANDLER_AFTER = /^\s*(?:async\s*)?(?:\(|function\b|\[|[A-Za-z_$][\w$.]*\s*(?:[,)]|\())/u;
const PY_DECORATOR = /@\s*([\w.]+)\.(get|post|put|patch|delete|route|api_route)\(\s*[rf]?['"]([^'"]*)['"]/gu;
const PY_APP = /^\s*(\w+)\s*=\s*(?:Flask|FastAPI|Sanic|Quart)\s*\(/gmu;
const PY_ROUTER = /^\s*(\w+)\s*=\s*(?:APIRouter|Blueprint)\s*\(([^)]*)\)/gmu;
const PY_PREFIX_ARG = /(?:prefix|url_prefix)\s*=\s*[rf]?['"]([^'"]+)['"]/u;
const PY_INCLUDE_PREFIX = /\.(?:include_router|register_blueprint)\([^)]*?(?:prefix|url_prefix)\s*=\s*[rf]?['"]([^'"]+)['"]/gu;
const DJANGO_PATH = /\b(?:re_)?path\(\s*r?['"]\^?([^'"]*)['"]\s*,/gu;
const GO_HANDLE = /\b(?:HandleFunc|Handle)\(\s*"([^"]+)"/gu;
const LABEL_KEY = /\b(?:key|table|tableName|resource|collection|slug|path|route|endpoint|plural|name|id|en|english|labelEn|label_en)\s*["']?\s*:\s*["'`]\/?(?:api\/)?([A-Za-z][\w-]{1,40})["'`]/gu;
const GENERIC_VALUES = new Set(['name', 'title', 'description', 'notes', 'phone', 'email', 'image', 'photo', 'price', 'quantity', 'amount',
    'reference', 'status', 'date', 'time', 'text', 'int', 'real', 'integer', 'string', 'number', 'boolean', 'id', 'key', 'value', 'label']);

function rootHasBundler(root: string): boolean {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const deps = { ...(manifest?.dependencies || {}), ...(manifest?.devDependencies || {}) };
        if (Object.keys(deps).some(name => BUNDLER_DEP.test(name))) return true;
    } catch { /* no manifest */ }
    try { return fs.readdirSync(root).some(name => /^(?:vite|webpack|rollup|next|nuxt|svelte|astro)\.config\./iu.test(name)); } catch { return false; }
}

/**
 * EVERY SOURCE FILE OF THE DELIVERED TREE, WITHOUT HOLDING THE EVENT LOOP.
 *
 * Round 21 (writing fork's hand-back): this walk was synchronous, kept its own
 * skip list, and stopped without a word past 4 000 files or 8 levels — a
 * server file after them was no evidence, so its records could read «not
 * served» on a server that served them, and every delivery check held the
 * event loop of a server other people were using. What is skipped is now
 * skipped by kind: the machine state every project walker skips
 * (project-tree), build output, dot-folders, and public/ where a bundler
 * copies it. Sibling folders are read side by side, a bounded number at a
 * time; a symbolic link is not followed, so no loop can make it endless.
 */
async function sourceFiles(root: string, includePublic: boolean): Promise<string[]> {
    const out: string[] = [];
    let level = [root];
    while (level.length) {
        const next: string[] = [];
        for (let i = 0; i < level.length; i += READ_CONCURRENCY) {
            const listed = await Promise.all(level.slice(i, i + READ_CONCURRENCY).map(dir =>
                fs.promises.readdir(dir, { withFileTypes: true }).then(entries => ({ dir, entries }), () => ({ dir, entries: [] as fs.Dirent[] }))));
            for (const { dir, entries } of listed) {
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name.startsWith('.') || isMachineStateDirectory(entry.name) || BUILD_OUTPUT.has(entry.name)) continue;
                        // A build-free site keeps its pages in public/; a bundled one's public/ is copied output.
                        if (entry.name === 'public' && !includePublic) continue;
                        next.push(full);
                    } else if (entry.isFile() && (SOURCE_EXT.test(entry.name) || MARKUP_EXT.test(entry.name)) && !/\.d\.ts$/iu.test(entry.name)) {
                        out.push(full);
                    }
                }
            }
        }
        level = next;
    }
    return out;
}

/** Each file's text, or null for one over 1 MB or unreadable, read a bounded number at a time. */
async function readSources(files: string[]): Promise<Array<string | null>> {
    const texts: Array<string | null> = [];
    for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
        texts.push(...await Promise.all(files.slice(i, i + READ_CONCURRENCY).map(async file => {
            try { return (await fs.promises.stat(file)).size > 1_000_000 ? null : await fs.promises.readFile(file, 'utf8'); } catch { return null; }
        })));
    }
    return texts;
}

const isParamSegment = (segment: string) => /^(?::|\{|<|\*|\$\{)/u.test(segment) || segment.includes('${');
const joinPath = (...parts: string[]) => `/${parts.map(p => String(p || '').replace(/^\/+|\/+$/gu, '')).filter(Boolean).join('/')}`;

/** Route registrations, test files, page text and label-bound keys in the delivered roots. */
export async function collectServerEvidence(roots: string[], records: RequestedRecord[]): Promise<CoverageEvidence> {
    const seen = new Set<string>();
    const files: string[] = [];
    for (const root of roots.map(r => String(r || '').trim()).filter(Boolean)) {
        let real = root;
        try { real = await fs.promises.realpath(root); } catch { continue; }
        if (seen.has(real)) continue;
        seen.add(real);
        files.push(...await sourceFiles(real, !rootHasBundler(real)));
    }
    const routes: HarvestedRoute[] = [];
    const prefixes = new Set<string>();
    const routeCount = new Map<string, number>();
    const testFiles: string[] = [];
    const source: string[] = [];
    const tests: string[] = [];
    const labelKeys: Record<string, Set<string>> = {};
    const unique = Array.from(new Set(files));
    const texts = await readSources(unique);
    for (const [index, file] of unique.entries()) {
        const raw = texts[index];
        if (raw === null) continue;
        const text = stripComments(raw, file);
        if (isTestFile(file)) { testFiles.push(file); tests.push(text); continue; }
        source.push(text);
        harvestLabelKeys(text, records, labelKeys);
        if (MARKUP_EXT.test(file) || CLIENT_FILE.test(text)) continue;
        const before = routes.length;
        harvestRoutes(text, file, routes, prefixes);
        if (routes.length > before) routeCount.set(file, routes.length - before);
    }
    for (const route of routes) {
        if (!route.known || route.method === 'use' || route.dynamic) continue;
        const segments = route.path.split('/').filter(Boolean);
        let last = -1;
        segments.forEach((s, i) => { if (!isParamSegment(s)) last = i; });
        if (last >= 0) prefixes.add(`${joinPath(...segments.slice(0, last))}/`.replace(/^\/\/$/u, '/'));
    }
    return {
        routes,
        prefixes: Array.from(prefixes),
        serverFiles: Array.from(routeCount.entries()).sort((a, b) => b[1] - a[1]).map(([file]) => file),
        testFiles,
        sourceText: source.join('\n'),
        testText: tests.join('\n'),
        labelKeys: Object.fromEntries(Object.entries(labelKeys).map(([k, v]) => [k, Array.from(v)])),
    };
}

type ReceiverKind = 'app' | 'router' | null;

/** Is this receiver something that SERVES routes in this file — and is its path the served path? */
function jsReceivers(text: string): (name: string) => ReceiverKind {
    const apps = new Set<string>();
    const routers = new Set<string>();
    const clients = new Set<string>();
    const params = new Set<string>();
    const imported = new Set<string>();
    for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:require\(\s*['"](?:express|fastify|koa|hono)['"]\s*\)\s*\(|express\s*\(|[Ff]astify\s*\(|new\s+Koa\s*\(|new\s+Hono\s*\(|(?:https?\.)?createServer\s*\()/gu)) apps.add(m[1]);
    for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\s*\.\s*Router|Router|require\(\s*['"]express['"]\s*\)\s*\.\s*Router|new\s+(?:Koa)?Router)\s*\(/gu)) routers.add(m[1]);
    for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:axios|ky|got|superagent)\s*\.\s*(?:create|extend|defaults)\b/gu)) clients.add(m[1]);
    for (const m of text.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)|\(([^()]*)\)\s*=>|(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/gu)) {
        for (const name of String(m[1] || m[2] || m[3] || '').split(',')) {
            const clean = name.replace(/[:=].*$/u, '').replace(/[{}\s.]/gu, '').trim();
            if (clean) params.add(clean);
        }
    }
    for (const m of text.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gu)) {
        const name = m[1] || m[3];
        if (name) imported.add(name);
    }
    const SERVER_NAME = /^(?:app|application|server|fastify)$/iu;
    const ROUTER_NAME = /^(?:router|routes|[\w$]*Router|[\w$]*Routes)$/u;
    return (name: string) => {
        const lower = name.toLowerCase();
        // What this file binds the name to decides first: «const api = express()» serves.
        if (apps.has(name)) return 'app';
        if (routers.has(name)) return 'router';
        if (clients.has(name) || CLIENT_RECEIVERS.has(lower)) return null;
        if (params.has(name) || imported.has(name)) {
            if (SERVER_NAME.test(name)) return 'app';
            if (ROUTER_NAME.test(name) || /^router$/iu.test(name)) return 'router';
            return null;
        }
        if (SERVER_NAME.test(name)) return 'app';
        if (ROUTER_NAME.test(name) || lower === 'router') return 'router';
        return null;
    };
}

function harvestRoutes(text: string, file: string, routes: HarvestedRoute[], prefixes: Set<string>): void {
    const receiverKind = jsReceivers(text);
    for (const m of text.matchAll(JS_ROUTE)) {
        const kind = receiverKind(String(m[1] || ''));
        if (!kind) continue;
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
        routes.push({ path: routePath, method, file, dynamic: routePath.includes('${'), known: kind === 'app' && !routePath.includes('${') });
        if (method === 'use') prefixes.add(routePath.endsWith('/') ? routePath : `${routePath}/`);
    }
    // Python: an application's decorator path is the served path; a router's or
    // blueprint's joins its own prefix, and may be mounted under another.
    const pyApps = new Set(Array.from(text.matchAll(PY_APP)).map(m => m[1]));
    const pyRouters = new Map<string, string>();
    for (const m of text.matchAll(PY_ROUTER)) pyRouters.set(m[1], String(m[2] || '').match(PY_PREFIX_ARG)?.[1] || '');
    for (const m of text.matchAll(PY_INCLUDE_PREFIX)) {
        const prefix = String(m[1] || '');
        if (prefix.startsWith('/')) prefixes.add(prefix.endsWith('/') ? prefix : `${prefix}/`);
    }
    for (const m of text.matchAll(PY_DECORATOR)) {
        const receiver = String(m[1] || '');
        const method = String(m[2] || '').toLowerCase();
        const decorated = String(m[3] || '');
        if (pyRouters.has(receiver)) {
            const prefix = pyRouters.get(receiver) || '';
            if (prefix.startsWith('/')) prefixes.add(prefix.endsWith('/') ? prefix : `${prefix}/`);
            routes.push({ path: prefix ? `${joinPath(prefix, decorated)}${decorated.endsWith('/') ? '/' : ''}` : decorated, method, file, dynamic: false, known: false });
        } else {
            routes.push({ path: decorated, method, file, dynamic: false, known: pyApps.has(receiver) || receiver === 'app' });
        }
    }
    for (const m of text.matchAll(DJANGO_PATH)) routes.push({ path: `/${String(m[1] || '').replace(/^\//u, '')}`, method: 'route', file, dynamic: false, known: false });
    for (const m of text.matchAll(GO_HANDLE)) routes.push({ path: String(m[1] || ''), method: 'route', file, dynamic: false, known: true });
}

function harvestLabelKeys(text: string, records: RequestedRecord[], out: Record<string, Set<string>>): void {
    for (const record of records) {
        const labels = Array.from(new Set([record.ar, record.item, /[a-z]/iu.test(record.en) ? record.en : ''].map(s => String(s || '').trim()).filter(s => s.length >= 2)));
        for (const label of labels) {
            const quoted = new RegExp(`["'\`]${escapeRe(label)}["'\`]`, 'gu');
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
    const latin = [record.key, /[a-z]/iu.test(record.en) && !/[؀-ۿ]/u.test(record.en) ? record.en : '', ...labelKeys];
    return Array.from(new Set(latin.flatMap(forms)));
}

/**
 * A record whose only Latin name is a transliteration of his Arabic word
 * («العلاجات» → alajats, no dictionary English, no key bound to his label in
 * the source): a build that serves it under its real English name cannot be
 * matched — so a non-match is «not measured», never «not served».
 */
export function transliteratedOnly(record: RequestedRecord, labelKeys: string[] = []): boolean {
    const arabicLabel = /[؀-ۿ]/u.test(record.ar || record.item);
    const latinEn = /[a-z]/iu.test(record.en) && !/[؀-ۿ]/u.test(record.en);
    return arabicLabel && !latinEn && !curatedNounKey(record.ar || record.item) && !labelKeys.length;
}

export type ProbeResult = 'served' | 'absent' | 'inconclusive';

const routeLike = (status: number, contentType: string) =>
    ((status >= 200 && status < 300) || status === 401 || status === 403 || status === 405) && !/text\/html/iu.test(contentType);

/** One path the probe should GET for a record; `refutable` when a 404 there means «not served». */
export interface ProbePath { path: string; refutable: boolean }

/**
 * GET-only runtime probe. Never writes user data, never follows a redirect
 * off the base origin.
 *
 *   - A record with registered routes is probed on the EXACT path its route
 *     serves (with and without a trailing slash; a redirect to the same path
 *     plus «/» is followed once — FastAPI's 307). Its parent path answers a
 *     negative control first: a parent that «serves» an absent nonce is a
 *     catch-all and proves nothing either way.
 *   - Only a refutable path (registered on an application object) can make
 *     the record «absent»; a router's path may be mounted elsewhere.
 *   - A record with no registered route is probed under the prefixes the
 *     tree's own routes use; «absent» only from such a prefix. With no
 *     routes at all the probe can prove a record, never refute it.
 */
export async function probeServedResources(
    baseUrl: string,
    prefixes: string[],
    records: Array<{ key: string; ids: string[]; paths?: ProbePath[] }>,
    opts: { signal?: AbortSignal; timeoutMs: number; details?: Record<string, string[]> },
): Promise<Record<string, ProbeResult>> {
    const base = String(baseUrl || '').replace(/\/+$/u, '');
    const result: Record<string, ProbeResult> = Object.fromEntries(records.map(r => [r.key, 'inconclusive' as ProbeResult]));
    if (!base) return result;
    let origin = '';
    try { origin = new URL(base).origin; } catch { return result; }
    const note = (key: string, line: string) => { if (opts.details) (opts.details[key] ||= []).push(line); };
    // node:http, not fetch: the same transport in the API process and in tests,
    // no automatic redirect following, and a hard per-answer bound.
    const get = (url: string): Promise<{ status: number; type: string; location: string } | null> => new Promise(resolve => {
        if (opts.signal?.aborted) return resolve(null);
        let settled = false;
        const finish = (value: { status: number; type: string; location: string } | null) => {
            if (settled) return;
            settled = true;
            opts.signal?.removeEventListener('abort', onAbort);
            resolve(value);
        };
        let req: http.ClientRequest;
        const onAbort = () => { req?.destroy(); finish(null); };
        try {
            const target = new URL(url);
            if (target.origin !== origin) return finish(null);
            const client = target.protocol === 'https:' ? https : http;
            req = client.request(target, { method: 'GET', timeout: Math.max(1, opts.timeoutMs) }, res => {
                const type = String(res.headers['content-type'] || '');
                const location = String(res.headers.location || '');
                res.resume();
                res.on('end', () => finish({ status: res.statusCode || 0, type, location }));
                res.on('error', () => finish({ status: res.statusCode || 0, type, location }));
            });
        } catch {
            return finish(null);
        }
        req.on('timeout', () => { req.destroy(); finish(null); });
        req.on('error', () => finish(null));
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        req.end();
    });
    const nonce = `__joe_absent_${Date.now().toString(36)}`;
    const controls = new Map<string, boolean>();
    /** Does this parent answer an absent path as absent (true), or is it a catch-all / silent (false)? */
    const conclusiveParent = async (parent: string): Promise<boolean> => {
        if (!controls.has(parent)) {
            const control = await get(`${base}${parent}${nonce}`);
            controls.set(parent, !!control && !routeLike(control.status, control.type));
        }
        return controls.get(parent) === true;
    };
    const answers = async (pathname: string): Promise<boolean> => {
        const first = await get(`${base}${pathname}`);
        if (!first) return false;
        if (routeLike(first.status, first.type)) return true;
        if (first.status >= 300 && first.status < 400 && first.location) {
            let next = '';
            try { next = new URL(first.location, `${base}${pathname}`).pathname; } catch { next = ''; }
            if (next === `${pathname}/` || `${next}/` === pathname) {
                const second = await get(`${base}${next}`);
                return !!second && routeLike(second.status, second.type);
            }
        }
        return false;
    };
    const parentOf = (pathname: string) => {
        const segments = pathname.split('/').filter(Boolean);
        return `${joinPath(...segments.slice(0, -1))}/`.replace(/^\/\/$/u, '/');
    };
    const used = Array.from(new Set(prefixes.map(p => {
        const withLead = p.startsWith('/') ? p : `/${p}`;
        return withLead.endsWith('/') ? withLead : `${withLead}/`;
    })));
    const servedUnder = new Set<string>();
    const unprovenUnder = new Map<string, string[]>();
    for (const record of records) {
        if (opts.signal?.aborted) break;
        const paths = (record.paths || []).filter(p => p.path && !isParamSegment(p.path.split('/').filter(Boolean).pop() || ''));
        if (paths.length) {
            let refuted = false;
            for (const candidate of paths) {
                const pathname = joinPath(candidate.path);
                if (await answers(pathname) || await answers(`${pathname}/`)) {
                    result[record.key] = 'served';
                    note(record.key, `probe: GET ${pathname} answered`);
                    break;
                }
                if (candidate.refutable && await conclusiveParent(parentOf(pathname))) {
                    refuted = true;
                    note(record.key, `probe: GET ${pathname} is registered but does not answer`);
                }
            }
            if (result[record.key] !== 'served' && refuted) result[record.key] = 'absent';
            continue;
        }
        for (const prefix of used.length ? used : ['/api/', '/']) {
            if (!(await conclusiveParent(prefix))) continue;
            for (const id of record.ids.slice(0, 8)) {
                if (await answers(`${prefix}${id}`)) {
                    result[record.key] = 'served';
                    servedUnder.add(prefix);
                    note(record.key, `probe: GET ${prefix}${id} answered`);
                    break;
                }
            }
            if (result[record.key] === 'served') break;
            unprovenUnder.set(record.key, [...(unprovenUnder.get(record.key) || []), prefix]);
        }
    }
    // A prefix the tree's routes use, or where another of his records answered,
    // is where his records live: nothing answering there is absent. Elsewhere a
    // silence proves nothing.
    for (const [key, prefixesTried] of unprovenUnder) {
        if (result[key] === 'served') continue;
        const proving = prefixesTried.filter(prefix => used.includes(prefix) || servedUnder.has(prefix));
        if (proving.length) {
            result[key] = 'absent';
            note(key, `probe: nothing answers under ${proving.join(', ')}`);
        }
    }
    return result;
}

// ─── running the tests he asked for ─────────────────────────────────────────

export interface RequestedTestsRun {
    root: string;
    /** The project's own tests executed (a runner existed and ran). */
    ran: boolean;
    passed: boolean;
    /** No runner Joe knows for this stack: «tested» is then not measured, never assumed. */
    noRunner?: boolean;
    runner?: string;
    error?: string;
}

/** A test script that does work — the one placeholder reader decides (placeholder-script, Q9). */
const hasRealTestScript = (scripts: Record<string, unknown>) => isRealScript(scripts.test);

/** The root whose own test runner proves the tests: the manifest nearest the server file, or the run root. */
export function requestedTestsRoot(evidence: CoverageEvidence, runRoot: string, roots: string[]): string {
    const isProject = (dir: string) => ['package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'go.mod'].some(f => fs.existsSync(path.join(dir, f)));
    const nearest = (file: string, within: string[]): string => {
        let dir = path.dirname(file);
        for (let i = 0; i < 12; i++) {
            if (isProject(dir) && within.some(r => isWithin(dir, r))) return dir;
            const up = path.dirname(dir);
            if (up === dir) break;
            dir = up;
        }
        return '';
    };
    const scope = Array.from(new Set([runRoot, ...roots].map(r => String(r || '').trim()).filter(Boolean).map(r => path.resolve(r))));
    for (const file of evidence.serverFiles) {
        const found = nearest(file, scope);
        if (found) return found;
    }
    return runRoot ? path.resolve(runRoot) : (scope[0] || '');
}

function isWithin(file: string, root: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(file));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Python's test-file names, as pytest and unittest find them; the shared runner lists a folder by the same rule. */
const PYTHON_TEST_FILE = /^(?:test.*|.*_test)\.py$/u;
/** A Python environment's own packages: never his tests. */
const PYTHON_PACKAGES_DIR = /^(?:site|dist)-packages$/u;

/**
 * The folders under the root that hold his Python test files, walked without
 * holding the event loop (a bounded number of folders read side by side, as
 * sourceFiles does). Machine state, build output, dot-folders and a Python
 * environment — known by its pyvenv.cfg, whatever the folder is called, and
 * its site-packages — are not his tests.
 */
async function pythonTestFolders(root: string): Promise<string[]> {
    const found = new Set<string>();
    let level = [root];
    while (level.length) {
        const next: string[] = [];
        for (let i = 0; i < level.length; i += READ_CONCURRENCY) {
            const listed = await Promise.all(level.slice(i, i + READ_CONCURRENCY).map(dir =>
                fs.promises.readdir(dir, { withFileTypes: true }).then(entries => ({ dir, entries }), () => ({ dir, entries: [] as fs.Dirent[] }))));
            for (const { dir, entries } of listed) {
                if (dir !== root && entries.some(entry => entry.isFile() && entry.name === 'pyvenv.cfg')) continue;
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        if (entry.name.startsWith('.') || isMachineStateDirectory(entry.name) || BUILD_OUTPUT.has(entry.name) || PYTHON_PACKAGES_DIR.test(entry.name)) continue;
                        next.push(path.join(dir, entry.name));
                    } else if (entry.isFile() && PYTHON_TEST_FILE.test(entry.name)) {
                        found.add(dir);
                    }
                }
            }
        }
        level = next;
    }
    return [...found].map(dir => (path.relative(root, dir) || '.').split(path.sep).join('/')).sort();
}

const exists = (file: string) => fs.promises.access(file).then(() => true, () => false);

/**
 * Run his project's own tests once: npm's test script through quality_run, or
 * his Python tests through the one Python test runner (python-test-runner) —
 * pytest where it is installed, else the standard-library runner that also
 * runs pytest-style tests. The caller supplies the tool executor, so the run
 * goes through the same execution path as every tool — named `runTool`: the
 * boot gate (ExecutionEnforcer) reads any bare call of a function named exec
 * in Joe's source as a process spawn, and refuses to start.
 *
 * A run that ran no test is not a pass (round 21): unittest before Python 3.12
 * prints «Ran 0 tests … OK» and exits 0, pytest exits 0 when every test was
 * skipped. The one test-run judge reads the runner's own summary
 * (test-run-evidence), as quality_run does for npm's test script.
 *
 * ⛔ HIS TESTS, WHEREVER HE PUT THEM (round 21 review, Q8). `python -m
 * unittest discover` from the root walks only into packages: the default
 * target this gate's own repair writes, tests/test_requested_records.py, has
 * no __init__.py beside it, so working tests ran as «Ran 0 tests», exit 5 —
 * and a pytest-style file never ran at all unless the project declared pytest.
 * The test files are now found here, and the runner is given their folders.
 */
export async function runRequestedTests(root: string, runTool: (tool: string, input: any) => Promise<any>): Promise<RequestedTestsRun> {
    const dir = String(root || '').trim();
    if (!dir || !(await exists(dir))) return { root: dir, ran: false, passed: false, error: 'no project root to run the requested tests in' };
    let scripts: Record<string, string> = {};
    const hasManifest = await exists(path.join(dir, 'package.json'));
    if (hasManifest) {
        try { scripts = JSON.parse(await fs.promises.readFile(path.join(dir, 'package.json'), 'utf8'))?.scripts || {}; } catch { scripts = {}; }
    }
    if (hasManifest && hasRealTestScript(scripts)) {
        try {
            const run = await runTool('quality_run', { path: dir, tasks: ['test'] });
            const executed = Array.isArray(run?.output?.results) ? run.output.results.filter((r: any) => r?.skipped === false) : [];
            const passed = run?.ok === true && executed.length > 0;
            return { root: dir, ran: executed.length > 0, passed, runner: 'npm test', error: passed ? undefined : String(run?.error || executed[0]?.error || 'the test script did not pass').slice(0, 400) };
        } catch (error: any) {
            return { root: dir, ran: false, passed: false, runner: 'npm test', error: String(error?.message || error).slice(0, 300) };
        }
    }
    const projectMarkers = await Promise.all(['pyproject.toml', 'requirements.txt', 'setup.py', 'manage.py'].map(f => exists(path.join(dir, f))));
    const pythonProject = projectMarkers.some(Boolean)
        || await fs.promises.readdir(dir).then(names => names.some(name => /\.py$/iu.test(name)), () => false);
    if (pythonProject) {
        const folders = await pythonTestFolders(dir);
        // The runner as a delivered script would run it; the interpreter is
        // the name this machine — the one running the check — ships.
        const runner = 'python tests (pytest where installed, else the standard-library runner)';
        if (!folders.length) return { root: dir, ran: false, passed: false, runner, error: 'no Python test file (test*.py, *_test.py) in the project, so the requested tests cannot run' };
        const command = pythonTestCommand(folders, false, pythonExecutable());
        try {
            const run = await runTool('shell_execute', { command, cwd: dir });
            const printed = `${String(run?.output?.stdout ?? '')}\n${String(run?.output?.stderr ?? '')}`;
            const judged = judgeTestRun(run?.ok === true, printed);
            // The runner fails an empty run itself (exit 1): its summary still says why.
            const empty = judged.passed ? null : judged.ranNothing ?? emptyTestRun(printed);
            // A failure's own words are at the END of what the runner printed (the
            // assertion, «FAILED (failures=1)»): keep the end, not the first lines.
            const said = String(run?.output?.stderr || run?.error || 'the tests did not pass').trim();
            const error = judged.passed ? undefined
                : empty ? `the test command ran no tests (${empty.runner}: ${empty.evidence})`
                    : said.length > 400 ? `…${said.slice(-399)}` : said;
            return { root: dir, ran: true, passed: judged.passed, runner: `${runner} in ${folders.join(', ')}`.slice(0, 300), error: error?.slice(0, 400) };
        } catch (error: any) {
            return { root: dir, ran: false, passed: false, runner, error: String(error?.message || error).slice(0, 300) };
        }
    }
    if (hasManifest) return { root: dir, ran: false, passed: false, runner: 'npm test', error: 'package.json has no test script, so the requested tests cannot run' };
    return { root: dir, ran: false, passed: false, noRunner: true, error: 'no test runner Joe knows for this project' };
}

/** A fingerprint of the files a test run depends on — an unchanged tree is not re-run. */
export function testTreeFingerprint(root: string, evidence: CoverageEvidence): string {
    const files = [...evidence.serverFiles, ...evidence.testFiles, path.join(root, 'package.json')];
    return files.map(f => { try { const s = fs.statSync(f); return `${f}:${s.size}:${s.mtimeMs}`; } catch { return `${f}:-`; } }).sort().join('|');
}

// ─── the verdict ────────────────────────────────────────────────────────────

export interface RecordCoverage {
    key: string;
    ar: string;
    en: string;
    item: string;
    /** null: not measured (the probe and the source could not tell). */
    served: boolean | null;
    tested: boolean | null;
    present: boolean | null;
    evidence: string[];
}

export interface RequestCoverageReport {
    checked: number;
    records: RecordCoverage[];
    missing: RecordCoverage[];
    /** Records whose delivery could not be measured — the delivery is not verified, never «all built». */
    unverified?: RecordCoverage[];
    unread: string[];
    /** Rules only a live multi-account probe can measure — named, not yet measured. */
    capabilities?: string[];
    clauses?: string[];
    testsRequested: string | null;
    /** The executed run of his tests, when tests were asked for. */
    testsRun?: RequestedTestsRun;
    servedApplies: boolean;
    /** The server file that registers most routes — the repair target. */
    serverFile: string;
    serverFiles?: string[];
    /** Resources the server already serves statically — the pattern a repair follows. */
    patternResources: string[];
    prefixes: string[];
    /** The project's own test files — where a tests repair goes. */
    testFiles: string[];
}

const wordIn = (text: string, id: string) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(id)}([^A-Za-z0-9]|$)`, 'iu').test(text);

/** Test text with skipped and todo tests taken out: a skipped test is not evidence. */
export function liveTestText(testText: string): string {
    let text = String(testText || '');
    const opener = /(?:\b(?:it|test|describe|context)\s*\.\s*(?:skip|todo)|\bx(?:it|test|describe|context))\s*\(/gu;
    for (let guard = 0; guard < 200; guard++) {
        opener.lastIndex = 0;
        const m = opener.exec(text);
        if (!m) break;
        let depth = 0;
        let end = m.index + m[0].length - 1;
        let quote = '';
        for (let i = end; i < text.length; i++) {
            const c = text[i];
            if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
            end = i;
        }
        text = `${text.slice(0, m.index)}${text.slice(end + 1)}`;
    }
    // Python: a decorated skip drops the test that follows it.
    text = text.replace(/^([ \t]*)@(?:unittest\.skip\w*|pytest\.mark\.(?:skip\w*|xfail))[^\n]*\n(?:\1@[^\n]*\n)*\1(?:async\s+)?def\b[^\n]*\n(?:(?:\1[ \t]+[^\n]*|[ \t]*)\n)*/gmu, '');
    return text;
}

function staticRouteMatches(routes: HarvestedRoute[], ids: string[]): Array<{ route: HarvestedRoute; writeOnly: boolean; nested: boolean; readable: boolean; mount: boolean; exact: string }> {
    const wanted = new Set(ids.map(id => id.toLowerCase()));
    const matches: Array<{ route: HarvestedRoute; writeOnly: boolean; nested: boolean; readable: boolean; mount: boolean; exact: string }> = [];
    for (const route of routes) {
        const segments = route.path.split('/').filter(Boolean);
        for (let i = 0; i < segments.length; i++) {
            if (isParamSegment(segments[i]) || !wanted.has(segments[i].toLowerCase())) continue;
            const nested = segments.slice(0, i).some(isParamSegment);
            const mount = route.method === 'use';
            matches.push({
                route,
                writeOnly: ['post', 'put', 'patch', 'delete'].includes(route.method),
                nested,
                readable: !mount && !nested && ['get', 'all', 'route', 'api_route'].includes(route.method),
                mount,
                exact: nested ? '' : joinPath(...segments.slice(0, i + 1)),
            });
        }
    }
    return matches;
}

/** The exact paths the probe should GET for one record, from its registered routes. */
export function probePathsFor(evidence: CoverageEvidence, ids: string[]): ProbePath[] {
    const out: ProbePath[] = [];
    const mounts = evidence.routes.filter(r => r.method === 'use' && r.known && !r.dynamic).map(r => r.path);
    for (const match of staticRouteMatches(evidence.routes, ids)) {
        if (!match.exact || !(match.readable || match.mount)) continue;
        if (match.route.known && match.readable) out.push({ path: match.exact, refutable: true });
        else {
            out.push({ path: match.exact, refutable: false });
            for (const mount of mounts) if (!match.exact.startsWith(joinPath(mount))) out.push({ path: joinPath(mount, match.exact), refutable: false });
        }
    }
    const seen = new Set<string>();
    return out.filter(p => { const k = `${p.path}|${p.refutable}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function judgeRequestCoverage(input: {
    records: RequestedRecords;
    evidence: CoverageEvidence;
    probe?: Record<string, ProbeResult>;
    probeDetails?: Record<string, string[]>;
    backendRequested: boolean;
    /** The executed run of his tests; «tested» needs it to have passed. */
    testsRun?: RequestedTestsRun;
}): RequestCoverageReport {
    const { records, evidence } = input;
    const servedApplies = input.backendRequested === true || evidence.routes.length > 0;
    const liveTests = liveTestText(evidence.testText);
    const out: RecordCoverage[] = records.entities.map(record => {
        const labelKeys = evidence.labelKeys[record.key] || [];
        const ids = identifiersFor(record, labelKeys);
        const onlyTransliterated = transliteratedOnly(record, labelKeys);
        const why: string[] = [];
        let served: boolean | null = null;
        let present: boolean | null = null;
        if (servedApplies) {
            const matches = staticRouteMatches(evidence.routes, ids);
            const readable = matches.filter(m => m.readable);
            const unseen = matches.filter(m => m.writeOnly || m.nested);
            const mounts = matches.filter(m => m.mount);
            const probed = input.probe?.[record.key];
            const shown = readable[0] || unseen[0] || mounts[0];
            if (shown) why.push(`route ${shown.route.method.toUpperCase()} ${shown.route.path} (${path.basename(shown.route.file)})`);
            for (const line of input.probeDetails?.[record.key] || []) why.push(line);
            if (probed && !(input.probeDetails?.[record.key] || []).length) why.push(`probe: ${probed}`);
            if (probed === 'served') served = true;
            else if (probed === 'absent') {
                // A registered GET route that does not answer is not served; a
                // write-only or nested route is what the GET probe cannot see.
                served = readable.length ? false : unseen.length ? true : mounts.length ? null : false;
            } else {
                served = (readable.length || unseen.length) ? true : mounts.length ? null : evidence.routes.length ? false : null;
            }
            if (served === false && onlyTransliterated && !readable.length) served = null;
            if (served === null) why.push(onlyTransliterated ? 'its only Latin name is a transliteration — not measured' : 'the source and the probe could not tell — not measured');
        } else {
            const quotedLabel = (label: string) => !!label && new RegExp(`["'\`][^"'\`]*${escapeRe(label)}[^"'\`]*["'\`]`, 'u').test(evidence.sourceText);
            const markupLabel = (label: string) => !!label && /[؀-ۿ]/u.test(label) && new RegExp(`>[^<]*${escapeRe(label)}`, 'u').test(evidence.sourceText);
            present = ids.some(id => wordIn(evidence.sourceText, id))
                || [record.ar, record.item].some(label => quotedLabel(label) || markupLabel(label));
            if (!present && onlyTransliterated) { present = null; why.push('its only Latin name is a transliteration — not measured'); }
        }
        let tested: boolean | null = null;
        if (records.testsRequested) {
            const mentioned = servedApplies
                ? ids.some(id => new RegExp(`/${escapeRe(id)}(?![A-Za-z0-9_])`, 'iu').test(liveTests))
                : ids.some(id => wordIn(liveTests, id));
            const run = input.testsRun;
            if (!run) tested = mentioned ? null : false;
            else if (!run.ran) tested = run.noRunner ? null : false;
            else tested = mentioned && run.passed;
            if (records.testsRequested && !mentioned) why.push('no test exercises its route');
            if (run && run.ran && !run.passed) why.push(`its project's tests failed (${run.runner || 'tests'})`);
            if (tested === null) why.push(run?.noRunner ? 'no runner for this project\'s tests — tests not measured' : 'its tests were not run — not measured');
            if (tested === false && onlyTransliterated && !mentioned) tested = null;
        }
        return { key: record.key, ar: record.ar, en: record.en, item: record.item, served, tested, present, evidence: why };
    });
    const serverFiles = evidence.serverFiles || [];
    const patternResources = Array.from(new Set(evidence.routes
        .filter(route => !route.dynamic)
        .map(route => route.path.split('/').filter(Boolean).filter(s => !isParamSegment(s)).pop() || '')
        .filter(s => s && !/^(?:api|health|auth|login|logout|me)$/iu.test(s))));
    const missing = out.filter(r => r.served === false || r.tested === false || r.present === false);
    return {
        checked: out.length,
        records: out,
        missing,
        unverified: out.filter(r => !missing.includes(r) && ((servedApplies && r.served === null) || (!servedApplies && r.present === null) || (records.testsRequested && r.tested === null))),
        unread: records.unread,
        capabilities: records.capabilities || [],
        clauses: records.clauses || [],
        testsRequested: records.testsRequested,
        ...(input.testsRun ? { testsRun: input.testsRun } : {}),
        servedApplies,
        serverFile: serverFiles[0] || '',
        serverFiles,
        patternResources,
        prefixes: evidence.prefixes,
        testFiles: evidence.testFiles,
    };
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

/** What could not be measured, named: records the probe could not see, and stated rules no instrument measures yet. */
export function coverageUnverified(report: RequestCoverageReport): string[] {
    const records = (report.unverified || []).map(record => {
        const label = record.ar && record.ar !== record.key ? `${record.key} — ${record.ar}` : record.key;
        const what = [record.served === null && report.servedApplies ? 'serving not measured' : '', record.present === null && !report.servedApplies ? 'presence not measured' : '', record.tested === null && report.testsRequested ? 'tests not measured' : ''].filter(Boolean).join(', ');
        return `${label} (${what || 'not measured'})`;
    });
    return [...records, ...(report.capabilities || []).map(c => `${c} (not measured)`)];
}

export interface RequestCoverageRepairTask {
    dimension: 'served' | 'tested';
    task: string;
    error: string;
    /** Absolute; the server file that already serves resources, or the project's test file. */
    repairFile: string;
    description: string;
    /** JSON: the records as structured data — never text appended to his request. */
    artifactContext: string;
    /**
     * A deterministic manifest edit the tests repair needs: his package.json
     * has no test script, so tests written into `repairFile` would never run.
     * The caller applies it (with the same snapshot and restore as the file).
     */
    manifestPatch?: { file: string; script: string };
}

/** Is this a Python project (its own runner is unittest/pytest, never node:test)? */
function pythonRoot(root: string, serverFile: string): boolean {
    if (/\.py$/iu.test(serverFile)) return true;
    return ['pyproject.toml', 'requirements.txt', 'setup.py', 'manage.py'].some(f => fs.existsSync(path.join(root, f)));
}

/** The test script a node project needs to run tests written in tests/, or null when it already has a real one. */
export function testScriptPatchFor(root: string): { file: string; script: string } | null {
    const file = path.join(root, 'package.json');
    if (!fs.existsSync(file)) return null;
    try {
        const scripts = JSON.parse(fs.readFileSync(file, 'utf8'))?.scripts || {};
        if (hasRealTestScript(scripts)) return null;
    } catch { return null; }
    return { file, script: 'node --test tests/' };
}

/** Apply a manifest patch; returns the bytes before, for the caller's restore. */
export function applyTestScriptPatch(patch: { file: string; script: string }): Buffer | null {
    try {
        const before = fs.readFileSync(patch.file);
        const manifest = JSON.parse(before.toString('utf8'));
        manifest.scripts = { ...(manifest.scripts || {}), test: patch.script };
        const eol = before.toString('utf8').includes('\r\n') ? '\r\n' : '\n';
        fs.writeFileSync(patch.file, `${JSON.stringify(manifest, null, 2).replace(/\n/gu, eol)}${eol}`);
        return before;
    } catch {
        return null;
    }
}

/**
 * The single evidence-bound repair for a coverage gap: serving first (the
 * server file that already registers routes, following the resources it
 * serves), then tests (the project's own test file, or a new one beside the
 * server, in the project's own language and runner). Every target lies inside
 * the server root — a repair never rewrites the interface's API client or its
 * UI test. No server file there means no evidence-bound target: null, never a
 * guessed file.
 */
export function requestCoverageRepairTask(
    report: RequestCoverageReport,
    opts: { request: string; serverRoot: string; testFiles: string[] },
): RequestCoverageRepairTask | null {
    const root = String(opts.serverRoot || '').trim();
    if (!root) return null;
    const notServed = report.missing.filter(r => r.served === false || r.present === false);
    const untested = report.missing.filter(r => r.tested === false && r.served !== false && r.present !== false);
    const label = (r: RecordCoverage) => (r.ar && r.ar !== r.key ? `${r.key} (${r.ar})` : r.key);
    const context = (records: RecordCoverage[]) => JSON.stringify({
        entities: records.map(r => ({ key: r.key, ar: r.ar, en: r.en })),
        patternResources: report.patternResources,
        prefixes: report.prefixes,
        deliverables: report.testsRequested ? [report.testsRequested] : [],
    });
    const serverFile = [report.serverFile, ...(report.serverFiles || [])].find(file => file && isWithin(file, root)) || '';
    if (notServed.length) {
        if (!serverFile) return null;
        const names = notServed.map(label).join(', ');
        const pattern = report.patternResources.length ? report.patternResources.join(', ') : 'the resources it already serves';
        return {
            dimension: 'served',
            task: `Serve the records the request named in this server: ${names}. Follow exactly how it already serves ${pattern}`
                + `${report.prefixes.length ? ` under ${report.prefixes.join(', ')}` : ''}: list, read one, create, update and delete each, with its own storage. `
                + 'Keep every existing route and behaviour working.',
            error: `requested_entities_not_served: ${names}`.slice(0, 900),
            repairFile: serverFile,
            description: String(opts.request || '').slice(0, 4000),
            artifactContext: context(notServed),
        };
    }
    if (untested.length) {
        const names = untested.map(label).join(', ');
        const python = pythonRoot(root, serverFile);
        const own = (opts.testFiles || []).filter(file => isWithin(file, root) && (python ? /\.py$/iu.test(file) : /\.[cm]?[jt]sx?$/iu.test(file)));
        const target = own[0] || path.join(root, 'tests', python ? 'test_requested_records.py' : 'requested-records.test.js');
        const manifestPatch = python ? null : testScriptPatchFor(root);
        return {
            dimension: 'tested',
            task: `Add automated tests, run by the project's own test runner (${python ? 'unittest or pytest' : 'node:test via the test script'}), that exercise the routes of: ${names} — `
                + 'a successful request, invalid input refused, and an unknown id answered as not found.',
            error: `requested_entity_tests_missing: ${names}`.slice(0, 900),
            repairFile: target,
            description: String(opts.request || '').slice(0, 4000),
            artifactContext: context(untested),
            ...(manifestPatch ? { manifestPatch } : {}),
        };
    }
    return null;
}
