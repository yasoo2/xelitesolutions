/**
 * THE QUALITY PHASE THAT OPENED A BROWSER FOR NOTHING.
 *
 * From his machine:
 *
 *     - ✅ Application (tasks: 1/1)
 *     - ❌ Quality   (tasks: 0/1)
 *     - Error: `no_url`
 *
 * …while `GET /project-preview/<his session>/index.html` answered 200 in the
 * same second. The address was being completed one layer ABOVE the tool, in
 * the planner's argument adapter, so the audit itself had no idea how to find
 * the app it was built to audit — and `no_url` names none of the three
 * different failures that produce it.
 *
 * The second half of the complaint is the browser that opens and does nothing:
 * `react_project` already audits every build in a real browser before it
 * delivers. The Quality phase then opened a second browser over the same page.
 */
import {
    adaptPlannedArgs,
    builtPreviewUrl,
    hasFreshBuilderAudit,
    whyNoBuiltUrl,
    FRESH_AUDIT_MS,
} from '../core/orchestrator/plan-tools';
import { firstJsonSpan, parseFirstJson } from '../shared/utils/json';
import fs from 'fs';
import os from 'os';
import path from 'path';

const G = () => ((global as any).joeProjects || ((global as any).joeProjects = {}));

function builtProject(sessionId: string, opts: { dist?: boolean; auditAgeMs?: number } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-qa-'));
    if (opts.dist !== false) {
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>x</title>', 'utf-8');
    }
    G()[sessionId] = {
        dir, type: 'react',
        ...(opts.auditAgeMs === undefined ? {} : {
            lastAudit: { score: 92, at: Date.now() - opts.auditAgeMs, findings: [{ severity: 'low', message: 'x' }] },
        }),
    };
    return dir;
}

describe('an audit with no address finds the app this session built', () => {
    it('fills the address from the session, not from nowhere', () => {
        const sid = `qa-${Date.now()}-a`;
        builtProject(sid);
        const args = adaptPlannedArgs('browser_ui_audit', { sessionId: sid });
        expect(String(args.url)).toMatch(new RegExp(`/project-preview/${sid}/index\\.html`));
    });

    it('and an explicit address always wins', () => {
        const sid = `qa-${Date.now()}-b`;
        builtProject(sid);
        const args = adaptPlannedArgs('browser_ui_audit', { sessionId: sid, url: 'https://example.com' });
        expect(args.url).toBe('https://example.com');
    });

    it('but leaves it empty when the builder just audited — no second browser', () => {
        const sid = `qa-${Date.now()}-c`;
        builtProject(sid, { auditAgeMs: 5_000 });
        expect(hasFreshBuilderAudit(sid)).toBe(true);
        expect(adaptPlannedArgs('browser_ui_audit', { sessionId: sid }).url).toBeUndefined();
    });

    it('and audits again once that measurement is stale', () => {
        const sid = `qa-${Date.now()}-d`;
        builtProject(sid, { auditAgeMs: FRESH_AUDIT_MS + 1_000 });
        expect(hasFreshBuilderAudit(sid)).toBe(false);
        expect(String(adaptPlannedArgs('browser_ui_audit', { sessionId: sid }).url)).toContain('/project-preview/');
    });

    it('a session that built nothing has no address to invent', () => {
        expect(builtPreviewUrl(`never-${Date.now()}`)).toBe('');
        expect(builtPreviewUrl('')).toBe('');
    });

    it('and a project whose build never finished has none either', () => {
        const sid = `qa-${Date.now()}-e`;
        builtProject(sid, { dist: false });
        expect(builtPreviewUrl(sid)).toBe('');
    });
});

describe('and when it cannot, it says which of the three it was', () => {
    it('no session', () => {
        expect(whyNoBuiltUrl('')).toMatch(/لا معرّف جلسة/);
    });

    it('no project for this session', () => {
        expect(whyNoBuiltUrl(`never-${Date.now()}`)).toMatch(/لا مشروع مبنيّ مسجّل/);
    });

    it('a project, but no finished build — and it names the directory', () => {
        const sid = `qa-${Date.now()}-f`;
        const dir = builtProject(sid, { dist: false });
        const why = whyNoBuiltUrl(sid);
        expect(why).toMatch(/dist\/index\.html/);
        expect(why).toContain(dir);
    });

    it('never just the word', () => {
        for (const m of [whyNoBuiltUrl(''), whyNoBuiltUrl('x'), whyNoBuiltUrl('')]) {
            expect(m.length).toBeGreaterThan(20);
            expect(m).not.toBe('no_url');
        }
    });

    it('and the tool itself resolves or explains, rather than answering «no_url»', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'BrowserSmartTools.ts'), 'utf-8');
        const at = src.indexOf('class BrowserUIAuditTool');
        const body = src.slice(at, at + 4000);
        expect(body).toMatch(/builtPreviewUrl/);
        expect(body).toMatch(/whyNoBuiltUrl/);
        expect(body).toMatch(/reused: true/);
    });

    it('and the builder carries its findings forward, not only a score', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toMatch(/lastAudit: \{[\s\S]{0,200}findings:/);
    });
});

describe('a model that adds a sentence after its JSON is still understood', () => {
    it('takes the FIRST balanced object, not everything up to the last brace', () => {
        // The exact shape that threw «Unexpected non-whitespace character after
        // JSON at position 166» on his machine, on every routed request.
        const reply = '{"complexity":"high","requiresTools":true}\n\nI chose this because {see above}.';
        expect(() => JSON.parse(reply.match(/\{[\s\S]*\}/)![0])).toThrow();   // the old extractor
        expect(parseFirstJson<any>(reply)).toEqual({ complexity: 'high', requiresTools: true });
    });

    it('reads through a ```json fence', () => {
        expect(parseFirstJson<any>('sure!\n```json\n{"a":1}\n```\nhope that helps')).toEqual({ a: 1 });
    });

    it('is not fooled by braces inside strings', () => {
        expect(firstJsonSpan('{"a":"}{"}')).toBe('{"a":"}{"}');
        expect(parseFirstJson<any>('{"a":"}{"}')).toEqual({ a: '}{' });
    });

    it('honours escapes', () => {
        expect(parseFirstJson<any>('{"a":"say \\"hi\\" }"}')).toEqual({ a: 'say "hi" }' });
    });

    it('handles arrays and nesting', () => {
        expect(parseFirstJson<any>('noise [1,{"b":[2,3]}] tail')).toEqual([1, { b: [2, 3] }]);
    });

    it('returns null instead of throwing on truncated or absent JSON', () => {
        expect(parseFirstJson('{"a":1')).toBeNull();
        expect(parseFirstJson('no json here')).toBeNull();
        expect(parseFirstJson('')).toBeNull();
    });

    it('and the router uses it where it used to crash', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');
        expect(src).toMatch(/import \{ parseFirstJson \}/);
        const analyse = src.slice(src.indexOf('export async function advancedAnalyzeTask'));
        expect(analyse.slice(0, 3000)).not.toMatch(/JSON\.parse\(jsonMatch\[0\]\)/);
    });
});
