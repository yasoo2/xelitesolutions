/**
 * THE ENGINE'S FILE TOOLS.
 *
 * Five registered tools the agent engine reaches through
 * ToolService.executeTool. core/engine/tools/files.ts gives them to the model
 * as file_read, file_write, file_edit, file_list and file_search. They act
 * inside the run's project folder and nowhere else:
 *
 *  - the folder is context.projectRoot, never a model argument, and it must
 *    lie inside the workspace Joe resolved for the request
 *    (workspaceService.getActiveRoot) both as spelled and as resolved, so a
 *    project folder that is itself a link to somewhere else is refused;
 *  - every model path goes through resolveInProject (core/engine/workspace.ts),
 *    which refuses `..` escapes, links and junctions, secret files, and
 *    writes into .git, node_modules and .joe.
 *
 * Four choices, each with what it answers:
 *
 *  - Syntax is checked by esbuild and JSON.parse in one worker thread, never
 *    on the request thread. Measured (D:\Joe\eval\proof\engine\files\resume):
 *    esbuild's transformSync holds the thread that calls it for the whole
 *    parse, about 0.12 s for 200 KB and 0.5 s for 1 MB on this laptop, and an
 *    edit parses twice; on a server every other user would wait that long.
 *    And on the request thread esbuild's asynchronous `transform` cannot run
 *    at all: Joe's runtime ExecutionGuard, installed at boot, patches
 *    child_process there and blocks esbuild's service («Direct spawn
 *    blocked»). The worker has its own child_process, as esbuild's own
 *    transformSync worker does, so the check answers on his machine too.
 *  - A regular expression the model wrote runs in a worker thread with a
 *    deadline. `(a+)+$` against one long line backtracks for minutes; on the
 *    request thread that would stop every user of the server.
 *  - A write is a temporary file renamed over the target, so a dev server or
 *    the browser never reads half a file.
 *  - Every bounded output says what it left out and how to get the rest.
 *
 * Text the model reads is English. File content is never translated or
 * normalised: an Arabic line is matched, shown and written as it is.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { Worker } from 'worker_threads';
import { BaseTool } from '../base';
import type { ToolExecutionResult, ToolPermission } from '../types';
import { workspaceService } from '../../services/WorkspaceService';
import { resolveInProject, projectRootProblem, isSecretName } from '../../../core/engine/workspace';
import { prepareArtifactContent, validateArtifactContent } from '../artifact-validation';
import { broadcast } from '../../../api/ws';
import { isMachineStateDirectory, installedEnvironmentKind, mapBounded, PROJECT_FS_CONCURRENCY } from '../../../shared/utils/project-tree';
import { editAlreadyApplied } from '../../../shared/utils/edit-in-place';

/* ───────────────────────── bounds (each one is announced when it is reached) ───────────────────────── */

export const READ_DEFAULT_LIMIT = 400;
/** A longer line is cut, and the cut says how many characters are left on it. */
export const READ_LINE_CHARS = 1_000;
/** A read window stops at this many characters and says where to continue. */
export const READ_WINDOW_CHARS = 24_000;
/** Files up to this size are read whole (exact line count); larger ones in a streamed window. Also the edit and search size limit. */
export const WHOLE_FILE_BYTES = 16 * 1024 * 1024;
export const LIST_DEFAULT_DEPTH = 2;
export const LIST_MAX_LINES = 400;
export const LIST_MAX_CHARS = 16_000;
/** Entries one walk may visit before it stops and says so. */
export const WALK_MAX_ENTRIES = 50_000;
export const SEARCH_MAX_SHOWN = 100;
export const SEARCH_LINE_CHARS = 300;
export const SEARCH_OUTPUT_CHARS = 16_000;
export const SEARCH_TIMEOUT_MS = 30_000;
/** How long one syntax check may wait for the parser, queue included, before it is reported unchecked and the parser restarted. */
export const SYNTAX_TIMEOUT_MS = 60_000;
/**
 * Calls per minute ToolService allows each of these tools. Its bucket is the
 * tool's name (rateLimitBucketKey), and the engine's own loop already paces
 * the calls one model step at a time, so this only stops a runaway: a run
 * that reads a project makes a few dozen reads a minute, and many runs share
 * the bucket. A refused call would cost the run a failed step it cannot wait out.
 */
export const ENGINE_FILE_CALLS_PER_MINUTE = 600;
export const DIFF_MAX_LINES = 160;
export const DIFF_MAX_CHARS = 8_000;
/** A change wider than this is described, not diffed: the diff itself would cost more than the edit. */
export const DIFF_MAX_CHANGED_LINES = 4_000;
const SKIPPED_SHOWN = 12;
const MATCH_LINES_SHOWN = 50;
const HEAD_BYTES = 64 * 1024;

/** Folders a walk never enters (the brief's five; machine state from project-tree is added to them). */
const ALWAYS_SKIPPED = new Set(['node_modules', '.git', 'dist', 'build', '.joe']);

/* ───────────────────────── small helpers ───────────────────────── */

type Result = ToolExecutionResult;

function refuse(error: string, logs: string[] = []): Result {
    return { ok: false, error, logs };
}

function firstLine(value: unknown): string {
    return String(value ?? '').split(/\r?\n/u).find(line => line.trim())?.trim().slice(0, 300) ?? '';
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

export function humanBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function shownPath(rel: string): string {
    return rel === '' ? '.' : rel;
}

function stringArg(input: any, key: string): string | undefined {
    const value = input?.[key];
    return typeof value === 'string' ? value : undefined;
}

/** A positive whole number (a numeric string is accepted), undefined when absent, or the sentence that says what is wrong. */
function countArg(input: any, key: string, tool: string): number | undefined | { error: string } {
    const value = input?.[key];
    if (value === undefined || value === null || value === '') return undefined;
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/u.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(n) || n < 1) return { error: `${tool}: "${key}" must be a whole number of at least 1 (got ${JSON.stringify(value)}).` };
    return n;
}

function flagArg(input: any, key: string, tool: string): boolean | { error: string } {
    const value = input?.[key];
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return { error: `${tool}: "${key}" must be true or false (got ${JSON.stringify(value)}).` };
}

/* ───────────────────────── packages loaded when first needed ───────────────────────── */

/**
 * esbuild, diff, ignore and typescript are dev dependencies of the api
 * package, so an install without dev dependencies lacks them. Loaded when
 * first needed: a missing one is a sentence in one tool's answer, never a
 * registry that cannot start.
 */
type Optional<T> = { ok: true; value: T } | { ok: false; reason: string };
const optionalPackages = new Map<string, Optional<unknown>>();

function optional<T>(name: string, load: () => T): Optional<T> {
    const known = optionalPackages.get(name);
    if (known) return known as Optional<T>;
    let found: Optional<T>;
    try {
        const value = load();
        if (!value) throw new Error(`${name} exported nothing usable`);
        found = { ok: true, value };
    } catch (error: any) {
        found = { ok: false, reason: `the ${name} package is not installed here (${firstLine(error?.message)})` };
    }
    optionalPackages.set(name, found);
    return found;
}

interface IgnoreMatcher { add(patterns: string): IgnoreMatcher; test(pathname: string): { ignored: boolean; unignored: boolean } }
type IgnoreFactory = () => IgnoreMatcher;
type GlobMatcher = (input: string) => boolean;
type Picomatch = (glob: string, options?: { dot?: boolean; basename?: boolean }) => GlobMatcher;
interface Hunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }
interface DiffApi { structuredPatch(oldName: string, newName: string, oldText: string, newText: string, oldHeader: string, newHeader: string, options: { context: number }): { hunks: Hunk[] } }
interface TypeScriptApi {
    parseConfigFileTextToJson(fileName: string, text: string): { config?: unknown; error?: { start?: number; messageText: unknown } };
    flattenDiagnosticMessageText(message: unknown, newLine: string): string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
/** Where esbuild is, for the parser's worker; loaded here first, so a package that cannot load is known as missing. */
const esbuildPath = () => optional<string>('esbuild', () => {
    const lib = require('esbuild');
    if (typeof lib?.transform !== 'function') throw new Error('esbuild exported no transform');
    return require.resolve('esbuild');
});
const ignorePackage = () => optional<IgnoreFactory>('ignore', () => { const m = require('ignore'); return typeof m === 'function' ? m : m?.default; });
const picomatchPackage = () => optional<Picomatch>('picomatch', () => { const m = require('picomatch'); return typeof m === 'function' ? m : m?.default; });
const diffPackage = () => optional<DiffApi>('diff', () => require('diff'));
const typescriptPackage = () => optional<TypeScriptApi>('typescript', () => require('typescript'));
/* eslint-enable @typescript-eslint/no-var-requires */

/* ───────────────────────── the run's project folder ───────────────────────── */

type Bound = { ok: true; root: string } | { ok: false; error: string };

/**
 * The project folder from the ToolService context, checked against the
 * workspace as spelled (the brief's projectRootProblem call) and as resolved:
 * a project folder spelled inside the workspace that is a junction to
 * another drive is the same escape a model path through a link would be.
 */
async function bindProject(context: any): Promise<Bound> {
    const raw = context?.projectRoot;
    let active: string;
    try { active = workspaceService.getActiveRoot(context?.workspaceId); }
    catch (error: any) { return { ok: false, error: `The workspace could not be resolved: ${firstLine(error?.message)}` }; }
    const spelled = projectRootProblem(raw, active);
    if (spelled) return { ok: false, error: spelled };
    let realRoot: string;
    let realActive: string;
    try { realRoot = await fsp.realpath(raw as string); } catch { return { ok: false, error: 'The project folder does not exist.' }; }
    try { realActive = await fsp.realpath(active); } catch { return { ok: false, error: 'The workspace folder does not exist.' }; }
    if (projectRootProblem(realRoot, realActive)) {
        return { ok: false, error: 'The project folder is not inside this workspace: its path leads through a link to another folder.' };
    }
    return { ok: true, root: realRoot };
}

/** The path relative to the project folder as it is on disk (true case on Windows), forward slashes. */
async function diskRelative(root: string, abs: string, fallback: string): Promise<string> {
    try {
        const real = await fsp.realpath(abs);
        const rel = path.relative(root, real).split(path.sep).join('/');
        return rel && !rel.startsWith('..') ? rel : fallback;
    } catch { return fallback; }
}

/** The nearest folder that exists above a missing path, with what it holds: how a model fixes a typo. */
async function nearestFolderHint(root: string, rel: string): Promise<string> {
    let dir = path.posix.dirname(rel);
    for (;;) {
        const check = await resolveInProject(root, dir === '.' ? '' : dir, 'list');
        if (check.ok && check.exists && check.isDir) {
            let names: string[] = [];
            try {
                const entries = await fsp.readdir(check.abs, { withFileTypes: true });
                names = entries
                    .filter(e => !(e.isDirectory() && ALWAYS_SKIPPED.has(e.name.toLowerCase())))
                    .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
                    .sort(byName);
            } catch { /* an unreadable folder gives no hint */ }
            const where = dir === '.' ? 'The project folder' : `${dir}/`;
            if (!names.length) return ` ${where} is empty.`;
            const head = names.slice(0, 20).join(', ');
            return ` ${where} has: ${head}${names.length > 20 ? `, and ${names.length - 20} more` : ''}.`;
        }
        if (dir === '.' || dir === '' || dir === '/') return '';
        dir = path.posix.dirname(dir);
    }
}

function byName(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/* ───────────────────────── what a file is ───────────────────────── */

type Encoding = 'UTF-8' | 'UTF-8 with BOM' | 'UTF-16 LE' | 'UTF-16 BE';
type Sniffed =
    | { kind: 'image'; format: string; width?: number; height?: number }
    | { kind: 'binary'; what: string }
    | { kind: 'text'; encoding: Encoding; skip: number };

function startsWith(head: Buffer, bytes: number[], at = 0): boolean {
    if (head.length < at + bytes.length) return false;
    return bytes.every((b, i) => head[at + i] === b);
}

function jpegSize(head: Buffer): { width: number; height: number } | null {
    let i = 2;
    while (i + 9 < head.length) {
        if (head[i] !== 0xff) { i++; continue; }
        const marker = head[i + 1];
        if (marker === 0xff) { i++; continue; }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const length = head.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: head.readUInt16BE(i + 5), width: head.readUInt16BE(i + 7) };
        }
        i += 2 + length;
    }
    return null;
}

