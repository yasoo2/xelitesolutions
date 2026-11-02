/**
 * ⛔ A PROBE THAT RETURNS TO ITS BASELINE DISCOVERS ITS CONTROLS THERE.
 *
 * The 500-prompt exam, 2026-11-03, P051: a React admin with tabs kept its
 * view in memory. The phone pass began on the Treatments tab the desktop walk
 * had left open and listed «+ Add treatment» from it; isolating each control
 * reloaded the page onto the default tab, and the button was reported «gone
 * before I could press it». The builder was refused four times for a button
 * that works. Measured on that very app: old probe 97/100 with
 * controls_not_reached, this probe 100/100 with nothing to fix.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

//  Two tabs whose view lives in memory: a reload always opens «Summary».
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Clinic</title>
<style>button{min-width:120px;min-height:44px;margin:8px;font-size:16px}</style></head><body>
<nav><button id="tab-summary">Summary</button><button id="tab-treatments">Treatments</button></nav>
<main id="view"></main>
<script>
  var count = 0;
  function show(view) {
    var main = document.getElementById('view');
    if (view === 'summary') main.innerHTML = '<h1>Summary</h1><p>' + count + ' treatments</p>';
    else {
      main.innerHTML = '<h1>Treatments</h1><button id="add">+ Add treatment</button><ul id="list"></ul>';
      document.getElementById('add').onclick = function () { count++; var li = document.createElement('li'); li.textContent = 'Treatment ' + count; document.getElementById('list').appendChild(li); };
    }
  }
  document.getElementById('tab-summary').onclick = function () { show('summary'); };
  document.getElementById('tab-treatments').onclick = function () { show('treatments'); };
  show('summary');
</script></body></html>`;

describe('an isolating probe lists its controls from the state it returns to', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('begun on a tab a reload does not restore, it reports no control it cannot reach', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
            await page.goto(url, { waitUntil: 'load' });
            //  The previous walk left the Treatments tab open.
            await page.click('#tab-treatments');
            await page.waitForSelector('#add');
            const probe = await probeControls(page, {
                isolateBaselineControls: true, baselineViewport: { width: 390, height: 844 }, fillForms: false, budgetMs: 30_000,
            });
            const notFound = probe.controls.filter(c => c.kind !== 'anchor' && c.effect === 'not found').map(c => c.label);
            expect(notFound).toEqual([]);
            //  It was measured on the baseline the reload restores: the two tabs, both pressed.
            expect(probe.controls.map(c => c.label)).toEqual(expect.arrayContaining(['Summary', 'Treatments']));
            expect(probe.controls.find(c => c.label === 'Treatments')?.worked).toBe(true);
        } finally {
            await browser.close();
        }
    });
});
