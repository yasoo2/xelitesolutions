/**
 * ⛔ A ROUTE BUILT IN A LOOP OVER A TABLE IS THE ROUTES IT REGISTERS.
 *
 * The 500-prompt exam, 2026-11-04, P157: a real-estate system served its
 * properties, viewings and clients from one table —
 *
 *     const RESOURCES = { properties: {…}, clients: {…}, viewings: {…} };
 *     for (const [name, resource] of Object.entries(RESOURCES)) {
 *       const base = `/${name}`;
 *       router.get(base, …);
 *     }
 *
 * — and the route reader, which reads a path written as a string, saw no route
 * for any of them: the delivery was refused ten times as «not served».
 *
 * This reader resolves what the source itself says: the tables a file declares
 * (an object's keys, a list of names, a list of objects' string fields, in this
 * file or another of the server's), the loops over them (for…of / for…in /
 * forEach / map, on the table, its keys, entries or values, or a list written
 * in the loop), the names the loop body builds from the loop's variable
 * (templates, «'/' + name»), and the routes registered with them. A path built
 * from anything else — a call, the database — is left unread: never guessed.
 *
 * P158, the same day: `Object.keys(SCHEMAS).forEach(registerCollection)`, the
 * mount inside `function registerCollection(key)`. A helper the file declares
 * is read the same way — called by name from such a loop, or called with the
 * path itself («crud('/api/x', …)») — and a helper also called with what the
 * source does not say keeps its template an unread route.
 */

/** A table the source declares: its keys (an object's, or a list's names) and, per field, its rows' string values. */
export interface RouteTable {
    /** An object's keys, or a list's string items, in order. */
    keys: string[];
    /** For each key (object) or item (list of objects): its string fields. */
    rows: Array<{ key?: string; fields: Record<string, string> }>;
    kind: 'object' | 'list';
}

/** One route the loops register, at the receiver's index in the text; `complete` when every pass read it. */
export interface LoopRoute { receiver: string; method: string; path: string; at: number; complete: boolean }

const IDENT = '[A-Za-z_$][\\w$]*';
const ROUTE_METHODS = 'get|post|put|patch|delete|all|use|route';
/** A path segment a route can really have: never a space, a quote or a brace. */
const PATH_LIKE = /^\/[\w\-./:*]*$/u;

/** The index just past the bracket that closes the one at `open`, skipping strings and templates; -1 when it never closes. */
export function closeOf(text: string, open: number): number {
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'") {
            for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
            continue;
        }
        if (c === '`') {
            const end = templateEnd(text, i);
            if (end < 0) return -1;
            i = end - 1;
            continue;
        }
        if (pairs[c]) stack.push(pairs[c]);
        else if (c === ')' || c === ']' || c === '}') {
            if (stack.pop() !== c) return -1;
            if (!stack.length) return i + 1;
        }
    }
    return -1;
}

/** The index just past the template literal that starts at `start`. */
function templateEnd(text: string, start: number): number {
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === '`') return i + 1;
        if (text[i] === '$' && text[i + 1] === '{') {
            const end = closeOf(text, i + 1);
            if (end < 0) return -1;
            i = end - 1;
        }
    }
    return -1;
}

/** The top-level parts of a bracketed list or object («{a: 1, b: {…}}» → «a: 1», «b: {…}»). */
export function topLevelParts(inner: string): string[] {
    const parts: string[] = [];
    let from = 0;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (c === '"' || c === "'") { for (i++; i < inner.length && inner[i] !== c; i++) if (inner[i] === '\\') i++; continue; }
        if (c === '`') { const end = templateEnd(inner, i); if (end < 0) break; i = end - 1; continue; }
        if (c === '(' || c === '[' || c === '{') { const end = closeOf(inner, i); if (end < 0) break; i = end - 1; continue; }
        if (c === ',') { parts.push(inner.slice(from, i)); from = i + 1; }
    }
    parts.push(inner.slice(from));
    return parts.map(p => p.trim()).filter(Boolean);
}

