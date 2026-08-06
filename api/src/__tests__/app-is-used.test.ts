/**
 * THE BUILD IS USED BEFORE IT IS DELIVERED.
 *
 * For months the React self-QA loaded one page and pressed nothing, while the
 * older single-file builder clicked every control on its output. A build could
 * ship with a dead «أضف إلى السلة» and a second page that never opens, and the
 * report would say 100/100 — accurate about the wrong question.
 *
 * These gates hold the fix in place, including the two mistakes it cost:
 * evaluated helpers arrive in the page compiled, and without the `__name` shim
 * every probe throws and the audit silently presses NOTHING while reporting
 * that it ran; and Chrome's invented /favicon.ico request was charging a clean
 * build 15 points for a console error nobody wrote.
 */
import fs from 'fs';
import path from 'path';
import { repairKeyboardControls, repairProjectFiles } from '../core/quality/ui-repair';
import { formatAudit } from '../core/quality/app-audit';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('one definition of a dead control', () => {
    it('the React audit borrows the probe instead of growing its own', () => {
        const A = read('core', 'quality', 'app-audit.ts');
        expect(A).toMatch(/import \{ probeControls, judgeBehaviour \} from '\.\/behaviour-audit'/);
        expect(A).toMatch(/await probeControls\(page\)/);
        expect(A).toMatch(/judgeBehaviour\(allControls, behaviourMetrics/);
    });

    it('and the HTML builder still reaches it by the same road', () => {
        const B = read('core', 'quality', 'behaviour-audit.ts');
        expect(B).toMatch(/export async function probeControls/);
        expect(B).toMatch(/export function judgeBehaviour/);
        expect(B).toMatch(/const probe = await probeControls\(page\)/);
    });

    it('the probe shims __name — without it every evaluate throws in the page', () => {
        expect(read('core', 'quality', 'behaviour-audit.ts'))
            .toMatch(/globalThis\.__name = globalThis\.__name \|\|/);
    });
});

describe('every page, not just the home page', () => {
    const A = () => read('core', 'quality', 'app-audit.ts');

    it('routes are discovered from the built page itself', () => {
        expect(A()).toMatch(/\^#\\\/\.\+/);              // hash router links
        expect(A()).toMatch(/\\w-\]\+\\\.html/);          // multi-file links
    });

    it('a route that will not open is a finding, and it names the route', () => {
        expect(A()).toMatch(/id: 'broken_routes'/);
        expect(A()).toMatch(/brokenRoutes\.push/);
    });

    it('and the audit reports what it actually did', () => {
        expect(A()).toMatch(/routes: \['\/', \.\.\.routes\]/);
        expect(A()).toMatch(/pressed: behaviourMetrics\.pressed/);
    });
});

describe('a browser-invented request is not the build\'s fault', () => {
    it('favicon misses are excluded from console errors and failed requests', () => {
        const A = read('core', 'quality', 'app-audit.ts');
        expect((A.match(/favicon\\\.ico/g) || []).length).toBeGreaterThanOrEqual(2);
    });
});

describe('the message stops claiming what was never checked', () => {
    it('says how many pages were opened and how many controls were pressed', () => {
        const clean = formatAudit({ score: 100, findings: [], routes: ['/', '#/about'], pressed: 7 }, true);
        expect(clean).toContain('2 صفحة');
        expect(clean).toContain('7 زر مضغوط');
        const bad = formatAudit({
            score: 70, findings: [{ id: 'dead_controls', severity: 'high', detail: 'زر ميت' }],
            routes: ['/'], pressed: 3,
        }, true);
        expect(bad).toContain('3 زر مضغوط');
        expect(bad).toContain('زر ميت');
    });
});

describe('a control only a mouse can reach is repaired, not just reported', () => {
    const jsx = `export default function C({ open }) {
  return (<div className="card" onClick={open}>
    <span onClick={open} role="link">تفاصيل</span>
    <button onClick={open}>حقيقي</button>
    <div className="plain">نص</div>
  </div>);
}`;

    it('adds role, tab order and an Enter/Space handler', () => {
        const out = repairKeyboardControls(jsx);
        expect(out.text).toMatch(/<div role="button" tabIndex=\{0\}/);
        expect((out.text.match(/tabIndex=\{0\}/g) || []).length).toBe(2);
        expect(out.text).toMatch(/e\.key === 'Enter' \|\| e\.key === ' '/);
        expect(out.repairs[0]).toMatchObject({ id: 'keyboard_unreachable', count: 2 });
    });

    it('never overwrites a role the author already chose', () => {
        const out = repairKeyboardControls(jsx).text;
        expect(out).toMatch(/role="link"/);
        expect(out).not.toMatch(/role="button"[^>]*role="link"/);
    });

    it('leaves real buttons and non-clickable elements alone', () => {
        const out = repairKeyboardControls(jsx).text;
        expect(out).toMatch(/<button onClick=\{open\}>/);
        expect(out).toMatch(/<div className="plain">/);
    });

    it('is idempotent and reachable through the project entry point', () => {
        const once = repairKeyboardControls(jsx).text;
        expect(repairKeyboardControls(once).text).toBe(once);
        expect(repairProjectFiles({ 'src/C.jsx': jsx }).files['src/C.jsx']).toMatch(/tabIndex=\{0\}/);
    });
});
