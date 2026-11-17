/**
 * ⛔ PATH 3: ON THE OWNER'S LIVE APP THE WALK PRESSES NOTHING THAT SAVES (design v13.3 §5.1, §5.3).
 *
 * A change run of a server app whose data Joe cannot put back is walked without writing. The behaviour
 * probe is given the walk's guard (`ProbeOptions.noWrite`, live-data-guard.ts) and then:
 *   - a control or link whose words or address delete is not pressed and is listed «not tried» (W5);
 *   - no form is sent, its submit is not pressed, and the forms pass lists every form «not tried» (W6);
 *   - a press whose own request the guard stopped, and that changed nothing, is «not tried», never dead (W9b);
 *   - a button wired to nothing is still dead (W10).
 * Without the guard the same page is walked as it always was: its buttons write, its form is sent.
 *
 * And the fence's refusals are never charged: a console error a refused request caused is dropped (§4.3).
 *
 * A real browser on a real server that logs every request it is sent.
 */
import http from 'http';
import { chromium } from 'playwright';
import { auditBehaviour, judgeBehaviour, probeControls, NOT_TRIED_EFFECT } from '../core/quality/behaviour-audit';
import { createLiveDataGuard } from '../core/quality/live-data-guard';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Customers</title>
<style>button,a{display:inline-block;margin:6px;padding:8px 12px;min-width:60px;min-height:30px}</style></head><body>
<main>
  <h1>Customers</h1>
  <ul id="list"><li>Ann Lee</li><li>Omar Saleh</li></ul>
  <div id="details" hidden>Two customers, one city.</div>
  <p>
    <button type="button" id="show">Show details</button>
    <button type="button" id="archive">Archive</button>
    <button type="button" id="draft">Save draft</button>
    <button type="button" id="quiet">Refresh view</button>
  </p>
  <p><a href="#/customers/3/delete" id="c3">Customer 3</a></p>
  <form id="add" method="post" action="/api/customers">
    <h2>Add customer</h2>
    <label>Name <input name="name" required></label>
    <button type="submit">Add</button>
  </form>
</main>
<script>
  document.getElementById('show').onclick = () => { document.getElementById('details').hidden = !document.getElementById('details').hidden; };
  document.getElementById('archive').onclick = async () => {
    const r = await fetch('/api/customers/archive', { method: 'POST' }).catch(() => null);
    if (r && r.ok) document.getElementById('list').innerHTML = '';
  };
  //  Saves quietly: the page shows nothing new, the server keeps a draft.
  document.getElementById('draft').onclick = () => { fetch('/api/drafts', { method: 'POST', body: 'draft' }).catch(() => null); };
  window.addEventListener('hashchange', () => {
    if (/delete/.test(location.hash)) fetch('/api/customers/3', { method: 'DELETE' }).catch(() => null);
  });
</script></body></html>`;

const servers: http.Server[] = [];
afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

/** The live app, and every request it was sent. */
async function liveApp(page = PAGE): Promise<{ url: string; log: string[] }> {
    const log: string[] = [];
    const server = http.createServer((req, res) => {
        log.push(`${req.method} ${req.url}`);
        req.resume();
        req.on('end', () => {
            if (String(req.url).startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
            if (req.method !== 'GET') { res.writeHead(303, { location: '/' }); res.end(); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(page);
        });
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { url: `http://127.0.0.1:${(server.address() as any).port}/`, log };
}

const writes = (log: string[]) => log.filter(l => !/^(?:GET|HEAD|OPTIONS) /.test(l));

test('the no-write walk sends no write, presses no delete, sends no form, and keeps a dead button dead', async () => {
    const app = await liveApp();
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
        const guard = await createLiveDataGuard(context);
        const page = await context.newPage();
        await page.goto(app.url, { waitUntil: 'load' });
        const probe = await probeControls(page, { budgetMs: 40_000, noWrite: guard });
        await guard.remove();
        await context.close();

        //  Nothing the walk did reached the live app as a write.
        expect(writes(app.log)).toEqual([]);
        const effectOf = (label: string) => probe.controls.filter(c => c.label === label).map(c => c.effect);
        //  W5: «Archive» deletes in words — never pressed; the delete link is never followed.
        expect(effectOf('Archive')).toEqual([NOT_TRIED_EFFECT]);
        expect(guard.notTriedLabels).toEqual(expect.arrayContaining(['control: Archive', 'link: Customer 3']));
        //  W6: the form's own button is not pressed and the form is listed, never filled.
        expect(effectOf('Add').every(e => e === NOT_TRIED_EFFECT)).toBe(true);
        expect(guard.notTriedLabels.some(l => l.startsWith('form: '))).toBe(true);
        expect(probe.metrics.notMeasuredLive).toBeGreaterThanOrEqual(1);
        expect(probe.metrics.formsFilled ?? 0).toBe(0);
        //  W9b: «Save draft» was pressed, its save was stopped, nothing changed: not tried, never dead.
        expect(effectOf('Save draft')).toEqual([NOT_TRIED_EFFECT]);
        expect(guard.notTriedLabels).toContain('control: Save draft');
        //  W10: what reads still works, and a button wired to nothing is still charged.
        expect(probe.controls.some(c => c.label === 'Show details' && c.worked)).toBe(true);
        const judged = judgeBehaviour(probe.controls, probe.metrics);
        const deadText = judged.findings.filter(f => /dead_controls/.test(f.code)).map(f => f.en).join(' ');
        expect(deadText).toContain('Refresh view');
        expect(deadText).not.toContain('Save draft');
        expect(deadText).not.toContain('Archive');
    } finally {
        await browser.close();
    }
});

test('without the guard the same page is walked as it always was: its buttons and its form write', async () => {
    const app = await liveApp();
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(app.url, { waitUntil: 'load' });
        const probe = await probeControls(page, { budgetMs: 40_000 });
        expect(writes(app.log).length).toBeGreaterThan(0);
        expect(probe.controls.some(c => c.effect === NOT_TRIED_EFFECT)).toBe(false);
        expect(probe.metrics.notMeasuredLive).toBeUndefined();
        expect(probe.metrics.noWriteWalk).toBeUndefined();
    } finally {
        await browser.close();
    }
});

test('a console error the fence caused is not charged; without the fence it is', async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head><body><h1>Shop</h1>
<button type="button" onclick="this.textContent = 'Opened'">Open</button>
<script>console.error('report refused: 403 x-joe-fence refused');</script></body></html>`;
    const app = await liveApp(page);
    const fence = { drops: (text: string) => (/x-joe-fence/.test(text) ? 'refused-text' as const : '' as const), appRefusals: () => [] };
    const fenced = await auditBehaviour(app.url, { fence });
    expect(fenced.ran).toBe(true);
    expect(fenced.metrics.jsErrors).toBe(0);
    expect(fenced.findings.some(f => f.code === 'js_errors')).toBe(false);
    const today = await auditBehaviour(app.url);
    //  Once per load of the page (the walk reloads it to put its start back).
    expect(today.metrics.jsErrors).toBeGreaterThanOrEqual(1);
    expect(today.findings.some(f => f.code === 'js_errors')).toBe(true);
});
