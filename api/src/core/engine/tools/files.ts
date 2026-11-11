/**
 * THE FILE TOOLS AS THE MODEL SEES THEM.
 *
 * file_read, file_write, file_edit, file_list and file_search are the names
 * the engine's system prompt uses. Each one is an adapter and nothing more:
 * it normalises the model's arguments, calls the registered engine_file_*
 * tool through ToolService.executeTool with Joe's tool context for this run
 * (so identity, policy, rate limits and the UI's file events stay where
 * AGENTS.md puts them), and turns the answer into a ToolOutcome. A write or
 * an edit names the file it changed in facts.filesChanged, which the loop's
 * progress measure and the delivery checks read.
 *
 * The descriptions are written for a small model: what the tool does, when
 * to use it, and what comes back, in a few plain sentences. The parameter
 * schemas are literals with their keys in a fixed order, so the tool list
 * the model reads is byte-for-byte the same on every step.
 */
import path from 'path';
import { executeTool } from '../../../modules/services/ToolService';
import { SEARCH_TIMEOUT_MS } from '../../../modules/tools/definitions/EngineFileTools';
import type { EngineTool, FileChange, ParseResult, ToolContext, ToolOutcome } from '../types';

export interface FileReadArgs { path: string; offset?: number; limit?: number }
export interface FileWriteArgs { path: string; content: string }
export interface FileEditArgs { path: string; old_text: string; new_text: string; replace_all?: boolean }
export interface FileListArgs { path?: string; pattern?: string; depth?: number }
export interface FileSearchArgs { pattern: string; path?: string; glob?: string; ignore_case?: boolean; literal?: boolean }

/* ───────────────────────── arguments ───────────────────────── */

type Raw = Record<string, unknown>;
type Field<T> = { ok: true; value: T | undefined } | { ok: false; error: string };

/**
 * The names other agents' tools use for the same argument. A model trained
 * on them writes old_string or file_path; the meaning is the same, so the
 * call is read, not refused.
 */
const ALIASES: Record<string, string[]> = {
    path: ['path', 'file_path', 'filepath', 'filename', 'file'],
    content: ['content', 'contents', 'text'],
    old_text: ['old_text', 'old_string', 'old_str', 'search', 'find'],
    new_text: ['new_text', 'new_string', 'new_str', 'replace', 'replacement'],
    replace_all: ['replace_all', 'replaceAll'],
    offset: ['offset', 'start_line', 'startLine'],
    limit: ['limit'],
    depth: ['depth', 'max_depth'],
    list_pattern: ['pattern', 'glob'],
    pattern: ['pattern', 'query', 'regex'],
    glob: ['glob', 'include', 'file_pattern'],
    ignore_case: ['ignore_case', 'ignoreCase', 'case_insensitive'],
    literal: ['literal', 'fixed_strings'],
};