const STRING = /^(['"])((?:(?!\1)[^\\]|\\.)*)\1$/u;
const stringOf = (expr: string): string | null => { const m = expr.trim().match(STRING); return m ? m[2] : null; };
const KEYED = new RegExp(`^(?:(['"])([^'"]+)\\1|(${IDENT}))\\s*:\\s*([\\s\\S]*)$`, 'u');

/** An object literal's own string fields («{ path: 'clients', label: 'Client', n: 2 }» → path, label). */
function stringFields(objectText: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const part of topLevelParts(objectText.slice(1, -1))) {
        const m = part.match(KEYED);
        if (!m) continue;
        const value = stringOf(m[4]);
        if (value !== null) fields[m[2] || m[3]] = value;
    }
    return fields;
}

/** The table a bracketed literal is, or null («{…}» → its keys; «[…]» → its names, or its objects' fields). */
export function tableOf(literal: string): RouteTable | null {
    const text = literal.trim();
    if (text.startsWith('{')) {
        const keys: string[] = [];
        const rows: RouteTable['rows'] = [];
        for (const part of topLevelParts(text.slice(1, -1))) {
            if (part.startsWith('...')) return null;
            const m = part.match(KEYED);
            const key = m ? (m[2] || m[3]) : new RegExp(`^${IDENT}$`, 'u').test(part) ? part : '';
            if (!key) continue;
            keys.push(key);
            const value = m ? m[4].trim() : '';
            const asString = stringOf(value);
            rows.push({ key, fields: value.startsWith('{') ? stringFields(value) : asString !== null ? { '': asString } : {} });
        }
        return keys.length ? { keys, rows, kind: 'object' } : null;
    }
    if (text.startsWith('[')) {
        const keys: string[] = [];
        const rows: RouteTable['rows'] = [];
        for (const part of topLevelParts(text.slice(1, -1))) {
            const name = stringOf(part);
            if (name !== null) { keys.push(name); rows.push({ fields: { '': name } }); continue; }
            if (part.startsWith('{')) { rows.push({ fields: stringFields(part) }); continue; }
            return null;
        }
        return rows.length ? { keys, rows, kind: 'list' } : null;
    }
    return null;
}

/** The tables a file declares by name («const RESOURCES = {…}», «export const NAMES = […]», «Object.freeze({…})»). */
export function routeTablesIn(text: string): Map<string, RouteTable> {
    const tables = new Map<string, RouteTable>();
    const declared = new RegExp(`(?:^|[;\\s])(?:export\\s+)?(?:const|let|var)\\s+(${IDENT})\\s*(?::[^=;]{1,120})?=\\s*(?:Object\\s*\\.\\s*freeze\\s*\\(\\s*)?([\\[{])`, 'gu');
    for (const m of text.matchAll(declared)) {
        const open = (m.index || 0) + m[0].length - 1;
        const close = closeOf(text, open);
        if (close < 0) continue;
        const table = tableOf(text.slice(open, close));
        if (table) tables.set(m[1], table);
    }
    return tables;
}

/** What one pass of a loop binds: «name» → 'clients', «r.path» → 'clients'. */
type Binding = Record<string, string>;

/** The bindings of each pass, for a loop variable pattern over the elements of a source. */
function passes(pattern: string, elements: Array<{ value?: string; fields: Record<string, string>; key?: string }>, entries: boolean): Binding[] {
    const p = pattern.trim();
    return elements.map(element => {
        const bound: Binding = {};
        const bindObject = (name: string, fields: Record<string, string>) => {
            for (const [field, value] of Object.entries(fields)) if (field) bound[`${name}.${field}`] = value;
            if (fields['']) bound[name] = fields[''];
        };
        if (entries) {
            //  [key, value] of Object.entries(table)
            const m = p.match(new RegExp(`^\\[\\s*(${IDENT})?\\s*(?:,\\s*(${IDENT}))?\\s*\\]$`, 'u'));
            if (m?.[1] && element.key) bound[m[1]] = element.key;
            if (m?.[2]) bindObject(m[2], element.fields);
            return bound;
        }
        if (p.startsWith('{')) {
            //  { name, path: route } of a list of objects
            for (const part of topLevelParts(p.slice(1, -1))) {
                const m = part.match(new RegExp(`^(${IDENT})\\s*(?::\\s*(${IDENT}))?(?:\\s*=.*)?$`, 'u'));
                if (m && element.fields[m[1]] !== undefined) bound[m[2] || m[1]] = element.fields[m[1]];
            }
            return bound;
        }
        if (new RegExp(`^${IDENT}$`, 'u').test(p)) {
            if (element.value !== undefined) bound[p] = element.value;
            bindObject(p, element.fields);
        }
        return bound;
    });
}

/** The elements a loop source yields: «Object.keys(T)», «Object.entries(T)», «Object.values(T)», «T», or a list in place. */
function elementsOf(source: string, lookup: (name: string) => RouteTable | undefined): { elements: Array<{ value?: string; fields: Record<string, string>; key?: string }>; entries: boolean } | null {
    const s = source.trim();
    const over = s.match(new RegExp(`^Object\\s*\\.\\s*(keys|entries|values)\\s*\\(\\s*(${IDENT})\\s*\\)$`, 'u'));
    const table = over ? lookup(over[2]) : s.startsWith('[') ? tableOf(s) : new RegExp(`^${IDENT}$`, 'u').test(s) ? lookup(s) : undefined;
    if (!table) return null;
    if (over?.[1] === 'keys') return table.kind === 'object' ? { elements: table.keys.map(value => ({ value, fields: {} })), entries: false } : null;
    if (over?.[1] === 'entries') return table.kind === 'object' ? { elements: table.rows.map(row => ({ key: row.key, fields: row.fields })), entries: true } : null;
    if (over?.[1] === 'values') return table.kind === 'object' ? { elements: table.rows.map(row => ({ value: row.fields[''], fields: row.fields })), entries: false } : null;
    return table.kind === 'list' ? { elements: table.rows.map(row => ({ value: row.fields[''], fields: row.fields })), entries: false } : null;
}

/** The value of a path expression in one pass, or null when any part is not the source's own words. */
export function resolvePath(expr: string, bound: Binding): string | null {
    const e = expr.trim();
    if (!e) return null;
    const pieces = topLevelPlus(e);
    if (pieces.length > 1) {
        const parts = pieces.map(piece => resolvePath(piece, bound));
        return parts.every(part => part !== null) ? parts.join('') : null;
    }
    const literal = stringOf(e);
    if (literal !== null) return literal;
    if (e.startsWith('`') && e.endsWith('`')) {
        let out = '';
        const inner = e.slice(1, -1);
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === '$' && inner[i + 1] === '{') {
                const end = closeOf(inner, i + 1);
                if (end < 0) return null;
                const value = bound[inner.slice(i + 2, end - 1).trim()];
                if (value === undefined) return null;
                out += value;
                i = end - 1;
            } else out += inner[i];
        }
        return out;
    }
    return bound[e] !== undefined ? bound[e] : null;
}