/** Format, and the pixel size when the header states it. */
function sniff(head: Buffer): Sniffed {
    if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return head.length >= 24 ? { kind: 'image', format: 'PNG', width: head.readUInt32BE(16), height: head.readUInt32BE(20) } : { kind: 'image', format: 'PNG' };
    }
    if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'image', format: 'JPEG', ...(jpegSize(head) ?? {}) };
    const ascii = head.subarray(0, 16).toString('latin1');
    if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) {
        return head.length >= 10 ? { kind: 'image', format: 'GIF', width: head.readUInt16LE(6), height: head.readUInt16LE(8) } : { kind: 'image', format: 'GIF' };
    }
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') {
        const chunk = ascii.slice(12, 16);
        if (chunk === 'VP8X' && head.length >= 30) return { kind: 'image', format: 'WebP', width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
        if (chunk === 'VP8 ' && head.length >= 30) return { kind: 'image', format: 'WebP', width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
        if (chunk === 'VP8L' && head.length >= 25) {
            const bits = head.readUInt32LE(21);
            return { kind: 'image', format: 'WebP', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        return { kind: 'image', format: 'WebP' };
    }
    if (ascii.startsWith('BM') && head.length >= 26 && [12, 40, 52, 56, 108, 124].includes(head.readUInt32LE(14))) {
        const core = head.readUInt32LE(14) === 12;
        return { kind: 'image', format: 'BMP', width: core ? head.readUInt16LE(18) : head.readInt32LE(18), height: Math.abs(core ? head.readUInt16LE(20) : head.readInt32LE(22)) };
    }
    if (startsWith(head, [0x00, 0x00, 0x01, 0x00])) return { kind: 'image', format: 'ICO' };
    if (/^ftyp(?:avif|avis|heic|heix|mif1)/u.test(ascii.slice(4, 12))) return { kind: 'image', format: ascii.slice(8, 12).startsWith('avi') ? 'AVIF' : 'HEIF' };
    if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return { kind: 'image', format: 'TIFF' };
    if (ascii.startsWith('%PDF-')) return { kind: 'binary', what: 'a PDF document' };
    if (startsWith(head, [0xff, 0xfe])) return { kind: 'text', encoding: 'UTF-16 LE', skip: 2 };
    if (startsWith(head, [0xfe, 0xff])) return { kind: 'text', encoding: 'UTF-16 BE', skip: 2 };
    if (startsWith(head, [0xef, 0xbb, 0xbf])) return { kind: 'text', encoding: 'UTF-8 with BOM', skip: 3 };
    if (head.subarray(0, 8000).includes(0)) return { kind: 'binary', what: 'a binary file' };
    return { kind: 'text', encoding: 'UTF-8', skip: 0 };
}

function decodeText(bytes: Buffer, encoding: Encoding, skip: number): string {
    const body = bytes.subarray(skip);
    if (encoding === 'UTF-16 LE') return body.toString('utf16le');
    if (encoding === 'UTF-16 BE') {
        const swapped = Buffer.from(body.subarray(0, body.length - (body.length % 2)));
        swapped.swap16();
        return swapped.toString('utf16le');
    }
    return body.toString('utf8');
}

async function readHead(abs: string): Promise<{ head: Buffer; size: number }> {
    const handle = await fsp.open(abs, 'r');
    try {
        const size = (await handle.stat()).size;
        const head = Buffer.alloc(Math.min(HEAD_BYTES, size));
        const { bytesRead } = await handle.read(head, 0, head.length, 0);
        return { head: head.subarray(0, bytesRead), size };
    } finally { await handle.close(); }
}

function describeNonText(rel: string, size: number, sniffed: Sniffed, only: string): string {
    if (sniffed.kind === 'image') {
        const pixels = sniffed.width && sniffed.height ? `${sniffed.width}x${sniffed.height} pixels, ` : '';
        return `${rel} is an image (${sniffed.format}, ${pixels}${humanBytes(size)}). ${only}`;
    }
    if (sniffed.kind === 'binary') return `${rel} is ${sniffed.what} (${humanBytes(size)}), not text. ${only}`;
    return '';
}

/* ───────────────────────── lines, endings, syntax ───────────────────────── */

/** Lines of a text; a final line break ends the last line, it does not start an empty one. */
export function splitLines(text: string): string[] {
    if (!text) return [];
    const lines = text.split(/\r?\n/u);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}

/** The ending most of a text's lines use (a tie goes to CRLF, as file_edit decides it); LF when it has none. */
export function dominantEnding(text: string): '\r\n' | '\n' {
    const crlf = (text.match(/\r\n/gu) || []).length;
    const lf = (text.match(/(?<!\r)\n/gu) || []).length;
    return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

function withEnding(text: string, eol: string): string {
    return text.replace(/\r\n|\r|\n/gu, eol);
}

const JS_LOADERS: Record<string, string> = {
    '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx', '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx',
};

/** JSON files their own tools read with comments and trailing commas: TypeScript's configs, and .jsonc. */
function isJsonc(rel: string): boolean {
    return /\.jsonc$/iu.test(rel) || /^(?:tsconfig|jsconfig)(?:\.[^/\\]+)?\.json$/iu.test(path.posix.basename(rel));
}

function isJsonFamily(rel: string): boolean {
    return /\.jsonc?$/iu.test(rel);
}

export type Syntax =
    | { kind: 'ok'; language: string }
    | { kind: 'error'; line: number; column: number; message: string }
    | { kind: 'unchecked'; reason: string };

function lineColumnAt(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lineStart = 0;
    const end = Math.max(0, Math.min(offset, text.length));
    for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
    return { line, column: end - lineStart + 1 };
}

/* ───────────────────────── the parser, off the request thread ───────────────────────── */

/**
 * One worker thread parses for every run of the process: esbuild's
 * asynchronous transform for JavaScript and TypeScript (its service answers
 * several requests at once) and JSON.parse for JSON. It is started on first
 * use, and it does not hold the process open while nothing waits on it.
 * Plain JavaScript and Node's own modules only, so it runs the same from the
 * TypeScript sources, from jest and from the bundle.
 */
const PARSER_WORKER = String.raw`
'use strict';
const { parentPort } = require('worker_threads');
const loaded = new Map();
parentPort.on('message', async (m) => {
  const answer = (value) => parentPort.postMessage(Object.assign({ id: m.id }, value));
  if (m.kind === 'json') {
    try { JSON.parse(m.text); answer({ ok: true }); }
    catch (error) { answer({ ok: false, message: String((error && error.message) || error) }); }
    return;
  }
  try {
    if (!loaded.has(m.esbuild)) loaded.set(m.esbuild, require(m.esbuild));
    await loaded.get(m.esbuild).transform(m.text, { loader: m.loader, logLevel: 'silent', sourcefile: m.sourcefile });
    answer({ ok: true });
  } catch (error) {
    const errors = Array.isArray(error && error.errors) ? error.errors : [];
    const at = errors.find((e) => e && e.text && e.location);
    answer({
      ok: false,
      message: String((error && error.message) || error),
      located: at ? { text: String(at.text), line: Number(at.location.line), column: Number(at.location.column), lineText: String(at.location.lineText || '') } : null,
    });
  }
});
`;

interface ParserAnswer {
    ok: boolean;
    message?: string;
    located?: { text: string; line: number; column: number; lineText: string } | null;
    /** Set when no parser answered: the reason, for "Not syntax-checked: …". */
    unchecked?: string;
}
type ParserRequest = { kind: 'json'; text: string } | { kind: 'js'; text: string; loader: string; sourcefile: string; esbuild: string };

let parser: { worker: Worker; pending: Map<number, (answer: ParserAnswer) => void> } | null = null;
let parserSeq = 0;

/** Every check still waiting gets the reason no answer will come, and the next check starts a fresh parser. */
function stopParser(reason: string): void {
    const current = parser;
    if (!current) return;
    parser = null;
    const waiting = [...current.pending.values()];
    current.pending.clear();
    for (const settle of waiting) settle({ ok: false, unchecked: reason });
    current.worker.terminate().catch(() => undefined);
}

function startParser(): NonNullable<typeof parser> | string {
    let worker: Worker;
    //  The heap bound is the search worker's: one huge JSON file ends that parse, never the machine's memory.
    try { worker = new Worker(PARSER_WORKER, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 512 } }); }
    catch (error: any) { return `the parser could not start (${firstLine(error?.message)})`; }
    const started = { worker, pending: new Map<number, (answer: ParserAnswer) => void>() };
    worker.unref();
    worker.on('message', (message: any) => {
        const settle = started.pending.get(message?.id);
        if (!settle) return;
        started.pending.delete(message.id);
        if (!started.pending.size) worker.unref();
        settle(message as ParserAnswer);
    });
    worker.on('error', error => { if (parser === started) stopParser(`the parser failed (${firstLine((error as any)?.message ?? error)})`); });
    worker.on('exit', code => { if (parser === started) stopParser(`the parser stopped (exit code ${code})`); });
    return started;
}

function parseOffThread(request: ParserRequest): Promise<ParserAnswer> {
    if (!parser) {
        const started = startParser();
        if (typeof started === 'string') return Promise.resolve({ ok: false, unchecked: started });
        parser = started;
    }
    const current = parser;
    const id = ++parserSeq;
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            if (current.pending.has(id) && parser === current) stopParser(`the parser did not answer within ${SYNTAX_TIMEOUT_MS / 1000} s and was restarted`);
        }, SYNTAX_TIMEOUT_MS);
        timer.unref?.();
        current.pending.set(id, answer => { clearTimeout(timer); resolve(answer); });
        if (current.pending.size === 1) current.worker.ref();
        try { current.worker.postMessage({ id, ...request }); }
        catch (error: any) {
            current.pending.delete(id);
            clearTimeout(timer);
            resolve({ ok: false, unchecked: `the parser could not be asked (${firstLine(error?.message)})` });
        }
    });
}

