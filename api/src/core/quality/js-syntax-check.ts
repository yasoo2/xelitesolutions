/**
 * A PROJECT WITH NO LINT SCRIPT STILL HAS A PARSER.
 *
 * P001 (run500, 2026-10-25): a plain-JavaScript landing page — package.json
 * with only `start` — reached its final phase, whose plan said «Lint and
 * syntax check codebase» through quality_run. The tool looked for npm
 * scripts, found none, skipped every check and failed the whole build with
 * «No requested quality checks were available to execute». The code was
 * never read; the build died for a missing word in a manifest.
 *
 * Node itself is the toolchain of such a project, and its parser is a real
 * check: it can fail, and when it fails it names the file and the token.
 *
 * `node --check file.js` IS NOT A SYNTAX CHECK ON ITS OWN. Measured on Node
 * 24.18 while writing this: `import x from "./a.js";\nconst = 1;` in a `.js`
 * file with no `"type": "module"` exits ZERO — the script parse fails, the
 * module retry swallows the error. The same bytes as `.mjs` exit 1. So the
 * goal is forced, as terminal-audit does: each source is copied to a temp
 * file whose extension states its goal, and that copy is what is checked.
 *
 * ⛔ THE GOAL IS THE ONE THE FILE WILL REALLY BE PARSED WITH (round 21 review).
 * Guessing it from the project root's manifest and an `import` at the start
 * of a line was wrong both ways, measured on Node 24.18:
 *   - `"type": "commonjs"` — what `npm init -y` writes — makes Node run a
 *     `.js` file as CommonJS, so an ES-module server.js crashes at start; the
 *     guess checked it as a module and the launch gate passed it;
 *   - with no stated type Node DETECTS the goal: a file whose only module
 *     signal is `import.meta` or a top-level `await` runs as a module, and
 *     the guess failed it as broken CommonJS;
 *   - a page decides for the scripts it loads: `<script type="module">` is a
 *     module whatever package.json says (and so is every file it imports),
 *     a classic `<script>` is a script, and `type="text/babel"` hands the file
 *     to an in-browser transpiler — JSX, which no JavaScript engine parses.
 * So the goal is read as Node and the browser read it: the nearest
 * package.json above the file (as Node walks), Node's own syntax detection
 * when no type is stated, and the pages that load the file.
 *
 * ⛔ ONLY THE PARSER CAN SAY A FILE IS BROKEN. A full execution queue, a
 * timeout or a spawn error is the check not running, never a syntax error in
 * his file: those come back as «the check could not run: <reason>», kind
 * 'unchecked', and the reported line of a real rejection is the parser's own
 * `SyntaxError: …` line — never the temp probe's path or the echoed source.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { MACHINE_STATE_DIRECTORIES } from '../../shared/utils/project-tree';
import { parserDiagnosis } from '../../shared/utils/parser-diagnosis';

const IGNORED_DIRS = new Set(['dist', 'build', 'out', ...MACHINE_STATE_DIRECTORIES]);
const PARSEABLE = /\.(?:js|mjs|cjs)$/iu;
const PAGE = /\.html?$/iu;

/**
 * The grammar a parse is held to. 'script' is a browser's classic script: a
 * Script, not a CommonJS module — Node's CJS wrapper declares `module` and
 * allows a top-level `return`, a browser does neither (round 21 review, Q5).
 */
export type ParseGoal = 'commonjs' | 'script' | 'module' | 'jsx' | 'tsx' | 'ts';

const GOAL_NAME: Record<ParseGoal, string> = {
    commonjs: 'CommonJS', script: 'classic script', module: 'ES module', jsx: 'JSX', tsx: 'TSX', ts: 'TypeScript',
};

/**
 * How one file must parse. Every group must pass; a group passes when any of
 * its goals does — Node's syntax detection is one group of two (CommonJS,
 * else an ES module), a goal that is stated is a group of one.
 */
export interface GoalPlan {
    groups: ParseGoal[][];
    because: string;
}

export interface JsSyntaxFailure {
    /** The file, with `:line` when the parser located its rejection. */
    file: string;
    /** A rejection: the parser's own words. Otherwise «the check could not run: <reason>». */
    error: string;
    /** 'syntax': the parser rejected the file. 'unchecked': no parser answered, so the file was not judged. */
    kind: 'syntax' | 'unchecked';
}

