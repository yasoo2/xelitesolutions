/**
 * THE BROWSER MENDS WHAT IT MEASURES — «اريده ان يصلح ui لاي نظام ولاي صفحة».
 *
 * Joe's self-QA reported «62/100 — small_targets, dead_links» for weeks and
 * repaired none of it. These are the fixers, and the two traps they had to
 * survive, both found by the live proof rather than by reasoning:
 *
 *   1. JSX ATTRIBUTES CONTAIN `>`. `onChange={e => setEmail(...)}` breaks any
 *      `[^>]*` tag matcher, and the first version spliced aria-label INTO the
 *      arrow function. esbuild refused every file; nothing was fixed at all.
 *   2. PROSE IS NOT MARKUP. A JSX comment in Joe's own scaffold mentions an h1
 *      opening tag; an element matcher started there and swallowed the real
 *      heading after it, demoting the wrong one.
 *
 * Live proof: src/tests/manual/verify_ui_fix.ts (22/22 — a real project, a
 * real browser, a real vite build, and a score that MOVED).
 */
import {
    repairHtmlShell, repairImagesAlt, repairInputLabels,
    repairDeadLinks, repairHeadings, repairTapTargets, repairProjectFiles,
} from '../core/quality/ui-repair';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

describe('the document shell', () => {
    it('gains language, direction, viewport and a title', () => {
        const r = repairHtmlShell('<html><head></head><body></body></html>', { isArabic: true, title: 'متجري' });
        expect(r.text).toMatch(/<html[^>]*lang="ar"/);
        expect(r.text).toMatch(/dir="rtl"/);
        expect(r.text).toMatch(/name="viewport"/);
        expect(r.text).toMatch(/<title>متجري<\/title>/);
    });

    it('and a healthy document is left completely alone', () => {
        const good = '<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="x" /><title>Fine</title></head><body></body></html>';
        expect(repairHtmlShell(good).text).toBe(good);
    });
});

describe('the JSX fixers survive real JSX', () => {
    // The exact shape that defeated the first version.
    const arrow = '<input type="email" value={email} onChange={e => setEmail(e.target.value)} required />';

    it('an arrow function in an attribute is never spliced into', () => {
        const r = repairInputLabels(`<label><span>البريد</span>${arrow}</label>`);
        expect(r.text).toContain('onChange={e => setEmail(e.target.value)}');
        expect(r.text).toMatch(/<input aria-label="البريد"/);
        expect(syntaxOk('a.jsx', `const A = () => (<div>${r.text}</div>);`).ok).toBe(true);
    });

    it('images get an alt — from context when the source offers one', () => {
        expect(repairImagesAlt('<img src={p.image} />').text).toContain("alt={p.name || ''}");
        // Nothing known: empty (decorative) is correct, an invented sentence is a lie.
        expect(repairImagesAlt('<img src="/x.png" />').text).toContain('alt=""');
        // …and an image that already has one is untouched.
        const has = '<img src="/x.png" alt="شعار" />';
        expect(repairImagesAlt(has).text).toBe(has);
    });

    it('dead links become real buttons, opening AND closing together', () => {
        const r = repairDeadLinks('<a href="#" className="btn">اضغط</a><a href="/real">حقيقي</a>');
        expect(r.text).toBe('<button type="button" className="btn">اضغط</button><a href="/real">حقيقي</a>');
    });

    it('only the first h1 stays, and prose in a comment is not an element', () => {
        const src = '{/* A real <h1>: the app name */}\n<h1 className="app-name">Joe</h1>\n<h1>ثانٍ</h1>';
        const r = repairHeadings(src);
        expect(r.text).toContain('<h1 className="app-name">Joe</h1>');
        expect(r.text).toContain('<h2>ثانٍ</h2>');
    });

    it('the tap-target rule lands once, however often it runs', () => {
        const once = repairTapTargets('body{}').text;
        expect(once).toMatch(/min-height:\s*44px/);
        expect(repairTapTargets(once).text).toBe(once);
    });
});

describe('a whole project, in one pass', () => {
    it('every changed file still parses', () => {
        const files = {
            'index.html': '<html><head></head><body></body></html>',
            'src/App.jsx': 'export default function App(){return (<div>'
                + '<img src="/a.png" />'
                + '<a href="#" onClickCapture={undefined}>x</a>'
                + '</div>);}',
            'src/styles/app.css': 'body{}',
        };
        const plan = repairProjectFiles(files, { isArabic: true });
        expect(Object.keys(plan.files).length).toBeGreaterThan(0);
        for (const [rel, text] of Object.entries(plan.files)) {
            const gate = syntaxOk(rel, text);
            expect(`${rel}: ${gate.ok ? 'ok' : gate.error}`).toBe(`${rel}: ok`);
        }
        expect(plan.repairs.map(r => r.id).sort()).toEqual(
            expect.arrayContaining(['dead_images', 'dead_links', 'html_lang', 'small_targets']));
    });

    it('and a clean project is not touched at all', () => {
        const clean = {
            'index.html': '<html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><meta name="viewport" content="x" /><title>ok</title></head><body></body></html>',
            'src/App.jsx': 'export default function App(){return (<img src="/a.png" alt="ok" />);}',
        };
        expect(Object.keys(repairProjectFiles(clean, { isArabic: true }).files)).toEqual([]);
    });
});

describe('the repair loop is wired end to end', () => {
    const read = (...p: string[]) => require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf-8');

    it('the tool measures before AND after, and never claims the delta', () => {
        const T = read('modules', 'tools', 'definitions', 'UiFixTool.ts');
        expect(T).toMatch(/const before = await auditBuiltApp/);
        expect(T).toMatch(/const after = await auditBuiltApp/);
        expect(T).toMatch(/delta = after\.score - before\.score/);
    });

    it('a repair that breaks the build is reverted whole', () => {
        // The cycle moved into core/quality/self-repair so the build path and
        // this tool cannot drift apart; the property is asserted where it lives
        // now, plus the tool still refusing to report success on a failed build.
        const T = read('modules', 'tools', 'definitions', 'UiFixTool.ts');
        expect(T).toMatch(/if \(!cycle\.built\)/);
        expect(T).toMatch(/error: 'build_failed_after_repair'/);
        const S = read('core', 'quality', 'self-repair.ts');
        expect(S).toMatch(/const gate = syntaxOk\(rel, text\)/);
        expect(S).toMatch(/reverted: true/);
    });

    it('and it is registered, so the planner can actually reach it', () => {
        const R = read('modules', 'tools', 'registry.ts');
        expect(R).toMatch(/new UiFixTool\(\)/);
    });
});