function pick(raw: Raw, key: string): unknown {
    for (const name of ALIASES[key] ?? [key]) {
        const value = raw[name];
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

function objectArgs(raw: unknown, tool: string, shape: string): Raw | string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return `${tool} takes an object: ${shape}.`;
    return raw as Raw;
}

function textField(raw: Raw, key: string, tool: string, required: string | null): Field<string> {
    const value = pick(raw, key);
    if (value === undefined) return required ? { ok: false, error: required } : { ok: true, value: undefined };
    if (typeof value !== 'string') return { ok: false, error: `${tool}: "${key}" must be a string (got ${Array.isArray(value) ? 'a list' : typeof value}).` };
    return { ok: true, value };
}

function numberField(raw: Raw, key: string, tool: string): Field<number> {
    const value = pick(raw, key);
    if (value === undefined || value === '') return { ok: true, value: undefined };
    if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
    if (typeof value === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/u.test(value)) return { ok: true, value: Number(value) };
    return { ok: false, error: `${tool}: "${key}" must be a number (got ${JSON.stringify(value)}).` };
}

function flagField(raw: Raw, key: string, tool: string): Field<boolean> {
    const value = pick(raw, key);
    if (value === undefined || value === '') return { ok: true, value: undefined };
    if (typeof value === 'boolean') return { ok: true, value };
    if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
    return { ok: false, error: `${tool}: "${key}" must be true or false (got ${JSON.stringify(value)}).` };
}

/** Only the keys that have a value: what the registered tool receives, and what the transcript records. */
function defined<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function fail<A>(error: string): ParseResult<A> {
    return { ok: false, error };
}

/* ───────────────────────── the call ───────────────────────── */

function firstLine(value: unknown): string {
    return String(value ?? '').split(/\r?\n/u).find(line => line.trim())?.trim().slice(0, 300) ?? '';
}

/**
 * The registered tools act on the tool context's projectRoot; the loop
 * writes its state into ctx.projectDir and tells the model that folder. Two
 * ends that must agree are checked here, on every call, rather than trusted.
 */
function projectMismatch(toolContext: any, projectDir: string): string | null {
    const bound = toolContext?.projectRoot;
    if (typeof bound !== 'string' || !bound || typeof projectDir !== 'string' || !projectDir) return null;
    const fold = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
    if (fold(bound) === fold(projectDir)) return null;
    return 'Nothing was done: Joe bound the file tools to a different folder than this run\'s project folder. This is a wiring fault in Joe, not in your call.';
}

function failureText(label: string, res: any): string {
    const error = String(res?.error ?? '').trim();
    const output = res?.output;
    if (error === 'rate_limited') {
        const seconds = Math.ceil(Number(output?.retryAfterMs || 0) / 1000);
        return `${label} was not run: Joe allows a limited number of these calls per minute${seconds ? `; try again in ${seconds} s` : ''}.`;
    }
    if (error === 'approval_required') return `${label} was not run: Joe asks the owner's approval for it first (risk: ${output?.risk ?? 'unknown'}).`;
    if (error === 'policy_blocked') return `${label} was not run: Joe's policy blocked it${output?.reason ? ` (${output.reason})` : ''}.`;
    if (/^(?:workspace_required|unauthorized|session_forbidden)$/u.test(error)) return `${label} was not run: Joe's gateway refused it (${error}).`;
    if (error.startsWith('unknown_tool')) return `${label} is not available in this Joe (${error}).`;
    return error || `${label} failed without saying why.`;
}

export function outcomeOf(label: string, res: any): ToolOutcome {
    if (!res?.ok) return { ok: false, output: failureText(label, res) };
    const output = res.output;
    const text = typeof output?.text === 'string' ? output.text : `${label} finished.`;
    const change = output?.change === 'created' || output?.change === 'modified' ? output.change : null;
    if (change && typeof output?.path === 'string' && output.path) {
        const fact: FileChange = { path: output.path, change, ...(typeof output.bytes === 'number' ? { bytes: output.bytes } : {}) };
        return { ok: true, output: text, facts: { filesChanged: [fact] } };
    }
    return { ok: true, output: text };
}

async function call(tool: string, label: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    const toolContext = ctx.joe?.toolContext;
    const mismatch = projectMismatch(toolContext, ctx.projectDir);
    if (mismatch) return { ok: false, output: mismatch };
    let res: any;
    try { res = await executeTool(tool, input, toolContext); }
    catch (error: any) { return { ok: false, output: `${label} could not run: ${firstLine(error?.message ?? error)}` }; }
    return outcomeOf(label, res);
}

/* ───────────────────────── the five tools ───────────────────────── */

export const fileReadTool: EngineTool<FileReadArgs> = {
    name: 'file_read',
    description: 'Read a text file. Returns its lines numbered like cat -n, 400 lines at a time; the last line says which lines you got and the offset to continue from. Use offset and limit for long files. Images and binary files are described, not shown. For a folder, use file_list.',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder, e.g. "src/App.jsx".' },
            offset: { type: 'integer', description: 'First line to show (1 = the first line). Default 1.' },
            limit: { type: 'integer', description: 'How many lines to show. Default 400.' },
        },
        required: ['path'],
    },
    parse(rawArgs) {
        const raw = objectArgs(rawArgs, 'file_read', '{"path": "src/App.jsx", "offset": 1, "limit": 400}');
        if (typeof raw === 'string') return fail(raw);
        const file = textField(raw, 'path', 'file_read', 'file_read needs "path": the file to read, relative to the project folder.');
        if (!file.ok) return fail(file.error);
        if (!file.value!.trim()) return fail('file_read needs "path": the file to read, relative to the project folder.');
        const offset = numberField(raw, 'offset', 'file_read');
        if (!offset.ok) return fail(offset.error);
        const limit = numberField(raw, 'limit', 'file_read');
        if (!limit.ok) return fail(limit.error);
        return { ok: true, value: defined({ path: file.value!, offset: offset.value, limit: limit.value }) };
    },
    run: (args, ctx) => call('engine_file_read', 'file_read', defined({ path: args.path, offset: args.offset, limit: args.limit }), ctx),
};