export interface JsSyntaxResult {
    /** Project-relative paths that were (or were to be) parsed. */
    files: string[];
    /** The first file the parser rejected; else the first that could not be checked; else null. */
    failure: JsSyntaxFailure | null;
    /** Files a page hands to something that is not a JavaScript engine — not parsed, and why. Only when there are any. */
    notParsed?: Array<{ file: string; why: string }>;
}

const posix = (file: string) => file.split(path.sep).join('/');

/** Project sources and pages, without build output or machine state. Asynchronous: a large tree never blocks the server. */
async function walkProject(projectDir: string): Promise<{ scripts: string[]; pages: string[] }> {
    const scripts: string[] = [];
    const pages: string[] = [];
    const walk = async (dir: string): Promise<void> => {
        let entries: fs.Dirent[] = [];
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) await walk(full);
                continue;
            }
            if (!entry.isFile()) continue;
            if (PARSEABLE.test(entry.name)) scripts.push(posix(path.relative(projectDir, full)));
            else if (PAGE.test(entry.name)) pages.push(posix(path.relative(projectDir, full)));
        }
    };
    await walk(projectDir);
    return { scripts: scripts.sort(), pages: pages.sort() };
}

export async function listJavaScriptSources(projectDir: string): Promise<string[]> {
    return (await walkProject(projectDir)).scripts;
}

/**
 * Whether this Node detects a `.js` file's goal from its syntax when no
 * package.json states a type: on by default since 22.7.0 and 20.19.0. Older
 * releases run such a file as CommonJS, so for them it is held to CommonJS.
 */
export function nodeDetectsModuleSyntax(version: string = process.versions.node): boolean {
    const [major, minor] = String(version).replace(/^v/u, '').split('.').map(part => Number.parseInt(part, 10) || 0);
    return major > 22 || (major === 22 && minor >= 7) || (major === 20 && minor >= 19);
}

/**
 * The "type" of the package scope a file belongs to, as Node finds it: the
 * nearest package.json above the file — the walk stops at the first one, and
 * at a node_modules boundary. '' when that manifest states no usable type (or
 * cannot be read), null when there is none. One cache per check run.
 */
export async function packageScopeType(absoluteFile: string, cache: Map<string, Promise<string | null>> = new Map()): Promise<string | null> {
    const lookup = (dir: string): Promise<string | null> => {
        const known = cache.get(dir);
        if (known) return known;
        const found = (async (): Promise<string | null> => {
            if (path.basename(dir) === 'node_modules') return null;
            let text: string | null = null;
            try { text = await fs.promises.readFile(path.join(dir, 'package.json'), 'utf-8'); }
            catch (error: any) {
                if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') return '';
            }
            if (text !== null) {
                try {
                    const type = JSON.parse(text)?.type;
                    // Node knows two values; anything else is no stated type.
                    return type === 'module' || type === 'commonjs' ? type : '';
                } catch { return ''; }
            }
            const parent = path.dirname(dir);
            return parent === dir ? null : lookup(parent);
        })();
        cache.set(dir, found);
        return found;
    };
    return lookup(path.dirname(path.resolve(absoluteFile)));
}

