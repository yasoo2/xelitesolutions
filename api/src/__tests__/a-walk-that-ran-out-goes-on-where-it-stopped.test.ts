/**
 * ⛔ A WALK THAT RAN OUT OF TIME GOES ON FROM WHERE IT STOPPED — ON THE SAME CODE
 * (app-audit.ts codeFingerprint, keptWalks).
 *
 * The hard sample, 2026-11-09 (L382, a municipal complaints CRM: eight pages
 * behind a sign-in, 165 controls, on a machine busy rendering video): every
 * task_finish walked the product from its first page, ran out of time in the
 * same place and was refused as «qa_budget_exhausted». The last four refusals
 * measured code that had not changed by a byte — 44 minutes. Measured offline
 * on that product, the whole walk needs about seven minutes; the panel walk is
 * slower, and the first walk and its retry together never reached the end.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { auditBuiltApp, codeFingerprint, forgetKeptWalks } from '../core/quality/app-audit';

jest.setTimeout(900_000);

const PAGES = ['contacts', 'deals', 'tasks', 'notes', 'reports'];
//  A hash router: five pages, each with its own heading and three buttons that answer.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Office</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;font-size:16px;color:#111;background:#fff}h1{font-size:32px}nav a{display:inline-block;min-width:48px;min-height:48px;padding:12px;margin:4px;color:#0f3f6a}button{min-width:120px;min-height:48px;margin:8px;font-size:16px;color:#fff;background:#0f5f8a;border:0;border-radius:8px}</style></head><body>
<nav>${PAGES.map(p => `<a href="#/${p}">${p}</a>`).join('')}</nav>
<main id="view"></main>
<script>
  var pages = ${JSON.stringify(PAGES)};
  function show() {
    var name = (location.hash || '').replace(/^#\\//, '') || 'home';
    var main = document.getElementById('view');
    if (pages.indexOf(name) < 0) { main.innerHTML = '<h1>Office</h1><p>Choose a page.</p><button id="hello">Say hello</button><p id="out"></p>'; document.getElementById('hello').onclick = function () { document.getElementById('out').textContent = 'Hello'; }; return; }
    main.innerHTML = '<h1>' + name + '</h1>' + ['Add', 'Sort', 'Count'].map(function (b) { return '<button data-b="' + b + '">' + b + ' ' + name + '</button>'; }).join('') + '<p id="out"></p>';
    Array.prototype.forEach.call(main.querySelectorAll('button'), function (btn) { btn.onclick = function () { document.getElementById('out').textContent = btn.textContent + ' done at ' + Date.now(); }; });
  }
  window.addEventListener('hashchange', show);
  show();
</script></body></html>`;

function project(): { root: string; pub: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-walk-'));
    const pub = path.join(root, 'public');
    fs.mkdirSync(pub);
    fs.writeFileSync(path.join(pub, 'index.html'), PAGE);
    fs.writeFileSync(path.join(root, 'server.js'), '// the server would live here\n');
    return { root, pub };
}

beforeEach(() => forgetKeptWalks());

describe('the code a walk measured', () => {
    it('is the same while its files are, whatever its data and its logs do', () => {
        const { root, pub } = project();
        const first = codeFingerprint(root);
        expect(first).toMatch(/^[0-9a-f]{40}$/);
        fs.mkdirSync(path.join(root, 'data'));
        fs.writeFileSync(path.join(root, 'data', 'crm.sqlite'), 'rows the walk wrote');
        fs.writeFileSync(path.join(root, 'app.db-wal'), 'journal');
        fs.writeFileSync(path.join(root, 'server.log'), 'GET /');
        fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
        fs.writeFileSync(path.join(root, 'node_modules', 'x', 'index.js'), 'module.exports = 1');
        expect(codeFingerprint(root)).toBe(first);
        //  A file written again is a file that may have changed: the walk starts from the door.
        const later = new Date(Date.now() + 5_000);
        fs.utimesSync(path.join(pub, 'index.html'), later, later);
        expect(codeFingerprint(root)).not.toBe(first);
    });

    it('is not known for a folder too large to read cheaply, and nothing is carried over it', () => {
        const { root } = project();
        for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(root, `f${i}.js`), String(i));
        expect(codeFingerprint(root, 10)).toBe('');
    });
});

describe('a walk that runs out of time on a product too large for one walk', () => {
    it('goes on from where it stopped, and the walk that reaches the end says what a whole walk says', async () => {
        const { root, pub } = project();
        const whole = await auditBuiltApp(pub, { timeoutMs: 45_000 });
        expect(whole.skipped).toBeUndefined();
        expect(whole.findings.map(f => f.id)).not.toContain('qa_budget_exhausted');
        forgetKeptWalks();

        const walks: Array<{ exhausted: boolean; carried: number; pressed: number }> = [];
        let last = whole;
        //  20 s a walk: one page at one width, reloaded for each control, must fit
        //  in a walk to be finished at all (measured: about 10 s each here).
        for (let i = 0; i < 10; i++) {
            last = await auditBuiltApp(pub, { timeoutMs: 45_000, walkMs: 20_000, artifactRootDir: root });
            expect(last.skipped).toBeUndefined();
            const exhausted = last.findings.some(f => f.id === 'qa_budget_exhausted');
            walks.push({ exhausted, carried: last.carried || 0, pressed: last.pressed || 0 });
            if (!exhausted) break;
        }
        //  The first walk could not cover the product; every later walk carried what was finished.
        expect(walks[0].exhausted).toBe(true);
        expect(walks[0].carried).toBe(0);
        expect(walks.length).toBeGreaterThan(1);
        for (const w of walks.slice(1)) expect(w.carried).toBeGreaterThan(0);
        const end = walks[walks.length - 1];
        expect(end.exhausted).toBe(false);
        //  Carried parts are counted as walked ones: every page at every width,
        //  as a whole walk covers them (a whole walk itself presses ±1 control
        //  from one run to the next, as a pass's own time allows).
        const places = (a: typeof whole) => [...new Set(((a as any).controls || []).map((c: any) => String(c.context || '')))].sort();
        expect(places(last)).toEqual(places(whole));
        expect(Math.abs(end.pressed - (whole.pressed || 0))).toBeLessThanOrEqual(Math.ceil((whole.pressed || 0) * 0.1));
        expect([...(last.dead || [])].sort()).toEqual([...(whole.dead || [])].sort());

        //  A whole walk leaves nothing behind: the next walk starts from the door.
        const again = await auditBuiltApp(pub, { timeoutMs: 45_000, walkMs: 20_000, artifactRootDir: root });
        expect(again.carried).toBeUndefined();
    });

    it('starts again from the door when any file of the project changed', async () => {
        const { root, pub } = project();
        const first = await auditBuiltApp(pub, { timeoutMs: 45_000, walkMs: 20_000, artifactRootDir: root });
        expect(first.findings.map(f => f.id)).toContain('qa_budget_exhausted');
        const later = new Date(Date.now() + 5_000);
        fs.utimesSync(path.join(root, 'server.js'), later, later);
        const second = await auditBuiltApp(pub, { timeoutMs: 45_000, walkMs: 20_000, artifactRootDir: root });
        expect(second.carried).toBeUndefined();
    });
});