/** «'/' + name + '/:id'» → its three pieces (a «+» inside a string or a call is not one). */
function topLevelPlus(expr: string): string[] {
    const pieces: string[] = [];
    let from = 0;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === '"' || c === "'") { for (i++; i < expr.length && expr[i] !== c; i++) if (expr[i] === '\\') i++; continue; }
        if (c === '`') { const end = templateEnd(expr, i); if (end < 0) return [expr]; i = end - 1; continue; }
        if (c === '(' || c === '[' || c === '{') { const end = closeOf(expr, i); if (end < 0) return [expr]; i = end - 1; continue; }
        if (c === '+') { pieces.push(expr.slice(from, i)); from = i + 1; }
    }
    pieces.push(expr.slice(from));
    return pieces.map(p => p.trim());
}

/** One loop, or one helper, and its passes: the body, where it starts, and what each pass binds. */
interface Loop {
    body: string;
    at: number;
    passes: Binding[];
    /** References to a helper that are no pass the reader can say (a call with a path the source does not write). */
    unread: number;
}

/** A function the file declares by name: its parameters, its body, and where its name is declared. */
interface Declared { params: string[]; body: string; at: number; nameAt: number }

function functionsIn(text: string): Map<string, Declared> {
    const found = new Map<string, Declared>();
    const head = new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(|(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:async\\s+)?(?:function\\b\\s*(?:${IDENT})?\\s*)?\\(`, 'gu');
    for (const m of text.matchAll(head)) {
        const name = m[1] || m[2];
        const open = (m.index || 0) + m[0].length - 1;
        const close = closeOf(text, open);
        if (close < 0 || found.has(name)) continue;
        const start = close + (text.slice(close).match(/^\s*(?:=>\s*)?/u)?.[0].length || 0);
        //  «const total = (a + b) * 2» is no function; an expression body registers nothing.
        if (text[start] !== '{') continue;
        const end = closeOf(text, start);
        if (end < 0) continue;
        const params = topLevelParts(text.slice(open + 1, close - 1)).map(p => p.replace(/\s*=[\s\S]*$/u, '').trim());
        found.set(name, { params, body: text.slice(start, end), at: start, nameAt: (m.index || 0) + m[0].indexOf(name) });
    }
    return found;
}

/**
 * A helper called by name, as its passes: «Object.keys(T).forEach(register)»
 * binds its first parameter to each element; «crud('/api/x', 'x')» binds each
 * parameter given a string. Any other reference — a call with what the source
 * does not say, the helper passed elsewhere — is counted unread.
 */
function helperPasses(text: string, name: string, fn: Declared, lookup: (name: string) => RouteTable | undefined): { passes: Binding[]; unread: number } {
    const out: Binding[] = [];
    let unread = 0;
    for (const m of text.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/gu, '\\$')}(?![\\w$])`, 'gu'))) {
        const at = m.index || 0;
        if (at === fn.nameAt) continue;
        const after = text.slice(at + name.length);
        const before = text.slice(Math.max(0, at - 40), at);
        const each = before.match(/\.\s*(?:forEach|map)\s*\(\s*$/u);
        if (each && /^\s*\)/u.test(after)) {
            const source = sourceBefore(text, at - each[0].length);
            const found = source ? elementsOf(source, lookup) : null;
            if (found && fn.params[0]) out.push(...passes(fn.params[0], found.elements, found.entries));
            else unread++;
            continue;
        }
        const call = after.match(/^\s*\(/u);
        if (call) {
            const open = at + name.length + call[0].length - 1;
            const close = closeOf(text, open);
            const args = close < 0 ? [] : topLevelParts(text.slice(open + 1, close - 1));
            const bound: Binding = {};
            fn.params.forEach((param, i) => {
                const value = args[i] === undefined ? null : stringOf(args[i]);
                if (value !== null && new RegExp(`^${IDENT}$`, 'u').test(param)) bound[param] = value;
            });
            if (Object.keys(bound).length) out.push(bound);
            else unread++;
            continue;
        }
        unread++;
    }
    return { passes: out, unread };
}