/**
 * Does it parse? null when the file is not a kind this checks. esbuild's
 * column counts UTF-8 bytes; the column reported here counts characters, so
 * a line of Arabic before the error does not move the caret.
 */
export async function syntaxOf(rel: string, text: string): Promise<Syntax | null> {
    const ext = path.posix.extname(rel).toLowerCase();
    const loader = JS_LOADERS[ext];
    if (loader) {
        const lib = esbuildPath();
        if (!lib.ok) return { kind: 'unchecked', reason: lib.reason };
        const answer = await parseOffThread({ kind: 'js', text, loader, sourcefile: rel, esbuild: lib.value });
        if (answer.unchecked) return { kind: 'unchecked', reason: answer.unchecked };
        if (answer.ok) return { kind: 'ok', language: loader === 'js' ? 'JavaScript' : loader.toUpperCase() };
        const located = answer.located;
        // Only the parser can say a file is broken: an answer without a place is the check failing.
        if (!located) return { kind: 'unchecked', reason: `the parser did not answer (${firstLine(answer.message)})` };
        const byteColumn = Math.max(0, Number(located.column) || 0);
        const column = Buffer.from(located.lineText, 'utf8').subarray(0, byteColumn).toString('utf8').length + 1;
        let message = located.text;
        if (loader === 'js' && /JSX syntax extension is not currently enabled/u.test(message)) message += ' (JSX needs a .jsx or .tsx file name)';
        return { kind: 'error', line: Math.max(1, Number(located.line) || 1), column, message };
    }
    if (isJsonFamily(rel)) {
        if (isJsonc(rel)) {
            //  TypeScript's own config reader, on this thread: these are the project's small config files.
            const ts = typescriptPackage();
            if (!ts.ok) return { kind: 'unchecked', reason: ts.reason };
            const parsed = ts.value.parseConfigFileTextToJson(rel, text);
            if (!parsed.error) return { kind: 'ok', language: 'JSON with comments' };
            const at = lineColumnAt(text, parsed.error.start ?? 0);
            return { kind: 'error', ...at, message: ts.value.flattenDiagnosticMessageText(parsed.error.messageText, ' ') };
        }
        const answer = await parseOffThread({ kind: 'json', text });
        if (answer.unchecked) return { kind: 'unchecked', reason: answer.unchecked };
        if (answer.ok) return { kind: 'ok', language: 'JSON' };
        const said = String(answer.message || 'invalid JSON');
        const position = /(?:in|after) JSON at position (\d+)/u.exec(said);
        const at = lineColumnAt(text, position ? Number(position[1]) : text.length);
        const message = said.replace(/\s*(?:in|after) JSON at position \d+[\s\S]*$/u, '').trim() || said;
        return { kind: 'error', ...at, message };
    }
    return null;
}

/** A few lines around a parse error with a caret under the column. Tabs stay tabs so the caret lines up. */
export function errorSnippet(text: string, line: number, column: number): string {
    const lines = text.split(/\r\n|\r|\n/u);
    const from = Math.max(1, line - 2);
    const to = Math.min(lines.length, line + 1);
    const width = String(to).length;
    const out: string[] = [];
    for (let n = from; n <= to; n++) {
        let shown = lines[n - 1] ?? '';
        let caretAt = column - 1;
        if (shown.length > 200) {
            const start = n === line ? Math.max(0, Math.min(caretAt - 80, shown.length - 200)) : 0;
            shown = `${start > 0 ? '…' : ''}${shown.slice(start, start + 200)}${start + 200 < shown.length ? '…' : ''}`;
            if (n === line) caretAt = caretAt - start + (start > 0 ? 1 : 0);
        }
        out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${shown}`);
        if (n === line) {
            const pad = shown.slice(0, Math.max(0, caretAt)).replace(/[^\t]/gu, ' ');
            out.push(`  ${' '.repeat(width)} | ${pad}^`);
        }
    }
    return out.join('\n');
}

function syntaxProblemText(prefix: string, text: string, syntax: Extract<Syntax, { kind: 'error' }>): string {
    return `${prefix}: line ${syntax.line} col ${syntax.column}: ${syntax.message}\n${errorSnippet(text, syntax.line, syntax.column)}`;
}

/**
 * prepareArtifactContent's destination contract, less the one problem the
 * syntax rule owns: a JSON file that does not parse is written (or its edit
 * gated) by the syntax rule, never refused here. Every other finding (a
 * leftover Markdown fence, Python in a .js file, a package.json npm cannot
 * install) stays a refusal.
 */
function contractProblem(rel: string, problem: string | null | undefined, text: string): string | null {
    if (!problem) return null;
    if (isJsonFamily(rel) && problem.startsWith('artifact_validation_failed:')) {
        try { JSON.parse(text); } catch { return null; }
    }
    return problem;
}

/* ───────────────────────── writing ───────────────────────── */

async function renameWithRetry(from: string, to: string): Promise<void> {
    let wait = 10;
    for (let attempt = 0; ; attempt++) {
        try { await fsp.rename(from, to); return; }
        catch (error: any) {
            // Windows refuses a rename while a scanner or an editor holds the target for a moment.
            if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt >= 8) throw error;
            await new Promise(resolve => setTimeout(resolve, wait));
            wait = Math.min(wait * 2, 500);
        }
    }
}

/**
 * A temporary file beside the target, renamed over it. The target keeps its permission bits.
 *
 * Measured on 2026-11-02 (a to-do page over an existing index.html): the
 * rename failed with EPERM through every retry, while writing into the same
 * file worked a moment later. On Windows a program that keeps a file open
 * for reading and writing but not for deleting (a preview server, a scanner)
 * blocks REPLACING it, never writing INTO it. So when the rename is still
 * refused after the retries and the target exists, the same bytes are
 * written in place. A program that refuses writes too still gets the error.
 */
export async function writeAtomic(abs: string, data: string, mode?: number): Promise<void> {
    const temp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}-${randomBytes(4).toString('hex')}.joe-tmp`);
    await fsp.writeFile(temp, data, { encoding: 'utf8', flag: 'wx' });
    try {
        if (mode !== undefined && process.platform !== 'win32') await fsp.chmod(temp, mode & 0o7777);
        await renameWithRetry(temp, abs);
    } catch (error: any) {
        await fsp.rm(temp, { force: true }).catch(() => undefined);
        const held = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
        if (held && await fsp.stat(abs).then(s => s.isFile(), () => false)) {
            await fsp.writeFile(abs, data, 'utf8');
            return;
        }
        throw error;
    }
}

/** The UI's file events, as write_file and file_edit send them (SystemTools.ts). The view never decides whether a write happened. */
function announce(context: any, type: 'diff' | 'file_stream', data: Record<string, unknown>): void {
    try {
        broadcast({
            type,
            sessionId: context?.sessionId,
            ...(typeof context?.runId === 'string' && context.runId ? { runId: context.runId } : {}),
            data,
        } as any);
    } catch { /* the live view is a window, never a dependency of the write */ }
}

function announceWrite(context: any, abs: string, content: string): void {
    const lines = content.split('\n');
    announce(context, 'diff', {
        path: abs,
        content,
        additions: lines.length,
        deletions: 0,
        lines: lines.map((line, i) => ({ type: 'add', content: line, lineNumber: i + 1 })),
    });
    announce(context, 'file_stream', {
        sessionId: context?.sessionId,
        file: abs,
        chunk: content.slice(0, 60_000),
        done: true,
        label: 'written to disk',
        bytes: Buffer.byteLength(content),
        at: Date.now(),
    });
}

/* ───────────────────────── engine_file_read ───────────────────────── */

function cutLine(line: string): string {
    return line.length > READ_LINE_CHARS ? `${line.slice(0, READ_LINE_CHARS)} … [+${line.length - READ_LINE_CHARS} characters on this line]` : line;
}

function numberedLine(n: number, line: string): string {
    return `${String(n).padStart(6)}\t${cutLine(line)}`;
}

interface Window { body: string[]; first: number; last: number; stoppedByChars: boolean }

function windowOf(lines: string[], offset: number, limit: number): Window {
    const body: string[] = [];
    let chars = 0;
    let last = offset - 1;
    let stoppedByChars = false;
    for (let n = offset; n <= lines.length && n < offset + limit; n++) {
        const row = numberedLine(n, lines[n - 1]);
        if (body.length && chars + row.length + 1 > READ_WINDOW_CHARS) { stoppedByChars = true; break; }
        body.push(row);
        chars += row.length + 1;
        last = n;
    }
    return { body, first: offset, last, stoppedByChars };
}

/**
 * A file too large to hold is read as a stream: the window's lines are kept,
 * every other byte is only counted past. Memory stays bounded whatever the
 * size, and the answer names how many bytes follow the window.
 */
async function streamedWindow(abs: string, size: number, skip: number, offset: number, limit: number):
    Promise<{ window: Window; bytesAfter: number }> {
    const handle = await fsp.open(abs, 'r');
    const body: string[] = [];
    let chars = 0;
    let lineNo = 1;
    let last = offset - 1;
    let stoppedByChars = false;
    let kept: Buffer[] = [];
    let keptBytes = 0;
    let overflow = 0;
    let lineStart = skip;
    let position = skip;
    const keepCap = READ_LINE_CHARS * 4 + 4;
    const chunk = Buffer.alloc(HEAD_BYTES);
    const result = (bytesAfter: number) => ({ window: { body, first: offset, last, stoppedByChars }, bytesAfter: Math.max(0, bytesAfter) });
    const keep = (piece: Buffer) => {
        if (lineNo < offset) return;
        const room = Math.max(0, keepCap - keptBytes);
        if (room) { kept.push(Buffer.from(piece.subarray(0, room))); keptBytes += Math.min(room, piece.length); }
        overflow += Math.max(0, piece.length - room);
    };
    /** Close the current line; true when the window is complete, or full. */
    const endLine = (): boolean => {
        if (lineNo >= offset) {
            let text = Buffer.concat(kept).toString('utf8');
            if (text.endsWith('\r')) text = text.slice(0, -1);
            const row = numberedLine(lineNo, text) + (overflow ? ` … [+${overflow} more bytes on this line]` : '');
            if (body.length && chars + row.length + 1 > READ_WINDOW_CHARS) { stoppedByChars = true; return true; }
            body.push(row);
            chars += row.length + 1;
            last = lineNo;
        }
        lineNo++;
        kept = [];
        keptBytes = 0;
        overflow = 0;
        return lineNo >= offset + limit;
    };
    try {
        for (;;) {
            const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
            if (!bytesRead) break;
            let start = 0;
            for (let i = 0; i < bytesRead; i++) {
                if (chunk[i] !== 0x0a) continue;
                keep(chunk.subarray(start, i));
                //  Full: the refused line starts at lineStart. Complete: what follows starts after this line break.
                if (endLine()) return result(stoppedByChars ? size - lineStart : size - (position + i + 1));
                lineStart = position + i + 1;
                start = i + 1;
            }
            if (start < bytesRead) keep(chunk.subarray(start, bytesRead));
            position += bytesRead;
        }
        if (position > lineStart && endLine() && stoppedByChars) return result(size - lineStart);
        return result(0);
    } finally { await handle.close(); }
}