export const fileWriteTool: EngineTool<FileWriteArgs> = {
    name: 'file_write',
    description: 'Create a file or replace all of its content. Folders are created as needed. Use it for new files and short files; to change part of an existing file, use file_edit. JavaScript, TypeScript and JSON are parse-checked: a file that does not parse is still written, and the result gives the line, column and error so you can fix it with file_edit.',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder, e.g. "src/App.jsx".' },
            content: { type: 'string', description: 'The complete content of the file.' },
        },
        required: ['path', 'content'],
    },
    parse(rawArgs) {
        const raw = objectArgs(rawArgs, 'file_write', '{"path": "src/App.jsx", "content": "..."}');
        if (typeof raw === 'string') return fail(raw);
        const file = textField(raw, 'path', 'file_write', 'file_write needs "path": the file to write, relative to the project folder.');
        if (!file.ok) return fail(file.error);
        if (!file.value!.trim()) return fail('file_write needs "path": the file to write, relative to the project folder.');
        let content = pick(raw, 'content');
        //  A .json file given as an object is that object's JSON: the meaning is not in doubt.
        if (content && typeof content === 'object' && /\.json$/iu.test(file.value!.trim())) content = `${JSON.stringify(content, null, 2)}\n`;
        if (content === undefined) return fail('file_write needs "content": the complete text of the file.');
        if (typeof content !== 'string') return fail(`file_write: "content" must be a string (got ${Array.isArray(content) ? 'a list' : typeof content}).`);
        return { ok: true, value: { path: file.value!, content } };
    },
    run: (args, ctx) => call('engine_file_write', 'file_write', { path: args.path, content: args.content }, ctx),
};

export const fileEditTool: EngineTool<FileEditArgs> = {
    name: 'file_edit',
    description: 'Change part of an existing file: replace old_text with new_text. Copy old_text exactly from file_read output, without the line numbers, with enough surrounding lines that it matches one place only; set replace_all to change every match. Returns a diff. An edit that would stop a JavaScript, TypeScript or JSON file from parsing is refused, and the file is left unchanged.',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'File path relative to the project folder.' },
            old_text: { type: 'string', description: 'The exact text to replace, copied from file_read (without line numbers).' },
            new_text: { type: 'string', description: 'The text to put in its place. Empty to delete old_text.' },
            replace_all: { type: 'boolean', description: 'true to replace every match. Default false: old_text must match exactly one place.' },
        },
        required: ['path', 'old_text', 'new_text'],
    },
    parse(rawArgs) {
        const raw = objectArgs(rawArgs, 'file_edit', '{"path": "src/App.jsx", "old_text": "...", "new_text": "..."}');
        if (typeof raw === 'string') return fail(raw);
        const file = textField(raw, 'path', 'file_edit', 'file_edit needs "path": the file to change, relative to the project folder.');
        if (!file.ok) return fail(file.error);
        if (!file.value!.trim()) return fail('file_edit needs "path": the file to change, relative to the project folder.');
        const oldText = textField(raw, 'old_text', 'file_edit', 'file_edit needs "old_text": the exact text to replace, copied from file_read. To create a file, use file_write.');
        if (!oldText.ok) return fail(oldText.error);
        if (!oldText.value) return fail('file_edit needs "old_text": the exact text to replace, copied from file_read. To create a file, use file_write.');
        const newText = textField(raw, 'new_text', 'file_edit', 'file_edit needs "new_text": the text to put in place of old_text (empty to delete it).');
        if (!newText.ok) return fail(newText.error);
        const replaceAll = flagField(raw, 'replace_all', 'file_edit');
        if (!replaceAll.ok) return fail(replaceAll.error);
        return { ok: true, value: defined({ path: file.value!, old_text: oldText.value, new_text: newText.value!, replace_all: replaceAll.value }) };
    },
    run: (args, ctx) => call('engine_file_edit', 'file_edit', defined({ path: args.path, old_text: args.old_text, new_text: args.new_text, replace_all: args.replace_all }), ctx),
};

