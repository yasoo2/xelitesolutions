import fs from 'fs';
import path from 'path';
import { judgeAcceptance } from '../core/quality/acceptance';

/**
 * Eval P151, 2026-10-23: «… user login with roles (admin and staff) …» crashed
 * the acceptance judge with «Invalid regular expression: /label:\s*'roles
 * (admin'/: Unterminated group». A hand-written escape class closed early at
 * `[\\]` and escaped nothing. Any request with ( [ { * + ? could do the same.
 *
 * So every `.replace(/<class>/, '\\$&')` in the source is EXECUTED here on a
 * probe holding every metacharacter, and must yield a pattern that compiles and
 * matches the probe literally.
 */
const PROBE = String.raw`roles (admin) [x] {y} a.b*c+d?e^f$g|h\i/j-k`;
const BACKSLASH = String.fromCharCode(92);
const REPLACE_TAIL = new RegExp('^\\s*,\\s*([\'"`])' + BACKSLASH.repeat(4) + '\\$&\\1\\s*\\)');
// Escapers that deliberately are not regex escapers, with the reason.
const NOT_REGEX_ESCAPERS: Record<string, string> = {
    'core/orchestrator/answerComposer.ts:metadataDisplay': 'escapes Markdown for display, never compiled',
    'tests/routeMap.ts:routeRegex': 'leaves * for the wildcard rewrite on the next line',
};

function readRegexLiteral(text: string, i: number) {
    let inClass = false;
    for (let j = i + 1; j < text.length; j++) {
        const ch = text[j];
        if (ch === '\n') return null;
        if (ch === BACKSLASH) { j++; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
            const flags = /^[gimsuy]*/.exec(text.slice(j + 1))![0];
            return { body: text.slice(i + 1, j), flags, end: j + 1 + flags.length };
        }
    }
    return null;
}

function escapers(root: string) {
    const found: Array<{ where: string; owner: string; body: string; flags: string }> = [];
    const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === '__tests__') continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\.(ts|tsx)$/.test(e.name)) {
                const text = fs.readFileSync(full, 'utf8');
                const rel = path.relative(root, full).replace(/\\/g, '/');
                for (const start of text.matchAll(/\.replace\(\s*\//g)) {
                    const lit = readRegexLiteral(text, start.index! + start[0].length - 1);
                    if (!lit || !REPLACE_TAIL.test(text.slice(lit.end))) continue;
                    const before = text.slice(0, start.index!);
                    // The nearest declaration in the few lines above names the escaper.
                    const near = before.split('\n').slice(-4).join('\n');
                    const owner = [...near.matchAll(/(?:const|function|let)\s+([A-Za-z_$][\w$]*)/g)].pop()?.[1] || '?';
                    found.push({ where: `${rel}:${before.split('\n').length}`, owner: `${rel}:${owner}`, ...lit });
                }
            }
        }
    };
    walk(root);
    return found;
}

describe('every regex escape escapes', () => {
    const all = escapers(path.join(__dirname, '..'));

    it('finds the escapers it is meant to guard', () => {
        expect(all.length).toBeGreaterThan(10);
    });

    it('each one compiles the probe back to a literal match', () => {
        const broken = all.filter(e => !NOT_REGEX_ESCAPERS[e.owner]).filter(e => {
            try {
                const escaped = PROBE.replace(new RegExp(e.body, e.flags), '\\$&');
                return !new RegExp('^' + escaped + '$').test(PROBE);
            } catch { return true; }
        }).map(e => `${e.where} /${e.body}/${e.flags}`);
        expect(broken).toEqual([]);
    });

    it('the acceptance judge reads a column named with parentheses instead of crashing', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'joe-accept-'));
        try {
            fs.writeFileSync(path.join(dir, 'schema.js'), "export const fields = [{ key: 'roles', label: 'roles (admin' }];\n");
            const criteria = [{ id: 'c1', text: 'roles (admin and staff)', expectedColumn: 'roles (admin' }] as any;
            const verdict = judgeAcceptance(criteria, { dir } as any, false);
            expect(JSON.stringify(verdict)).toContain('is in the table schema');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});