export class EngineFileReadTool extends BaseTool {
    name = 'engine_file_read';
    description = 'Engine-internal: read a text file of the run\'s project folder as numbered lines, in a window set by offset and limit. Needs projectRoot in the tool context.';
    version = '1.0.0';
    tags = ['engine', 'fs', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder.' },
            offset: { type: 'integer', minimum: 1, description: 'First line to show (1 = the first line).' },
            limit: { type: 'integer', minimum: 1, description: `How many lines to show (default ${READ_DEFAULT_LIMIT}).` },
        },
        required: ['path'],
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = ENGINE_FILE_CALLS_PER_MINUTE;
    auditFields = ['path'];

    async execute(input: any, context?: any): Promise<Result> {
        const bound = await bindProject(context);
        if (!bound.ok) return refuse(bound.error);
        const raw = stringArg(input, 'path');
        if (!raw || !raw.trim()) return refuse('file_read needs "path": the file to read, relative to the project folder.');
        const offset = countArg(input, 'offset', 'file_read');
        if (typeof offset === 'object') return refuse(offset.error);
        const limit = countArg(input, 'limit', 'file_read');
        if (typeof limit === 'object') return refuse(limit.error);
        const from = offset ?? 1;
        const count = limit ?? READ_DEFAULT_LIMIT;

        const check = await resolveInProject(bound.root, raw, 'read');
        if (!check.ok) return refuse(check.error);
        const rel = check.rel;
        if (!check.exists) return refuse(`${rel} does not exist.${await nearestFolderHint(bound.root, rel)}`);
        if (check.isDir) return refuse(`${shownPath(rel)} is a folder, not a file. Use file_list to see what is in it.`);

        let head: Buffer;
        let size: number;
        try { ({ head, size } = await readHead(check.abs)); }
        catch (error: any) { return refuse(`${rel} could not be read: ${error?.code || firstLine(error?.message)}.`); }
        const sniffed = sniff(head);
        if (sniffed.kind !== 'text') return refuse(describeNonText(rel, size, sniffed, 'file_read shows text files only.'));
        const note = sniffed.encoding === 'UTF-8' ? '' : ` (${sniffed.encoding})`;

        if (size <= WHOLE_FILE_BYTES) {
            let text: string;
            try { text = decodeText(await fsp.readFile(check.abs), sniffed.encoding, sniffed.skip); }
            catch (error: any) { return refuse(`${rel} could not be read: ${error?.code || firstLine(error?.message)}.`); }
            const lines = splitLines(text);
            if (!lines.length) {
                return { ok: true, output: { path: rel, text: `[${rel}: the file is empty (0 lines)${note}.]`, totalLines: 0, startLine: 0, endLine: 0, bytes: size }, logs: [`engine_file_read ${rel} empty`] };
            }
            if (from > lines.length) return refuse(`offset ${from} is past the end: ${rel} has ${plural(lines.length, 'line')}.`);
            const window = windowOf(lines, from, count);
            const whole = window.first === 1 && window.last === lines.length;
            const footer = window.last >= lines.length
                ? `[${rel}${note}: lines ${window.first}-${window.last} of ${lines.length}${whole ? ', the whole file' : ', the end of the file'}.]`
                : `[${rel}${note}: lines ${window.first}-${window.last} of ${lines.length}${window.stoppedByChars ? ` (the window stops at ${READ_WINDOW_CHARS} characters)` : ''}. Continue with offset=${window.last + 1}.]`;
            return {
                ok: true,
                output: { path: rel, text: `${window.body.join('\n')}\n${footer}`, totalLines: lines.length, startLine: window.first, endLine: window.last, bytes: size },
                logs: [`engine_file_read ${rel} lines ${window.first}-${window.last}/${lines.length}`],
            };
        }

        if (sniffed.encoding === 'UTF-16 LE' || sniffed.encoding === 'UTF-16 BE') {
            return refuse(`${rel} is a ${sniffed.encoding} text file of ${humanBytes(size)}; file_read streams files above ${humanBytes(WHOLE_FILE_BYTES)} only as UTF-8. Convert it to UTF-8 with shell_run first.`);
        }
        let streamed: Awaited<ReturnType<typeof streamedWindow>>;
        try { streamed = await streamedWindow(check.abs, size, sniffed.skip, from, count); }
        catch (error: any) { return refuse(`${rel} could not be read: ${error?.code || firstLine(error?.message)}.`); }
        const { window, bytesAfter } = streamed;
        if (!window.body.length) return refuse(`offset ${from} is past the end of ${rel} (${humanBytes(size)}).`);
        const footer = bytesAfter > 0
            ? `[${rel}${note}: lines ${window.first}-${window.last} of a ${humanBytes(size)} file; ${humanBytes(bytesAfter)} follow these lines${window.stoppedByChars ? ` (the window stops at ${READ_WINDOW_CHARS} characters)` : ''}. The file is larger than ${humanBytes(WHOLE_FILE_BYTES)}, so its lines are not counted. Continue with offset=${window.last + 1}.]`
            : `[${rel}${note}: lines ${window.first}-${window.last}, the end of a ${humanBytes(size)} file.]`;
        return {
            ok: true,
            output: { path: rel, text: `${window.body.join('\n')}\n${footer}`, totalLines: null, startLine: window.first, endLine: window.last, bytes: size, bytesAfter },
            logs: [`engine_file_read ${rel} lines ${window.first}-${window.last} (streamed)`],
        };
    }
}

/* ───────────────────────── engine_file_write ───────────────────────── */

function syntaxReport(text: string, syntax: Syntax | null, rel: string): { line: string; parses: boolean | null } {
    if (!syntax) return { line: '', parses: null };
    if (syntax.kind === 'ok') return { line: `${syntax.language} syntax OK.`, parses: true };
    if (syntax.kind === 'unchecked') return { line: `Not syntax-checked: ${syntax.reason}.`, parses: null };
    return {
        line: `${syntaxProblemText('Written, but it does not parse', text, syntax)}\nFix it with a small file_edit of ${rel}; do not resend the whole file.`,
        parses: false,
    };
}

export class EngineFileWriteTool extends BaseTool {
    name = 'engine_file_write';
    description = 'Engine-internal: create or replace a whole file of the run\'s project folder, atomically, and report whether JavaScript, TypeScript or JSON parses. Needs projectRoot in the tool context.';
    version = '1.0.0';
    tags = ['engine', 'fs', 'write', 'create'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder.' },
            content: { type: 'string', description: 'The complete file content.' },
        },
        required: ['path', 'content'],
    };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = ENGINE_FILE_CALLS_PER_MINUTE;
    auditFields = ['path'];

    async execute(input: any, context?: any): Promise<Result> {
        const bound = await bindProject(context);
        if (!bound.ok) return refuse(bound.error);
        const raw = stringArg(input, 'path');
        if (!raw || !raw.trim()) return refuse('file_write needs "path": the file to write, relative to the project folder.');
        if (/[\\/]$/u.test(raw.trim())) return refuse(`file_write needs a file path; "${raw.trim()}" names a folder. Add the file name, for example ${raw.trim()}index.html.`);
        const content = stringArg(input, 'content');
        if (content === undefined) return refuse('file_write needs "content": the complete text of the file.');

        const check = await resolveInProject(bound.root, raw, 'write');
        if (!check.ok) return refuse(check.error);
        const rel = check.rel;
        if (rel === '.' || (check.exists && check.isDir)) return refuse(`${shownPath(rel)} is a folder. Give a file path, for example ${rel === '.' ? '' : `${rel}/`}index.html.`);

        let data: string;
        let fenceRemoved = false;
        if (!content.trim()) {
            // An empty __init__.py or .gitkeep is a real file; emptying a file that has content is almost always a slip.
            if (check.exists && check.size > 0) return refuse(`"content" is empty: writing it would erase ${rel} (${humanBytes(check.size)}). Nothing was written.`);
            data = content;
        } else {
            const prepared = prepareArtifactContent(rel, content);
            const problem = contractProblem(rel, prepared.error, prepared.content);
            if (problem) return refuse(`${problem}. Nothing was written.`);
            fenceRemoved = prepared.content !== content.trim();
            // Without a wrapper the model's bytes are written as they are, trailing line break included.
            data = fenceRemoved ? `${prepared.content}${dominantEnding(prepared.content)}` : content;
        }

        let mode: number | undefined;
        if (check.exists) {
            try { mode = (await fsp.stat(check.abs)).mode; } catch { mode = undefined; }
        }
        try {
            await fsp.mkdir(path.dirname(check.abs), { recursive: true });
            await writeAtomic(check.abs, data, mode);
        } catch (error: any) {
            return refuse(`${rel} could not be written: ${error?.code || firstLine(error?.message)}.`);
        }
        const change = check.exists ? 'modified' : 'created';
        const bytes = Buffer.byteLength(data);
        const onDisk = await diskRelative(bound.root, check.abs, rel);
        announceWrite(context, check.abs, data);

        const report = syntaxReport(data, await syntaxOf(onDisk, data), onDisk);
        const lines = [`Wrote ${onDisk} (${change}, ${plural(bytes, 'byte')}${fenceRemoved ? '; the Markdown fence around the content was removed' : ''}).`];
        if (report.line) lines.push(report.line);
        return {
            ok: true,
            output: { path: onDisk, change, bytes, parses: report.parses, fenceRemoved, text: lines.join('\n') },
            logs: [`engine_file_write ${onDisk} ${change} ${bytes} bytes${report.parses === false ? ' (does not parse)' : ''}`],
        };
    }
}

/* ───────────────────────── engine_file_edit ───────────────────────── */

type Stage = 'exact' | 'line endings' | 'trailing whitespace ignored' | 'indentation ignored';

interface Span { start: number; end: number; next: number }
interface Found { start: number; end: number; line: number; firstLine?: number; lineCount?: number }