export const fileListTool: EngineTool<FileListArgs> = {
    name: 'file_list',
    description: 'List the project\'s files and folders with sizes. path: the folder to list (default: the project folder). depth: how many levels (default 2). pattern: a glob such as "**/*.tsx" lists only the matching files, at any depth. node_modules, .git, dist, build, .joe and files in .gitignore are skipped and counted.',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Folder relative to the project folder. Default: the project folder.' },
            pattern: { type: 'string', description: 'Glob filter, e.g. "**/*.css". Lists the matching files at any depth.' },
            depth: { type: 'integer', description: 'How many levels to list. Default 2 (1 = only this folder).' },
        },
    },
    parse(rawArgs) {
        const raw = objectArgs(rawArgs ?? {}, 'file_list', '{"path": "src", "depth": 2}');
        if (typeof raw === 'string') return fail(raw);
        const folder = textField(raw, 'path', 'file_list', null);
        if (!folder.ok) return fail(folder.error);
        const pattern = textField(raw, 'list_pattern', 'file_list', null);
        if (!pattern.ok) return fail(pattern.error);
        const depth = numberField(raw, 'depth', 'file_list');
        if (!depth.ok) return fail(depth.error);
        return { ok: true, value: defined({ path: folder.value, pattern: pattern.value?.trim() || undefined, depth: depth.value }) };
    },
    run: (args, ctx) => call('engine_file_list', 'file_list', defined({ path: args.path, pattern: args.pattern, depth: args.depth }), ctx),
};

export const fileSearchTool: EngineTool<FileSearchArgs> = {
    name: 'file_search',
    description: 'Search the text of the project\'s files for a regular expression, or for exact text with literal: true. Returns path:line: text for each matching line, and the total count. path: a folder or file to search (default: the project folder). glob: only files that match it, e.g. "*.css" or "src/**/*.tsx". Binary files, node_modules, .git, dist, build, .joe and files in .gitignore are skipped.',
    parameters: {
        type: 'object',
        properties: {
            pattern: { type: 'string', description: 'The regular expression (JavaScript syntax), or the exact text when literal is true.' },
            path: { type: 'string', description: 'Folder or file to search, relative to the project folder. Default: the project folder.' },
            glob: { type: 'string', description: 'Only search files whose path matches this glob, e.g. "*.tsx".' },
            ignore_case: { type: 'boolean', description: 'true for case-insensitive matching.' },
            literal: { type: 'boolean', description: 'true to search for pattern as exact text, not a regular expression.' },
        },
        required: ['pattern'],
    },
    parse(rawArgs) {
        const raw = objectArgs(rawArgs, 'file_search', '{"pattern": "useState", "path": "src", "glob": "*.jsx"}');
        if (typeof raw === 'string') return fail(raw);
        const pattern = textField(raw, 'pattern', 'file_search', 'file_search needs "pattern": the regular expression (or, with literal: true, the text) to look for.');
        if (!pattern.ok) return fail(pattern.error);
        if (!pattern.value) return fail('file_search needs "pattern": the regular expression (or, with literal: true, the text) to look for.');
        const folder = textField(raw, 'path', 'file_search', null);
        if (!folder.ok) return fail(folder.error);
        const glob = textField(raw, 'glob', 'file_search', null);
        if (!glob.ok) return fail(glob.error);
        const ignoreCase = flagField(raw, 'ignore_case', 'file_search');
        if (!ignoreCase.ok) return fail(ignoreCase.error);
        const literal = flagField(raw, 'literal', 'file_search');
        if (!literal.ok) return fail(literal.error);
        return { ok: true, value: defined({ pattern: pattern.value, path: folder.value, glob: glob.value?.trim() || undefined, ignore_case: ignoreCase.value, literal: literal.value }) };
    },
    run(args, ctx) {
        //  The search's own deadline never outlives the run's.
        const left = Number.isFinite(ctx.deadlineAt) ? Math.floor(ctx.deadlineAt - Date.now()) : SEARCH_TIMEOUT_MS;
        const timeout = Math.max(1_000, Math.min(SEARCH_TIMEOUT_MS, left));
        return call('engine_file_search', 'file_search', defined({
            pattern: args.pattern, path: args.path, glob: args.glob, ignore_case: args.ignore_case, literal: args.literal, timeout_ms: timeout,
        }), ctx);
    },
};

/** The file tools, in the order the engine offers them. */
export const fileTools: EngineTool[] = [fileReadTool, fileWriteTool, fileEditTool, fileListTool, fileSearchTool];