/** The loops in a file over a table it can read, and the helpers it calls by name, each with its body and passes. */
function loopsIn(text: string, lookup: (name: string) => RouteTable | undefined): Loop[] {
    const loops: Loop[] = [];
    const functions = functionsIn(text);
    const binding = `(\\[[^\\]]*\\]|\\{[^}]*\\}|${IDENT})`;
    //  for (const X of SOURCE) / for (const X in TABLE)
    const forHead = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${binding}\\s+(of|in)\\s+`, 'gu');
    for (const m of text.matchAll(forHead)) {
        const headClose = closeOf(text, (m.index || 0) + m[0].indexOf('('));
        if (headClose < 0) continue;
        const source = text.slice((m.index || 0) + m[0].length, headClose - 1);
        let found: ReturnType<typeof elementsOf>;
        if (m[2] === 'in') {
            const table = new RegExp(`^${IDENT}$`, 'u').test(source.trim()) ? lookup(source.trim()) : undefined;
            found = table?.kind === 'object' ? { elements: table.keys.map(value => ({ value, fields: {} })), entries: false } : null;
        } else found = elementsOf(source, lookup);
        if (!found) continue;
        const bodyStart = headClose + (text.slice(headClose).match(/^\s*/u)?.[0].length || 0);
        const bodyEnd = text[bodyStart] === '{' ? closeOf(text, bodyStart) : statementEnd(text, bodyStart);
        if (bodyEnd < 0) continue;
        loops.push({ body: text.slice(bodyStart, bodyEnd), at: bodyStart, passes: passes(m[1], found.elements, found.entries), unread: 0 });
    }
    //  SOURCE.forEach((X) => …) / SOURCE.map(function (X) {…})
    const each = new RegExp(`\\.\\s*(?:forEach|map)\\s*\\(\\s*(?:async\\s*)?(?:function\\s*${IDENT}?\\s*)?\\(?\\s*${binding}`, 'gu');
    for (const m of text.matchAll(each)) {
        const dot = m.index || 0;
        //  «.forEach(register)» names a helper: read below, with the helper's body.
        if (functions.has(m[1]) && /^\s*\)/u.test(text.slice(dot + m[0].length))) continue;
        const source = sourceBefore(text, dot);
        if (!source) continue;
        const found = elementsOf(source, lookup);
        if (!found) continue;
        const open = text.indexOf('(', dot);
        const close = closeOf(text, open);
        if (close < 0) continue;
        loops.push({ body: text.slice(open, close), at: open, passes: passes(m[1], found.elements, found.entries), unread: 0 });
    }
    for (const [name, fn] of functions) {
        const helper = helperPasses(text, name, fn, lookup);
        if (helper.passes.length) loops.push({ body: fn.body, at: fn.at, passes: helper.passes, unread: helper.unread });
    }
    return loops;
}

/** The expression a «.forEach» is called on: «Object.keys(T)», «T», or «[…]». */
function sourceBefore(text: string, dot: number): string {
    let end = dot;
    while (end > 0 && /\s/u.test(text[end - 1])) end--;
    const last = text[end - 1];
    if (last === ']') {
        const open = matchingOpen(text, end - 1, '[', ']');
        return open < 0 ? '' : text.slice(open, end);
    }
    if (last === ')') {
        const open = matchingOpen(text, end - 1, '(', ')');
        if (open < 0) return '';
        const head = text.slice(0, open).match(new RegExp(`Object\\s*\\.\\s*(?:keys|entries|values)\\s*$`, 'u'));
        return head ? text.slice(open - head[0].length, end) : '';
    }
    const name = text.slice(0, end).match(new RegExp(`(?<![\\w$.])(${IDENT})$`, 'u'));
    return name ? name[1] : '';
}

/** The opening bracket of the one that closes at `close` (a simple backward count: a list or a call written plainly). */
function matchingOpen(text: string, close: number, open: string, shut: string): number {
    let depth = 0;
    for (let i = close; i >= 0; i--) {
        if (text[i] === shut) depth++;
        else if (text[i] === open && --depth === 0) return i;
    }
    return -1;
}

/** The end of one statement without braces («for (…) router.get(…);»). */
function statementEnd(text: string, from: number): number {
    for (let i = from; i < text.length; i++) {
        const c = text[i];
        if (c === '(' || c === '[' || c === '{') { const end = closeOf(text, i); if (end < 0) return -1; i = end - 1; continue; }
        if (c === '"' || c === "'" || c === '`') { const end = c === '`' ? templateEnd(text, i) : closeQuote(text, i); if (end < 0) return -1; i = end - 1; continue; }
        if (c === ';' || c === '\n' || c === '}') return i;
    }
    return text.length;
}

function closeQuote(text: string, start: number): number {
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === text[start]) return i + 1;
    }
    return -1;
}

/**
 * The routes a file registers in loops over the tables it can read, and in
 * the helpers it calls by name. `lookup` names a table this file declares,
 * else one another file of the server does. A registration whose path is not
 * the source's own words is left out; one read in every pass of a loop that
 * has no unread reference is `complete` — its template is no second route.
 */
export function loopRoutes(text: string, lookup: (name: string) => RouteTable | undefined): LoopRoute[] {
    const out: LoopRoute[] = [];
    const seen = new Set<string>();
    const call = new RegExp(`(${IDENT})\\s*\\.\\s*(${ROUTE_METHODS})\\s*\\(`, 'gu');
    const derived = new RegExp(`(?:const|let|var)\\s+(${IDENT})\\s*=\\s*([^;\\n]+)`, 'gu');
    for (const loop of loopsIn(text, lookup)) {
        const first = out.length;
        const readIn = new Map<number, number>();
        for (const pass of loop.passes) {
            if (!Object.keys(pass).length) continue;
            const bound: Binding = { ...pass };
            for (const m of loop.body.matchAll(derived)) {
                const value = resolvePath(m[2], bound);
                if (value !== null) bound[m[1]] = value;
            }
            for (const m of loop.body.matchAll(call)) {
                const open = (m.index || 0) + m[0].length - 1;
                const close = closeOf(loop.body, open);
                if (close < 0) continue;
                const first = topLevelParts(loop.body.slice(open + 1, close - 1))[0] || '';
                //  A path written as a string is the plain reader's; this one reads the loop's.
                if (stringOf(first) !== null) continue;
                const value = resolvePath(first, bound);
                if (value === null) continue;
                const pathValue = value.replace(/\/{2,}/gu, '/');
                if (!PATH_LIKE.test(pathValue)) continue;
                const at = loop.at + (m.index || 0);
                const key = `${at}|${pathValue}|${m[2]}`;
                if (seen.has(key)) continue;
                seen.add(key);
                readIn.set(at, (readIn.get(at) || 0) + 1);
                out.push({ receiver: m[1], method: m[2].toLowerCase(), path: pathValue, at, complete: false });
            }
        }
        const everyPass = loop.passes.filter(pass => Object.keys(pass).length).length;
        for (const route of out.slice(first)) route.complete = loop.unread === 0 && readIn.get(route.at) === everyPass;
    }
    return out;
}