function lineSpans(body: string): Span[] {
    const spans: Span[] = [];
    let start = 0;
    while (start < body.length) {
        const nl = body.indexOf('\n', start);
        if (nl < 0) { spans.push({ start, end: body.length, next: body.length }); break; }
        spans.push({ start, end: nl > start && body.charCodeAt(nl - 1) === 13 ? nl - 1 : nl, next: nl + 1 });
        start = nl + 1;
    }
    return spans;
}

function lineAt(spans: Span[], offset: number): number {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (spans[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
}

function findText(body: string, needle: string, spans: Span[]): Found[] {
    const found: Found[] = [];
    let at = body.indexOf(needle);
    while (at >= 0) {
        found.push({ start: at, end: at + needle.length, line: lineAt(spans, at) });
        at = body.indexOf(needle, at + needle.length);
    }
    return found;
}

function patternLines(oldText: string): { lines: string[]; throughBreak: boolean } {
    const lines = oldText.split(/\r\n|\r|\n/u);
    if (lines.length > 1 && lines[lines.length - 1] === '') return { lines: lines.slice(0, -1), throughBreak: true };
    return { lines, throughBreak: false };
}

/** Whole lines that equal old_text's lines once `same` forgives what it forgives (Codex's seek_sequence passes). */
function findLines(spans: Span[], fileLines: string[], oldText: string, same: (a: string, b: string) => boolean): Found[] {
    const { lines: pattern, throughBreak } = patternLines(oldText);
    const found: Found[] = [];
    const m = pattern.length;
    for (let i = 0; i + m <= spans.length;) {
        let all = true;
        for (let j = 0; j < m; j++) if (!same(fileLines[i + j], pattern[j])) { all = false; break; }
        if (!all) { i++; continue; }
        const lastSpan = spans[i + m - 1];
        found.push({ start: spans[i].start, end: throughBreak ? lastSpan.next : lastSpan.end, line: i + 1, firstLine: i, lineCount: m });
        i += m;
    }
    return found;
}

function leadingSpace(line: string): string {
    return /^[ \t]*/u.exec(line)?.[0] ?? '';
}

/**
 * old_text matched only with indentation ignored: the model's copy of the
 * block sits at another indentation than the file's. When the difference is
 * the same on every line, new_text gets the same shift, so a Python or YAML
 * block keeps the depth it had. When it is not uniform, nothing is guessed.
 */
function reindent(newText: string, fileLines: string[], oldLines: string[], eol: string): string | null {
    const k = oldLines.findIndex(line => line.trim() !== '');
    if (k < 0) return null;
    const fileIndent = leadingSpace(fileLines[k]);
    const oldIndent = leadingSpace(oldLines[k]);
    if (fileIndent === oldIndent) return null;
    for (let j = 0; j < oldLines.length; j++) {
        if (!oldLines[j].trim()) continue;
        if (!oldLines[j].startsWith(oldIndent)) return null;
        if (fileLines[j].trimEnd() !== fileIndent + oldLines[j].slice(oldIndent.length).trimEnd()) return null;
    }
    return newText.split(eol).map(line => (line.trim() && line.startsWith(oldIndent) ? fileIndent + line.slice(oldIndent.length) : line)).join(eol);
}

interface DiffResult { text: string; added: number; removed: number; uiLines: Array<{ type: 'add' | 'remove'; content: string; lineNumber: number }> }

/** A unified diff of the change from the diff package, bounded, with the lines it leaves out counted. */
function changeDiff(rel: string, before: string, after: string): DiffResult | { note: string } {
    const a = splitLines(before.replace(/\r\n/gu, '\n'));
    const b = splitLines(after.replace(/\r\n/gu, '\n'));
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    const changed = (a.length - prefix - suffix) + (b.length - prefix - suffix);
    if (changed > DIFF_MAX_CHANGED_LINES) return { note: `The diff is not shown: the change spans ${changed} lines. Use file_read to see the result.` };
    const lib = diffPackage();
    if (!lib.ok) return { note: `The diff is not shown: ${lib.reason}.` };
    const from = Math.max(0, prefix - 3);
    const oldPart = a.slice(from, Math.min(a.length, a.length - suffix + 3));
    const newPart = b.slice(from, Math.min(b.length, b.length - suffix + 3));
    const patch = lib.value.structuredPatch(`a/${rel}`, `b/${rel}`, oldPart.length ? `${oldPart.join('\n')}\n` : '', newPart.length ? `${newPart.join('\n')}\n` : '', '', '', { context: 3 });
    if (!patch.hunks.length) return { note: 'No line\'s text changed: the edit changed only the line break at the end of the file.' };
    const rows: string[] = [`--- a/${rel}`, `+++ b/${rel}`];
    const uiLines: DiffResult['uiLines'] = [];
    let added = 0;
    let removed = 0;
    for (const hunk of patch.hunks) {
        const oldStart = hunk.oldStart + from;
        const newStart = hunk.newStart + from;
        rows.push(`@@ -${oldStart},${hunk.oldLines} +${newStart},${hunk.newLines} @@`);
        let oldNo = oldStart;
        let newNo = newStart;
        for (const line of hunk.lines) {
            rows.push(line);
            if (line.startsWith('-')) { removed++; uiLines.push({ type: 'remove', content: line.slice(1), lineNumber: oldNo++ }); }
            else if (line.startsWith('+')) { added++; uiLines.push({ type: 'add', content: line.slice(1), lineNumber: newNo++ }); }
            else if (line.startsWith(' ')) { oldNo++; newNo++; }
        }
    }
    const shown: string[] = [];
    let chars = 0;
    for (const row of rows) {
        if (shown.length >= DIFF_MAX_LINES || chars + row.length + 1 > DIFF_MAX_CHARS) break;
        shown.push(row);
        chars += row.length + 1;
    }
    const left = rows.length - shown.length;
    if (left > 0) shown.push(`… ${plural(left, 'more line')} of the diff not shown. Use file_read to see the result.`);
    return { text: shown.join('\n'), added, removed, uiLines };
}

function lineList(found: Found[]): string {
    const lines = found.slice(0, MATCH_LINES_SHOWN).map(f => f.line).join(', ');
    return found.length > MATCH_LINES_SHOWN ? `${lines}, and ${found.length - MATCH_LINES_SHOWN} more` : lines;
}

/** What to tell a model whose old_text is not in the file: the likeliest slips, from what the file and old_text hold. */
function notFoundHint(fileLines: string[], oldText: string): string {
    const hints: string[] = [];
    const oldLines = oldText.split(/\r\n|\r|\n/u).filter(line => line.trim());
    if (oldLines.length && oldLines.every(line => /^\s*\d+\t/u.test(line))) {
        hints.push('old_text starts its lines with file_read\'s line numbers; leave the numbers and the tab after them out.');
    }
    const first = oldLines.length ? oldLines[0].replace(/\s+/gu, ' ').trim().toLowerCase() : '';
    if (first.length >= 4) {
        const key = first.slice(0, 24);
        const near = fileLines
            .map((line, i) => ({ line, at: i + 1 }))
            .filter(c => c.line.replace(/\s+/gu, ' ').toLowerCase().includes(key))
            .slice(0, 3);
        if (near.length) hints.push(`Lines that start like old_text: ${near.map(c => `${c.at}: ${JSON.stringify(c.line.trim().slice(0, 120))}`).join('; ')}.`);
        else hints.push(`No line of the file contains ${JSON.stringify(first.slice(0, 60))}.`);
    }
    hints.push('Read the file again with file_read and copy old_text exactly as it is there.');
    return hints.join(' ');
}

export class EngineFileEditTool extends BaseTool {
    name = 'engine_file_edit';
    description = 'Engine-internal: replace old_text with new_text in an existing file of the run\'s project folder (exact, then line endings, then trailing whitespace, then indentation), refuse an edit that breaks a file that parsed, and return the diff. Needs projectRoot in the tool context.';
    version = '1.0.0';
    tags = ['engine', 'fs', 'edit', 'write'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder.' },
            old_text: { type: 'string', description: 'The exact text to replace.' },
            new_text: { type: 'string', description: 'The text to put in its place.' },
            replace_all: { type: 'boolean', description: 'Replace every match instead of exactly one.' },
        },
        required: ['path', 'old_text', 'new_text'],
    };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = ENGINE_FILE_CALLS_PER_MINUTE;
    auditFields = ['path'];

    async execute(input: any, context?: any): Promise<Result> {
        const bound = await bindProject(context);
        if (!bound.ok) return refuse(bound.error);
        const raw = stringArg(input, 'path');
        if (!raw || !raw.trim()) return refuse('file_edit needs "path": the file to change, relative to the project folder.');
        const oldText = stringArg(input, 'old_text');
        const newText = stringArg(input, 'new_text');
        if (!oldText) return refuse('file_edit needs "old_text": the exact text to replace, copied from file_read. To create a file, use file_write.');
        if (newText === undefined) return refuse('file_edit needs "new_text": the text to put in place of old_text (empty to delete it).');
        if (oldText === newText) return refuse('old_text and new_text are the same; the edit would change nothing.');
        const replaceAll = flagArg(input, 'replace_all', 'file_edit');
        if (typeof replaceAll === 'object') return refuse(replaceAll.error);

        const check = await resolveInProject(bound.root, raw, 'write');
        if (!check.ok) return refuse(check.error);
        const rel = check.rel;
        if (!check.exists) return refuse(`${rel} does not exist. To create it, use file_write.${await nearestFolderHint(bound.root, rel)}`);
        if (check.isDir) return refuse(`${shownPath(rel)} is a folder, not a file.`);
        if (check.size > WHOLE_FILE_BYTES) return refuse(`${rel} is ${humanBytes(check.size)}; file_edit changes files up to ${humanBytes(WHOLE_FILE_BYTES)}. Use shell_run for a file this large.`);

        let bytes: Buffer;
        let mode: number | undefined;
        try {
            bytes = await fsp.readFile(check.abs);
            mode = (await fsp.stat(check.abs)).mode;
        } catch (error: any) { return refuse(`${rel} could not be read: ${error?.code || firstLine(error?.message)}.`); }
        const sniffed = sniff(bytes.subarray(0, HEAD_BYTES));
        if (sniffed.kind !== 'text') return refuse(describeNonText(rel, bytes.length, sniffed, 'file_edit changes text files only.'));
        if (sniffed.encoding === 'UTF-16 LE' || sniffed.encoding === 'UTF-16 BE') {
            return refuse(`${rel} is ${sniffed.encoding} text; file_edit changes UTF-8 files. Rewrite it as UTF-8 with file_write.`);
        }
        const bom = sniffed.encoding === 'UTF-8 with BOM' ? '﻿' : '';
        const before = decodeText(bytes, sniffed.encoding, sniffed.skip);
        const eol = dominantEnding(before);
        //  An edit sent again after it landed is that edit, not missing text, and must not land twice
        //  (shared/utils/edit-in-place.ts; 'unique' because this editor refuses a text found twice).
        if (replaceAll !== true && editAlreadyApplied(before, withEnding(oldText, eol), withEnding(newText, eol), 'unique')) {
            return {
                ok: true,
                output: { path: rel, replacements: 0, alreadyApplied: true, text: `Already in place: ${rel} already has this edit (new_text stands where old_text was). Nothing was changed.` },
                logs: [`engine_file_edit ${rel} already in place`],
            };
        }
        const spans = lineSpans(before);
        const fileLines = spans.map(s => before.slice(s.start, s.end));

        //  The order Codex's seek_sequence uses: strictest first, and the first pass that finds anything decides.
        const passes: Array<[Stage, () => Found[]]> = [
            ['exact', () => findText(before, oldText, spans)],
            ['line endings', () => (withEnding(oldText, eol) === oldText ? [] : findText(before, withEnding(oldText, eol), spans))],
            ['trailing whitespace ignored', () => findLines(spans, fileLines, oldText, (a, b) => a.trimEnd() === b.trimEnd())],
            ['indentation ignored', () => findLines(spans, fileLines, oldText, (a, b) => a.trim() === b.trim())],
        ];
        let stage: Stage | null = null;
        let found: Found[] = [];
        for (const [name, pass] of passes) {
            found = pass();
            if (found.length) { stage = name; break; }
        }
        if (!stage) {
            return refuse(`old_text was not found in ${rel} (tried: exact; the file's line endings; trailing whitespace ignored; indentation ignored). ${notFoundHint(fileLines, oldText)}`);
        }
        if (found.length > 1 && replaceAll !== true) {
            return refuse(`old_text matches ${found.length} places in ${rel} (lines ${lineList(found)}). Include more of the surrounding lines so it matches exactly one place, or set replace_all to true to change all ${found.length}.`);
        }

        const replacement = withEnding(newText, eol);
        let reindented = 0;
        let asGiven = 0;
        let after = '';
        let cursor = 0;
        for (const f of found) {
            let text = replacement;
            if (stage === 'indentation ignored' && f.firstLine !== undefined && f.lineCount !== undefined) {
                const shifted = reindent(replacement, fileLines.slice(f.firstLine, f.firstLine + f.lineCount), patternLines(oldText).lines, eol);
                if (shifted !== null) { text = shifted; reindented++; } else asGiven++;
            }
            after += before.slice(cursor, f.start) + text;
            cursor = f.end;
        }
        after += before.slice(cursor);

        const problem = contractProblem(rel, validateArtifactContent(rel, after), after);
        if (problem && !contractProblem(rel, validateArtifactContent(rel, before), before)) {
            return refuse(`${problem}. The edit was not applied; ${rel} is unchanged.`);
        }
        const afterSyntax = await syntaxOf(rel, after);
        let syntaxLine = '';
        let parses: boolean | null = null;
        if (afterSyntax?.kind === 'error') {
            const beforeSyntax = await syntaxOf(rel, before);
            if (beforeSyntax?.kind === 'ok') {
                return refuse(`${syntaxProblemText(`Not applied: after this edit ${rel} would not parse`, after, afterSyntax)}\n${rel} is unchanged. Fix new_text (or old_text) and try again.`);
            }
            //  Not known to be broken already: the edit could be what breaks it, so it is not made.
            if (beforeSyntax?.kind !== 'error') {
                return refuse(`${syntaxProblemText(`Not applied: after this edit ${rel} would not parse`, after, afterSyntax)}\nWhether ${rel} parses now could not be checked (${beforeSyntax?.kind === 'unchecked' ? beforeSyntax.reason : 'no answer'}), so the edit was not made; ${rel} is unchanged. Fix new_text (or old_text) and try again.`);
            }
            syntaxLine = syntaxProblemText('It did not parse before this edit and still does not', after, afterSyntax);
            parses = false;
        } else if (afterSyntax?.kind === 'ok') {
            syntaxLine = `${afterSyntax.language} syntax OK.`;
            parses = true;
        } else if (afterSyntax?.kind === 'unchecked') {
            syntaxLine = `Not syntax-checked: ${afterSyntax.reason}.`;
        }

        const data = bom + after;
        try { await writeAtomic(check.abs, data, mode); }
        catch (error: any) { return refuse(`${rel} could not be written: ${error?.code || firstLine(error?.message)}. It is unchanged.`); }
        const onDisk = await diskRelative(bound.root, check.abs, rel);
        const byteCount = Buffer.byteLength(data);
        const diff = changeDiff(onDisk, before, after);
        announce(context, 'diff', {
            path: check.abs,
            content: data,
            additions: 'note' in diff ? 0 : diff.added,
            deletions: 'note' in diff ? 0 : diff.removed,
            lines: 'note' in diff ? [] : diff.uiLines,
        });

        const how = stage === 'exact' ? 'exact match'
            : stage === 'line endings' ? 'matched after giving old_text the file\'s line endings'
                : stage === 'trailing whitespace ignored' ? 'matched with trailing whitespace ignored'
                    : `matched with indentation ignored; ${reindented && !asGiven ? 'new_text was re-indented to the file\'s indentation' : reindented ? `new_text was re-indented in ${reindented} of ${found.length} places and inserted as given in the rest` : 'new_text was inserted as given'}`;
        const where = found.length === 1 ? `line ${found[0].line}` : `lines ${lineList(found)}`;
        const lines = [`Edited ${onDisk}: replaced ${plural(found.length, 'occurrence')} at ${where} (${how}).`];
        lines.push('note' in diff ? diff.note : diff.text);
        if (syntaxLine) lines.push(syntaxLine);
        return {
            ok: true,
            output: {
                path: onDisk, change: 'modified', bytes: byteCount, replacements: found.length, matchedBy: stage, parses,
                diff: 'note' in diff ? null : diff.text, text: lines.join('\n'),
            },
            logs: [`engine_file_edit ${onDisk} ${found.length} replacement(s) (${stage})`],
        };
    }
}

/* ───────────────────────── walking the project ───────────────────────── */

interface IgnoreRules { base: string; matcher: IgnoreMatcher }

interface Entry { rel: string; abs: string; kind: 'dir' | 'file' | 'link' | 'other'; size?: number; below?: number | null }
interface Skipped { rel: string; entries: number | null; why?: string }
interface Walked {
    entries: Entry[];
    skipped: Skipped[];
    ignored: number;
    unreadable: string[];
    stopped: boolean;
    cancelled: boolean;
    /** The entry bound this walk ran under. */
    limit: number;
}

function ignoredBy(rules: IgnoreRules[], rel: string, isDir: boolean): boolean {
    let ignored = false;
    for (const rule of rules) {
        const sub = rule.base === '' ? rel : rel.startsWith(`${rule.base}/`) ? rel.slice(rule.base.length + 1) : '';
        if (!sub) continue;
        try {
            const verdict = rule.matcher.test(isDir ? `${sub}/` : sub);
            if (verdict.ignored) ignored = true;
            else if (verdict.unignored) ignored = false;
        } catch { /* a name the ignore package cannot read is not ignored */ }
    }
    return ignored;
}

async function gitignoreAt(dirAbs: string, base: string, factory: IgnoreFactory): Promise<IgnoreRules | null> {
    try { return { base, matcher: factory().add(await fsp.readFile(path.join(dirAbs, '.gitignore'), 'utf8')) }; }
    catch { return null; }
}

/** The .gitignore files from the project folder down to (and including) the folder a walk starts in. */
async function ancestorRules(root: string, startRel: string, factory: IgnoreFactory): Promise<IgnoreRules[]> {
    const rules: IgnoreRules[] = [];
    const parts = startRel ? startRel.split('/') : [];
    for (let i = 0; i <= parts.length; i++) {
        const base = parts.slice(0, i).join('/');
        const found = await gitignoreAt(path.join(root, ...parts.slice(0, i)), base, factory);
        if (found) rules.push(found);
    }
    return rules;
}

async function namesIn(abs: string): Promise<string[] | null> {
    try { return await fsp.readdir(abs); } catch { return null; }
}

async function countEntries(abs: string): Promise<number | null> {
    return (await namesIn(abs))?.length ?? null;
}

/** WALK_MAX_ENTRIES, unless the operator set JOE_ENGINE_WALK_MAX_ENTRIES (a server with large monorepos may raise it). */
function walkLimit(): number {
    const set = Number(process.env.JOE_ENGINE_WALK_MAX_ENTRIES);
    return Number.isInteger(set) && set > 0 ? set : WALK_MAX_ENTRIES;
}

/**
 * One walk for file_list and file_search: asynchronous, depth-first in name
 * order, links shown but never followed, the skipped folders counted rather
 * than entered, the .gitignore files of every folder on the way honoured,
 * and a stop after walkLimit() entries that the answer reports.
 */
async function walkProject(root: string, startRel: string, options: {
    maxDepth: number; countBelow: boolean; rules: IgnoreRules[]; factory: IgnoreFactory | null; context: any;
}): Promise<Walked> {
    const walked: Walked = { entries: [], skipped: [], ignored: 0, unreadable: [], stopped: false, cancelled: false, limit: walkLimit() };
    let visited = 0;
    const visit = async (abs: string, rel: string, depth: number, rules: IgnoreRules[], parentNames: string[], entry: Entry | null): Promise<void> => {
        if (walked.stopped) return;
        if (options.context?.isCancelled?.()) { walked.stopped = true; walked.cancelled = true; return; }
        let dirents: import('fs').Dirent[];
        try { dirents = await fsp.readdir(abs, { withFileTypes: true }); }
        catch (error: any) { walked.unreadable.push(`${shownPath(rel)} (${error?.code || 'unreadable'})`); return; }
        const names = dirents.map(d => d.name);
        if (entry && !names.length) entry.below = 0;
        if (entry) {
            const environment = await installedEnvironmentKind(abs, names, parentNames);
            if (environment) {
                walked.entries.splice(walked.entries.indexOf(entry), 1);
                walked.skipped.push({ rel, entries: names.length, why: environment });
                return;
            }
        }
        let local = rules;
        if (options.factory && dirents.some(d => d.name === '.gitignore' && d.isFile()) && (entry || !rules.some(r => r.base === rel))) {
            const found = await gitignoreAt(abs, rel, options.factory);
            if (found) local = rules.concat(found);
        }
        dirents.sort((x, y) => byName(x.name, y.name));
        const files = dirents.filter(d => d.isFile());
        const sizes = new Map<string, number>();
        await mapBounded(files, PROJECT_FS_CONCURRENCY, async d => {
            try { sizes.set(d.name, (await fsp.stat(path.join(abs, d.name))).size); } catch { /* a file that vanished keeps no size */ }
        });
        for (const d of dirents) {
            if (++visited > walked.limit) { walked.stopped = true; return; }
            const childRel = rel ? `${rel}/${d.name}` : d.name;
            const childAbs = path.join(abs, d.name);
            if (d.isSymbolicLink()) {
                if (!ignoredBy(local, childRel, false)) walked.entries.push({ rel: childRel, abs: childAbs, kind: 'link' });
                else walked.ignored++;
                continue;
            }
            if (d.isDirectory()) {
                const lower = d.name.toLowerCase();
                if (ALWAYS_SKIPPED.has(lower) || isMachineStateDirectory(d.name, { atRoot: !rel })) {
                    walked.skipped.push({ rel: childRel, entries: await countEntries(childAbs), ...(ALWAYS_SKIPPED.has(lower) ? {} : { why: 'tool or cache state' }) });
                    continue;
                }
                if (ignoredBy(local, childRel, true)) { walked.ignored++; continue; }
                const child: Entry = { rel: childRel, abs: childAbs, kind: 'dir' };
                walked.entries.push(child);
                if (depth + 1 < options.maxDepth) await visit(childAbs, childRel, depth + 1, local, names, child);
                else if (options.countBelow) {
                    //  Not entered, but looked into once: what it holds is counted, and a virtualenv is still known for one.
                    const inside = await namesIn(childAbs);
                    const environment = inside ? await installedEnvironmentKind(childAbs, inside, names) : null;
                    if (environment) {
                        walked.entries.pop();
                        walked.skipped.push({ rel: childRel, entries: inside!.length, why: environment });
                    } else child.below = inside ? inside.length : null;
                }
                if (walked.stopped) return;
                continue;
            }
            if (ignoredBy(local, childRel, false)) { walked.ignored++; continue; }
            walked.entries.push({ rel: childRel, abs: childAbs, kind: d.isFile() ? 'file' : 'other', size: sizes.get(d.name) });
        }
    };
    await visit(path.join(root, ...(startRel ? startRel.split('/') : [])), startRel, 0, options.rules, [], null);
    return walked;
}

function walkNotes(walked: Walked, gitignore: string | null): string[] {
    const notes: string[] = [];
    if (walked.skipped.length) {
        const shown = walked.skipped.slice(0, SKIPPED_SHOWN)
            .map(s => `${s.rel}/ (${s.entries === null ? 'unreadable' : plural(s.entries, 'entry', 'entries')}${s.why ? `, ${s.why}` : ''})`).join(', ');
        notes.push(`Skipped, not entered: ${shown}${walked.skipped.length > SKIPPED_SHOWN ? `, and ${walked.skipped.length - SKIPPED_SHOWN} more folders` : ''}.`);
    }
    if (walked.ignored) notes.push(`Hidden by .gitignore: ${plural(walked.ignored, 'entry', 'entries')}.`);
    if (gitignore) notes.push(`.gitignore was not applied: ${gitignore}.`);
    if (walked.unreadable.length) notes.push(`Could not be read: ${walked.unreadable.slice(0, SKIPPED_SHOWN).join(', ')}.`);
    if (walked.cancelled) notes.push('The run was cancelled, so the walk stopped early.');
    else if (walked.stopped) notes.push(`The walk stopped after ${walked.limit} entries, so what is above is not all there is; give a narrower path.`);
    return notes;
}

async function prepareWalk(root: string, startRel: string): Promise<{ rules: IgnoreRules[]; factory: IgnoreFactory | null; gitignore: string | null }> {
    const lib = ignorePackage();
    if (!lib.ok) return { rules: [], factory: null, gitignore: lib.reason };
    return { rules: await ancestorRules(root, startRel, lib.value), factory: lib.value, gitignore: null };
}

function globMatcher(pattern: string, tool: string): { ok: true; match: GlobMatcher } | { ok: false; error: string } {
    const lib = picomatchPackage();
    if (!lib.ok) return { ok: false, error: `${tool} cannot apply the glob "${pattern}": ${lib.reason}.` };
    try {
        // A pattern without a slash matches the name at any depth ("*.css"), as in .gitignore and ripgrep's --glob.
        return { ok: true, match: lib.value(pattern, { dot: true, basename: !pattern.includes('/') }) };
    } catch (error: any) {
        return { ok: false, error: `${tool}: the glob "${pattern}" is not valid (${firstLine(error?.message)}).` };
    }
}

function relativeTo(startRel: string, rel: string): string {
    return startRel ? rel.slice(startRel.length + 1) : rel;
}

/* ───────────────────────── engine_file_list ───────────────────────── */

export class EngineFileListTool extends BaseTool {
    name = 'engine_file_list';
    description = 'Engine-internal: list the files and folders of the run\'s project folder with sizes, honouring .gitignore and skipping node_modules, .git, dist, build and .joe, which it counts. Needs projectRoot in the tool context.';
    version = '1.0.0';
    tags = ['engine', 'fs', 'list', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'Folder relative to the project folder (default: the project folder).' },
            pattern: { type: 'string', description: 'Glob filter, e.g. "**/*.css": lists the matching files at any depth.' },
            depth: { type: 'integer', minimum: 1, description: `Levels to list (default ${LIST_DEFAULT_DEPTH}).` },
        },
        required: [] as string[],
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = ENGINE_FILE_CALLS_PER_MINUTE;
    auditFields = ['path'];

    async execute(input: any, context?: any): Promise<Result> {
        const bound = await bindProject(context);
        if (!bound.ok) return refuse(bound.error);
        const raw = stringArg(input, 'path') ?? '';
        const pattern = (stringArg(input, 'pattern') ?? '').trim();
        const depthArg = countArg(input, 'depth', 'file_list');
        if (typeof depthArg === 'object') return refuse(depthArg.error);

        const check = await resolveInProject(bound.root, raw, 'list');
        if (!check.ok) return refuse(check.error);
        const startRel = check.rel === '.' ? '' : check.rel;
        if (!check.exists) return refuse(`${check.rel} does not exist.${await nearestFolderHint(bound.root, check.rel)}`);
        if (!check.isDir) {
            return {
                ok: true,
                output: { path: check.rel, text: `${check.rel} is a file (${humanBytes(check.size)}). Use file_read to read it.`, shown: 1, total: 1 },
                logs: [`engine_file_list ${check.rel} (a file)`],
            };
        }
        let match: GlobMatcher | null = null;
        if (pattern) {
            const glob = globMatcher(pattern, 'file_list');
            if (!glob.ok) return refuse(glob.error);
            match = glob.match;
        }
        const maxDepth = depthArg ?? (match ? Number.POSITIVE_INFINITY : LIST_DEFAULT_DEPTH);
        const prepared = await prepareWalk(bound.root, startRel);
        const walked = await walkProject(bound.root, startRel, { maxDepth, countBelow: !match, rules: prepared.rules, factory: prepared.factory, context });

        const entries = match ? walked.entries.filter(e => e.kind === 'file' && match!(relativeTo(startRel, e.rel))) : walked.entries;
        const rows = entries.map(e => {
            if (e.kind === 'dir') return `${e.rel}/${e.below === undefined ? '' : e.below === null ? '  (unreadable)' : e.below === 0 ? '  (empty)' : `  (${plural(e.below, 'entry', 'entries')} below depth ${maxDepth})`}`;
            if (e.kind === 'link') return `${e.rel}  (a link; not followed)`;
            if (e.kind === 'other') return `${e.rel}  (not a regular file)`;
            const secret = isSecretName(path.posix.basename(e.rel)) ? '  (holds secrets: the engine never reads it)' : '';
            return `${e.rel}  ${e.size === undefined ? '?' : humanBytes(e.size)}${secret}`;
        });
        const shown: string[] = [];
        let chars = 0;
        for (const row of rows) {
            if (shown.length >= LIST_MAX_LINES || chars + row.length + 1 > LIST_MAX_CHARS) break;
            shown.push(row);
            chars += row.length + 1;
        }
        const folders = entries.filter(e => e.kind === 'dir').length;
        const files = entries.filter(e => e.kind === 'file').length;
        const header = match
            ? `Files matching "${pattern}" in ${shownPath(startRel)}${Number.isFinite(maxDepth) ? ` (depth ${maxDepth})` : ''}:`
            : `Folder ${shownPath(startRel)} (depth ${maxDepth}):`;
        const lines = [header, ...(shown.length ? shown : [match ? '(no file matches)' : '(empty)'])];
        if (rows.length > shown.length) lines.push(`… ${plural(rows.length - shown.length, 'more entry', 'more entries')} not shown. List a subfolder, use a smaller depth, or a pattern.`);
        lines.push(match ? `${plural(files, 'file')} ${files === 1 ? 'matches' : 'match'}.` : `${plural(folders, 'folder')}, ${plural(files, 'file')}.`);
        lines.push(...walkNotes(walked, prepared.gitignore));
        return {
            ok: true,
            output: { path: shownPath(startRel), text: lines.join('\n'), shown: shown.length, total: rows.length, skipped: walked.skipped, ignored: walked.ignored },
            logs: [`engine_file_list ${shownPath(startRel)} ${rows.length} entries`],
        };
    }
}