// A hint for which goal to try first — never the verdict.
const MODULE_SIGNAL = /^[ \t]*(?:import[\s{*"']|export[\s{*]|await\s)|\bimport\.meta\b/mu;

/** The goal Node runs a file with: its extension, its package scope, else Node's own detection. */
export function nodeGoalPlan(file: string, text: string, scopeType: string | null, detects = nodeDetectsModuleSyntax()): GoalPlan {
    if (/\.mjs$/iu.test(file)) return { groups: [['module']], because: 'a .mjs file is an ES module' };
    if (/\.cjs$/iu.test(file)) return { groups: [['commonjs']], because: 'a .cjs file is CommonJS' };
    if (scopeType === 'module') return { groups: [['module']], because: 'the nearest package.json says "type": "module"' };
    if (scopeType === 'commonjs') return { groups: [['commonjs']], because: 'the nearest package.json says "type": "commonjs"' };
    if (!detects) return { groups: [['commonjs']], because: `Node ${process.versions.node} runs a .js file whose type is not stated as CommonJS` };
    return {
        groups: [MODULE_SIGNAL.test(text) ? ['module', 'commonjs'] : ['commonjs', 'module']],
        because: 'no package.json states a type, so Node detects the goal from the syntax',
    };
}

// ---------------------------------------------------------------- pages

/** WHATWG «JavaScript MIME type essence match»: a classic script. */
const CLASSIC_SCRIPT_TYPE = /^(?:application\/(?:x-)?(?:ecma|java)script|text\/(?:(?:x-)?(?:ecma|java)script|javascript1\.[0-5]|jscript|livescript))$/u;

function attributesOf(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gu)) {
        attrs[m[1].toLowerCase()] = String(m[2] ?? m[3] ?? m[4] ?? '');
    }
    return attrs;
}

/** What a `<script>` element makes of its source: a goal, or a data block nothing executes. */
function scriptGoal(attrs: Record<string, string>): { goal: ParseGoal } | { data: string } {
    const type = String(attrs.type || '').split(';')[0].trim().toLowerCase();
    if (!type || CLASSIC_SCRIPT_TYPE.test(type)) return { goal: 'script' };
    if (type === 'module') return { goal: 'module' };
    // In-browser transpilers (Babel standalone reads text/babel and text/jsx).
    const presets = String(attrs['data-presets'] || '').toLowerCase();
    if (type === 'text/babel' || type === 'text/jsx') return { goal: /typescript/u.test(presets) ? 'tsx' : 'jsx' };
    if (type === 'text/tsx') return { goal: 'tsx' };
    if (type === 'text/typescript' || type === 'application/typescript') return { goal: 'ts' };
    return { data: type };
}

const STATIC_SPECIFIER = /\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"'\n]+)["']|\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/gu;

/** A script reference resolved to a listed project source, or null. Root-absolute references try each folder up to the project root. */
function resolveReference(fromFile: string, reference: string, sources: Set<string>): string | null {
    let ref = String(reference || '').trim().split(/[?#]/u)[0];
    if (!ref || /^[a-z][a-z0-9+.-]*:/iu.test(ref) || ref.startsWith('//')) return null;
    try { ref = decodeURI(ref); } catch { /* keep it as written */ }
    const fromDir = path.posix.dirname(fromFile);
    const candidates: string[] = [];
    if (ref.startsWith('/')) {
        for (let dir = fromDir; ; dir = path.posix.dirname(dir)) {
            candidates.push(path.posix.join(dir === '.' ? '' : dir, ref.slice(1)));
            if (dir === '.' || dir === '/' || dir === '') break;
        }
    } else {
        candidates.push(path.posix.normalize(path.posix.join(fromDir, ref)));
    }
    for (const candidate of candidates) {
        const rel = candidate.replace(/^\.\//u, '');
        if (!rel.startsWith('..') && sources.has(rel)) return rel;
    }
    return null;
}

/**
 * The page's <script> elements in document order — never one inside an HTML
 * comment (round 21 review, Q6): a commented-out `<script type="module"
 * src="old.js">` decided old.js's goal as if the page loaded it. A comment
 * ends at its first `-->` (`<!-->` and `<!--->` end at once, as HTML parses
 * them); a script's text ends at its first `</script>`, so a `<!--` inside a
 * script's own text is the script's, not a comment of the page.
 */
function scriptElements(html: string): Array<{ attributes: string; body: string }> {
    const out: Array<{ attributes: string; body: string }> = [];
    const token = /<!--|<script\b([^>]*)>/giu;
    let m: RegExpExecArray | null;
    while ((m = token.exec(html))) {
        if (m[0] === '<!--') {
            const after = m.index + 4;
            const abrupt = html.startsWith('>', after) ? after + 1 : html.startsWith('->', after) ? after + 2 : -1;
            const end = abrupt >= 0 ? abrupt : html.indexOf('-->', after);
            if (end < 0) break;
            token.lastIndex = abrupt >= 0 ? abrupt : end + 3;
            continue;
        }
        const close = /<\/script\s*>/giu;
        close.lastIndex = token.lastIndex;
        const closed = close.exec(html);
        out.push({ attributes: m[1], body: html.slice(token.lastIndex, closed ? closed.index : html.length) });
        token.lastIndex = closed ? closed.index + closed[0].length : html.length;
    }
    return out;
}

/**
 * The goals the project's pages give the scripts they load. A module's own
 * static imports are modules in the browser too, so the module set is closed
 * over them. A file no page loads is absent from the map: Node decides it.
 */
async function pageGoals(projectDir: string, pages: string[], sources: Set<string>): Promise<Map<string, Set<ParseGoal | `data:${string}`>>> {
    const goals = new Map<string, Set<ParseGoal | `data:${string}`>>();
    const add = (file: string, goal: ParseGoal | `data:${string}`) => {
        const set = goals.get(file) || new Set();
        set.add(goal);
        goals.set(file, set);
    };
    const modules: string[] = [];
    const importsOf = (fromFile: string, text: string) => {
        for (const m of text.matchAll(STATIC_SPECIFIER)) {
            const target = resolveReference(fromFile, m[1] || m[2] || '', sources);
            if (target) modules.push(target);
        }
    };
    for (const page of pages) {
        let html = '';
        try { html = await fs.promises.readFile(path.join(projectDir, page), 'utf-8'); } catch { continue; }
        for (const element of scriptElements(html)) {
            const attrs = attributesOf(element.attributes);
            const decided = scriptGoal(attrs);
            if (attrs.src !== undefined) {
                const target = resolveReference(page, attrs.src, sources);
                if (!target) continue;
                if ('goal' in decided) {
                    add(target, decided.goal);
                    if (decided.goal === 'module') modules.push(target);
                } else add(target, `data:${decided.data}`);
            } else if ('goal' in decided && decided.goal === 'module') {
                importsOf(page, element.body);
            }
        }
    }
    const seen = new Set<string>();
    while (modules.length) {
        const file = modules.shift()!;
        add(file, 'module');
        if (seen.has(file)) continue;
        seen.add(file);
        try { importsOf(file, await fs.promises.readFile(path.join(projectDir, file), 'utf-8')); } catch { /* reported when it is parsed */ }
    }
    return goals;
}

// ---------------------------------------------------------------- parsing

type Outcome =
    | { verdict: 'passed' }
    | { verdict: 'rejected'; line: string; said: string }
    | { verdict: 'unchecked'; reason: string };

/** The parser's error line: `SyntaxError: …`, `Error [ERR_X]: …`. */
const ERROR_LINE = /^(?:[A-Z][A-Za-z]*)?Error(?: \[[A-Z0-9_]+\])?: /u;

/**
 * A classic script compiled as a Script — what a browser does with it, and
 * what `node --check` cannot do: Node wraps a .js/.cjs file in its CommonJS
 * function, where `const module = …` is a redeclaration (a false failure of a
 * working page script) and a top-level `return` is legal (a false pass of one
 * the browser refuses). vm.Script compiles without running a line.
 */
const SCRIPT_PARSE = "const f=process.argv[1];new (require('vm').Script)(require('fs').readFileSync(f,'utf8'),{filename:f})";

// Through the sanctioned gateway, as ProjectRunTool's entry check runs.
async function nodeCheck(probe: string, timeoutMs: number, args: string[] = ['--check', probe]): Promise<Outcome> {
    let result: any;
    try {
        result = await ExecutionGateway.execute({
            id: `js-syntax-${Date.now()}`,
            type: 'shell',
            payload: {
                command: process.execPath,
                args,
                options: { cwd: path.dirname(probe), timeout: timeoutMs, shell: false, stdio: 'pipe' },
            },
            priority: 'high',
        });
    } catch (error: any) {
        return { verdict: 'unchecked', reason: String(error?.message || error) };
    }
    const data: any = result?.data || {};
    if (!result?.success) return { verdict: 'unchecked', reason: String(result?.error || data.code || 'the execution gateway did not run it') };
    if (data.exitCode === 0 && data.ok !== false) return { verdict: 'passed' };
    if (data.exitCode === 124) return { verdict: 'unchecked', reason: `node --check did not finish within ${timeoutMs} ms` };
    const lines = [data.error, data.output].filter(Boolean).join('\n').split(/\r?\n/u);
    const said = lines.map(line => line.trim()).find(line => ERROR_LINE.test(line));
    if (said && said.startsWith('SyntaxError')) {
        const where = lines.find(line => line.startsWith(probe));
        return { verdict: 'rejected', line: where ? where.slice(probe.length).replace(/^:/u, '').trim() : '', said };
    }
    const first = String(data.error || data.output || '').trim().split(/\r?\n/u)[0];
    return { verdict: 'unchecked', reason: said || first || `node --check exited ${data.exitCode}` };
}

async function transpilerCheck(file: string, text: string, loader: 'jsx' | 'tsx' | 'ts'): Promise<Outcome> {
    let esbuild: any;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        esbuild = require('esbuild');
    } catch (error: any) {
        return { verdict: 'unchecked', reason: `no ${GOAL_NAME[loader]} parser is available (${String(error?.message || error).split(/\r?\n/u)[0]})` };
    }
    try {
        await esbuild.transform(text, { loader, sourcefile: file });
        return { verdict: 'passed' };
    } catch (error: any) {
        const located = Array.isArray(error?.errors) ? error.errors.find((entry: any) => entry?.text) : null;
        if (!located) return { verdict: 'unchecked', reason: String(error?.message || error).split(/\r?\n/u)[0] };
        return { verdict: 'rejected', line: Number.isFinite(located.location?.line) ? String(located.location.line) : '', said: parserDiagnosis(error) };
    }
}

async function runGoal(tmp: string, probeName: string, file: string, text: string, goal: ParseGoal, timeoutMs: number): Promise<Outcome> {
    if (goal === 'jsx' || goal === 'tsx' || goal === 'ts') return transpilerCheck(file, text, goal);
    const probe = path.join(tmp, `${probeName}-${goal}.${goal === 'module' ? 'mjs' : goal === 'script' ? 'js' : 'cjs'}`);
    try { await fs.promises.writeFile(probe, text, 'utf-8'); }
    catch (error: any) { return { verdict: 'unchecked', reason: `cannot write the probe copy (${String(error?.code || error?.message || error)})` }; }
    return goal === 'script' ? nodeCheck(probe, timeoutMs, ['-e', SCRIPT_PARSE, probe]) : nodeCheck(probe, timeoutMs);
}

/** One file against its plan: null when every group passes. */
async function probeOne(tmp: string, index: number, projectDir: string, file: string, plan: GoalPlan, timeoutMs: number, known?: string): Promise<JsSyntaxFailure | null> {
    let text = known;
    if (text === undefined) {
        try { text = await fs.promises.readFile(path.resolve(projectDir, file), 'utf-8'); }
        catch (error: any) { return { file, error: `the check could not run: cannot read the file (${String(error?.code || error?.message || error)})`, kind: 'unchecked' }; }
    }
    const probeName = `${index}-${file.replace(/[^\w.-]/gu, '_')}`;
    for (const group of plan.groups) {
        const outcomes: Outcome[] = [];
        for (const goal of group) {
            const outcome = await runGoal(tmp, probeName, file, text, goal, timeoutMs);
            outcomes.push(outcome);
            if (outcome.verdict === 'passed') break;
        }
        if (outcomes.some(outcome => outcome.verdict === 'passed')) continue;
        const unchecked = outcomes.find((outcome): outcome is Extract<Outcome, { verdict: 'unchecked' }> => outcome.verdict === 'unchecked');
        if (unchecked) return { file, error: `the check could not run: ${unchecked.reason}`.slice(0, 400), kind: 'unchecked' };
        // Every goal rejected it: report the parse that read furthest (Node's
        // own retry reports the module parse once the script parse gave up).
        const rejections = outcomes as Array<Extract<Outcome, { verdict: 'rejected' }>>;
        const furthest = rejections.reduce((best, next) => (Number.parseInt(next.line, 10) || 0) > (Number.parseInt(best.line, 10) || 0) ? next : best);
        return { file: furthest.line ? `${file}:${furthest.line}` : file, error: furthest.said.slice(0, 300), kind: 'syntax' };
    }
    return null;
}

async function withProbeDir<T>(fn: (tmp: string) => Promise<T>): Promise<T> {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-syntax-'));
    try {
        return await fn(tmp);
    } finally {
        try { await fs.promises.rm(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

export interface PlannedFile { file: string; plan: GoalPlan | null; notParsed?: string }

/** Each file's plan: the pages that load it, else how Node runs it. */
/**
 * ⛔ THE PAGES DECIDE OVER THE WHOLE PROJECT, THEN THE NAMED FILES ARE READ
 * (round 21 review, Q4). The goals were computed over the named files alone,
 * so checking util.js by itself lost what made it a module: index.html loads
 * main.js as a module and main.js imports util.js — main.js was not in the
 * set, so util.js fell to Node's reading of `"type": "commonjs"` and its
 * `export` was «SyntaxError: Unexpected token 'export'», and self-fix went to
 * repair a working module. The module closure is followed through every
 * project source; only the plans of the named files are returned.
 */
export async function planParseGoals(projectDir: string, files: string[], tree?: { scripts: string[]; pages: string[] }): Promise<PlannedFile[]> {
    const walked = tree ?? await walkProject(projectDir);
    const sources = new Set([...walked.scripts, ...files]);
    const loaded = await pageGoals(projectDir, walked.pages, sources);
    const scopes = new Map<string, Promise<string | null>>();
    const planned: PlannedFile[] = [];
    for (const file of files) {
        const fromPages = loaded.get(file);
        if (fromPages && fromPages.size) {
            const stated = [...fromPages].filter((goal): goal is ParseGoal => !goal.startsWith('data:'));
            if (!stated.length) {
                const types = [...fromPages].map(goal => goal.slice('data:'.length)).join(', ');
                planned.push({ file, plan: null, notParsed: `a page loads it as <script type="${types}">, which no JavaScript engine runs as written` });
                continue;
            }
            planned.push({
                file,
                plan: { groups: stated.map(goal => [goal]), because: `a page loads it as ${stated.map(goal => GOAL_NAME[goal]).join(' and ')}` },
            });
            continue;
        }
        let text = '';
        try { text = await fs.promises.readFile(path.resolve(projectDir, file), 'utf-8'); } catch { /* reported when it is parsed */ }
        planned.push({ file, plan: nodeGoalPlan(file, text, await packageScopeType(path.resolve(projectDir, file), scopes)) });
    }
    return planned;
}

async function checkPlanned(projectDir: string, planned: PlannedFile[], timeoutMs: number): Promise<JsSyntaxResult> {
    const files = planned.filter(entry => entry.plan).map(entry => entry.file);
    const notParsed = planned.filter(entry => !entry.plan).map(entry => ({ file: entry.file, why: String(entry.notParsed || 'not JavaScript as written') }));
    const result = (failure: JsSyntaxFailure | null): JsSyntaxResult => ({ files, failure, ...(notParsed.length ? { notParsed } : {}) });
    if (!files.length) return result(null);
    return withProbeDir(async tmp => {
        let unchecked: JsSyntaxFailure | null = null;
        for (const [index, entry] of planned.entries()) {
            if (!entry.plan) continue;
            const failure = await probeOne(tmp, index, projectDir, entry.file, entry.plan, timeoutMs);
            if (failure?.kind === 'syntax') return result(failure);
            // A check that could not run is not a verdict: keep reading the
            // rest, so a real rejection elsewhere is still named.
            if (failure && !unchecked) unchecked = failure;
        }
        return result(unchecked);
    });
}

export async function checkJavaScriptSyntax(projectDir: string, timeoutMs = 15_000): Promise<JsSyntaxResult> {
    const tree = await walkProject(projectDir);
    if (!tree.scripts.length) return { files: [], failure: null };
    return checkPlanned(projectDir, await planParseGoals(projectDir, tree.scripts, tree), timeoutMs);
}

/** The named files (absolute, or relative to the project), each held to the goal it is really parsed with. */
export async function checkJavaScriptFiles(projectDir: string, files: string[], timeoutMs = 15_000): Promise<JsSyntaxResult & { planned: PlannedFile[] }> {
    const relative = Array.from(new Set(files.map(file => posix(path.relative(projectDir, path.resolve(projectDir, file))))));
    const planned = await planParseGoals(projectDir, relative);
    return { ...(await checkPlanned(projectDir, planned, timeoutMs)), planned };
}

/** How a plan reads in a log line. */
export function describeGoalPlan(plan: GoalPlan): string {
    return `${plan.groups.map(group => group.map(goal => GOAL_NAME[goal]).join(' or ')).join(', and ')} (${plan.because})`;
}

/**
 * ONE FILE, THE SAME TRUTH. A launcher about to start `server.js` asks how
 * NODE will run it — its extension, its package scope, Node's detection — and
 * gets the answer lint gives for a file no page loads; never plain
 * `node --check`, which passes broken ESM in a `.js` file (see the header).
 */
export async function checkJavaScriptFile(projectDir: string, file: string, timeoutMs = 15_000): Promise<JsSyntaxFailure | null> {
    const absolute = path.resolve(projectDir, file);
    let text: string;
    try { text = await fs.promises.readFile(absolute, 'utf-8'); }
    catch (error: any) { return { file, error: `the check could not run: cannot read the file (${String(error?.code || error?.message || error)})`, kind: 'unchecked' }; }
    const plan = nodeGoalPlan(file, text, await packageScopeType(absolute));
    return withProbeDir(tmp => probeOne(tmp, 0, projectDir, file, plan, timeoutMs, text));
}
