/**
 * ⛔ A CONTROL AN EARLIER PRESS REMOVED IS SOUGHT ON THE BASELINE.
 *
 * The 500-prompt exam, 2026-11-03, P451: a support chatbot replaces its quick
 * replies as soon as one is used. The probe pressed «Hours», the chips «Prices»
 * and «Insurance» were gone, and three working buttons were reported «gone
 * before I could press them»; the builder was refused for eight minutes.
 * Measured on that app: 97 with controls_not_reached before, 100 (28 controls
 * pressed) after.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

//  Three quick replies; any one of them answers and replaces all three.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Clinic help</title>
<style>button{min-width:120px;min-height:44px;margin:8px;font-size:16px}</style></head><body>
<h1>Ask the clinic</h1><ul id="log"></ul><div id="quick"></div>
<script>
  var replies = { Hours: 'We open at 9.', Prices: 'A check-up is $40.', Insurance: 'We accept most plans.' };
  function chips(labels) {
    var q = document.getElementById('quick'); q.innerHTML = '';
    labels.forEach(function (l) {
      var b = document.createElement('button'); b.textContent = l;
      b.onclick = function () {
        var li = document.createElement('li'); li.textContent = replies[l] || 'Ask me anything.'; document.getElementById('log').appendChild(li);
        chips(['Talk to staff']);
      };
      q.appendChild(b);
    });
  }
  chips(['Hours', 'Prices', 'Insurance']);
</script></body></html>`;

describe('quick replies that vanish once one is used', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('each is pressed on the restored page, and none is reported unreachable', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 40_000 });
            const notFound = probe.controls.filter(c => c.kind !== 'anchor' && c.effect === 'not found').map(c => c.label);
            expect(notFound).toEqual([]);
            for (const label of ['Hours', 'Prices', 'Insurance']) {
                expect(probe.controls.find(c => c.label === label)?.worked).toBe(true);
            }
        } finally {
            await browser.close();
        }
    });
});