/* ───────────────────────── engine_file_search ───────────────────────── */

/**
 * The search itself, in a worker thread: plain JavaScript and Node's own
 * modules only, so it runs the same from the TypeScript sources, from jest
 * and from the bundle. It posts what it found as it goes, so a search that
 * is stopped at its deadline still reports the matches it reached.
 */
const SEARCH_WORKER = String.raw`
'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { files, source, flags, maxShown, lineChars, maxBytes } = workerData;
const re = new RegExp(source, flags);
const found = { matches: 0, filesWithMatches: 0, searched: 0, binary: 0, unreadable: 0, tooLarge: [] };
const shown = [];
let sent = 0;
let next = 0;
function cut(line, at) {
  if (line.length <= lineChars) return line;
  const start = Math.max(0, Math.min(at - Math.floor(lineChars / 3), line.length - lineChars));
  return (start > 0 ? '…' : '') + line.slice(start, start + lineChars) + (start + lineChars < line.length ? '…' : '');
}
function post(type) {
  parentPort.postMessage({ type: type, found: found, shown: shown.slice(sent), done: next });
  sent = shown.length;
}
(async () => {
  let lastPost = Date.now();
  for (; next < files.length; next++) {
    const file = files[next];
    if (file.size > maxBytes) { found.tooLarge.push(file.rel); continue; }
    let bytes;
    try { bytes = await fs.promises.readFile(file.abs); } catch (error) { found.unreadable++; continue; }
    const head = bytes.subarray(0, 8000);
    if (head.indexOf(0) !== -1 || head.subarray(0, 5).toString('latin1') === '%PDF-') { found.binary++; continue; }
    let text = bytes.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    found.searched++;
    let inFile = 0;
    let lineNo = 0;
    let start = 0;
    while (start < text.length) {
      let end = text.indexOf('\n', start);
      if (end === -1) end = text.length;
      let line = text.slice(start, end);
      if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      lineNo++;
      const m = re.exec(line);
      if (m) {
        inFile++;
        found.matches++;
        if (shown.length < maxShown) shown.push([file.rel, lineNo, cut(line, m.index)]);
      }
      start = end + 1;
    }
    if (inFile) found.filesWithMatches++;
    if (Date.now() - lastPost >= 200) { post('progress'); lastPost = Date.now(); }
  }
  post('done');
})().catch((error) => parentPort.postMessage({ type: 'error', message: String((error && error.message) || error) }));
`;

interface SearchFound { matches: number; filesWithMatches: number; searched: number; binary: number; unreadable: number; tooLarge: string[] }
interface SearchRun { found: SearchFound; shown: Array<[string, number, string]>; done: number; finished: boolean; stoppedBy?: 'deadline' | 'cancel'; error?: string }

function compilePattern(pattern: string, literal: boolean, ignoreCase: boolean): { ok: true; source: string; flags: string } | { ok: false; error: string } {
    const source = literal ? pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') : pattern;
    const base = ignoreCase ? 'i' : '';
    // Unicode mode first (\p{…} works there); a pattern only the classic mode reads, such as \-, gets that.
    try { new RegExp(source, `${base}u`); return { ok: true, source, flags: `${base}u` }; } catch { /* try the classic mode */ }
    try { new RegExp(source, base); return { ok: true, source, flags: base }; }
    catch (error: any) { return { ok: false, error: String(error?.message || error) }; }
}

function runSearch(data: Record<string, unknown>, timeoutMs: number, context: any): Promise<SearchRun> {
    return new Promise(resolve => {
        const run: SearchRun = { found: { matches: 0, filesWithMatches: 0, searched: 0, binary: 0, unreadable: 0, tooLarge: [] }, shown: [], done: 0, finished: false };
        let settled = false;
        let worker: Worker;
        const finish = (change: Partial<SearchRun>) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            Object.assign(run, change);
            worker.terminate().catch(() => undefined).finally(() => resolve(run));
        };
        const timer = setTimeout(() => finish({ stoppedBy: 'deadline' }), timeoutMs);
        try {
            worker = new Worker(SEARCH_WORKER, { eval: true, workerData: data, resourceLimits: { maxOldGenerationSizeMb: 512 } });
        } catch (error: any) {
            settled = true;
            clearTimeout(timer);
            resolve({ ...run, error: `the search could not start (${firstLine(error?.message)})` });
            return;
        }
        worker.on('message', (message: any) => {
            if (settled) return;
            if (message?.found) run.found = message.found;
            if (Array.isArray(message?.shown)) run.shown.push(...message.shown);
            if (typeof message?.done === 'number') run.done = message.done;
            if (message?.type === 'done') finish({ finished: true });
            else if (message?.type === 'error') finish({ error: String(message.message) });
        });
        worker.on('error', error => finish({ error: firstLine((error as any)?.message || error) }));
        worker.on('exit', code => finish({ error: `the search stopped (exit code ${code})` }));
        const cancellation = context?.cancellation;
        if (cancellation && typeof cancellation.then === 'function') cancellation.then(() => finish({ stoppedBy: 'cancel' }), () => undefined);
        if (context?.isCancelled?.()) finish({ stoppedBy: 'cancel' });
    });
}

export class EngineFileSearchTool extends BaseTool {
    name = 'engine_file_search';
    description = 'Engine-internal: search the text of the run\'s project files for a regular expression (or literal text) and answer path:line: text with the total count; skips binary files, node_modules, .git, dist, build, .joe and .gitignore\'d files. Needs projectRoot in the tool context.';
    version = '1.0.0';
    tags = ['engine', 'fs', 'search', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            pattern: { type: 'string', description: 'Regular expression (JavaScript syntax), or exact text with literal: true.' },
            path: { type: 'string', description: 'Folder or file relative to the project folder (default: the project folder).' },
            glob: { type: 'string', description: 'Only files whose path matches this glob, e.g. "*.tsx".' },
            ignore_case: { type: 'boolean', description: 'Case-insensitive matching.' },
            literal: { type: 'boolean', description: 'Search for pattern as exact text.' },
            timeout_ms: { type: 'integer', minimum: 100, description: `Engine-internal: the search's time budget in milliseconds (default ${SEARCH_TIMEOUT_MS}).` },
        },
        required: ['pattern'],
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = ENGINE_FILE_CALLS_PER_MINUTE;
    auditFields = ['pattern', 'path'];

    async execute(input: any, context?: any): Promise<Result> {
        const bound = await bindProject(context);
        if (!bound.ok) return refuse(bound.error);
        const pattern = stringArg(input, 'pattern');
        if (!pattern) return refuse('file_search needs "pattern": the regular expression (or, with literal: true, the text) to look for.');
        const ignoreCase = flagArg(input, 'ignore_case', 'file_search');
        if (typeof ignoreCase === 'object') return refuse(ignoreCase.error);
        const literal = flagArg(input, 'literal', 'file_search');
        if (typeof literal === 'object') return refuse(literal.error);
        const budget = countArg(input, 'timeout_ms', 'file_search');
        if (typeof budget === 'object') return refuse(budget.error);
        const timeoutMs = Math.max(100, budget ?? SEARCH_TIMEOUT_MS);
        const compiled = compilePattern(pattern, literal, ignoreCase);
        if (!compiled.ok) return refuse(`The pattern is not a valid regular expression: ${compiled.error}. Fix it, or set literal to true to search for the text exactly as written.`);
        const globText = (stringArg(input, 'glob') ?? '').trim();
        let match: GlobMatcher | null = null;
        if (globText) {
            const glob = globMatcher(globText, 'file_search');
            if (!glob.ok) return refuse(glob.error);
            match = glob.match;
        }

        //  'read': a search reads content, so a secret file is refused like a read of it.
        const check = await resolveInProject(bound.root, stringArg(input, 'path') ?? '', 'read');
        if (!check.ok) return refuse(check.error);
        if (!check.exists) return refuse(`${check.rel} does not exist.${await nearestFolderHint(bound.root, check.rel)}`);
        const startRel = check.rel === '.' ? '' : check.rel;
        let candidates: Array<{ rel: string; abs: string; size: number }>;
        let notes: string[] = [];
        let secrets = 0;
        if (!check.isDir) {
            candidates = [{ rel: check.rel, abs: check.abs, size: check.size }];
        } else {
            const prepared = await prepareWalk(bound.root, startRel);
            const walked = await walkProject(bound.root, startRel, { maxDepth: Number.POSITIVE_INFINITY, countBelow: false, rules: prepared.rules, factory: prepared.factory, context });
            if (walked.cancelled) return refuse('The run was cancelled; the search did not run.');
            notes = walkNotes(walked, prepared.gitignore);
            candidates = [];
            for (const e of walked.entries) {
                if (e.kind !== 'file') continue;
                if (isSecretName(path.posix.basename(e.rel))) { secrets++; continue; }
                if (match && !match(relativeTo(startRel, e.rel))) continue;
                candidates.push({ rel: e.rel, abs: e.abs, size: e.size ?? 0 });
            }
        }
        if (secrets) notes.push(`Not searched: ${plural(secrets, 'file')} that ${secrets === 1 ? 'holds' : 'hold'} secrets.`);
        const where = shownPath(startRel);
        const place = startRel || 'the project folder';
        const shownPattern = literal ? JSON.stringify(pattern) : `/${pattern}/${ignoreCase ? 'i' : ''}`;
        if (!candidates.length) {
            return {
                ok: true,
                output: { path: where, text: [`No files to search in ${place}${globText ? ` matching "${globText}"` : ''}.`, ...notes].join('\n'), matches: 0, files: 0, shown: 0 },
                logs: [`engine_file_search ${where} no files`],
            };
        }

        const run = await runSearch({ files: candidates, source: compiled.source, flags: compiled.flags, maxShown: SEARCH_MAX_SHOWN, lineChars: SEARCH_LINE_CHARS, maxBytes: WHOLE_FILE_BYTES }, timeoutMs, context);
        const rows: string[] = [];
        let chars = 0;
        for (const [rel, line, text] of run.shown) {
            const row = `${rel}:${line}: ${text}`;
            if (chars + row.length + 1 > SEARCH_OUTPUT_CHARS) break;
            rows.push(row);
            chars += row.length + 1;
        }
        const f = run.found;
        const lines: string[] = [];
        if (run.stoppedBy === 'cancel') return refuse('The run was cancelled; the search stopped.');
        if (run.error && !run.finished) return refuse(`The search failed: ${run.error}.`);
        if (run.stoppedBy === 'deadline') {
            lines.push(`The search stopped after ${(timeoutMs / 1000).toFixed(1)} s with ${run.done} of ${plural(candidates.length, 'file')} searched: ${plural(f.matches, 'matching line')} so far.`);
            lines.push('The pattern may backtrack too much (nested repeats such as (a+)+ do); simplify it, or narrow the search with path or glob.');
        }
        lines.push(...rows);
        if (run.finished) {
            lines.push(f.matches
                ? `${plural(f.matches, 'matching line')} in ${plural(f.filesWithMatches, 'file')} (${plural(f.searched, 'file')} searched) for ${shownPattern} in ${place}.`
                : `No match for ${shownPattern} in ${plural(f.searched, 'file')} searched in ${place}.`);
        }
        if (f.matches > rows.length) lines.push(`Showing ${rows.length} of ${f.matches}; narrow the search with path or glob to see the rest.`);
        if (f.binary) notes.push(`Not searched: ${plural(f.binary, 'binary file')}.`);
        if (f.tooLarge.length) notes.push(`Not searched, larger than ${humanBytes(WHOLE_FILE_BYTES)}: ${f.tooLarge.slice(0, SKIPPED_SHOWN).join(', ')}${f.tooLarge.length > SKIPPED_SHOWN ? `, and ${f.tooLarge.length - SKIPPED_SHOWN} more` : ''}.`);
        if (f.unreadable) notes.push(`Could not be read: ${plural(f.unreadable, 'file')}.`);
        lines.push(...notes);
        return {
            ok: run.finished,
            ...(run.finished ? {} : { error: lines.join('\n') }),
            output: { path: where, text: lines.join('\n'), matches: f.matches, files: f.filesWithMatches, searched: f.searched, shown: rows.length, finished: run.finished },
            logs: [`engine_file_search ${shownPattern} in ${where}: ${f.matches} matches${run.finished ? '' : ' (stopped)'}`],
        };
    }
}

/** The five, in the order the engine offers them. */
export const engineFileTools = [
    new EngineFileReadTool(),
    new EngineFileWriteTool(),
    new EngineFileEditTool(),
    new EngineFileListTool(),
    new EngineFileSearchTool(),
];
