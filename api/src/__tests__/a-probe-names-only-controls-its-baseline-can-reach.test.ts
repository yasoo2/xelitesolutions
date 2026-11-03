/**
 * ⛔ THE PHONE PASS STARTS FROM THE HOME PAGE, FRESHLY LOADED.
 *
 * The 500-prompt exam, 2026-11-03, P051: a React admin with tabs kept its
 * view in memory. The phone pass began on the Treatments tab the desktop walk
 * had left open and listed «+ Add treatment»; isolating each control reloaded
 * the page onto the default tab, and the button was reported «gone before I
 * could press it». The builder was refused four times for a button that
 * works. Measured on that app: 97/100 with controls_not_reached before, 100
 * after.
 *
 * The first repair reloaded inside every isolating probe. It cost a reload in
 * each of the eight per-route tablet and phone passes, which already start
 * freshly loaded, and the second P051 build (four hash routes) went from
 * 100/100 to qa_budget_exhausted. So the phone pass, the one caller that did
 * not start fresh, loads the home page itself, and nothing else pays for it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { auditBuiltApp } from '../core/quality/app-audit';

jest.setTimeout(240_000);

//  Tabs whose view lives in memory: a reload always opens «Summary». «Quick
//  add» exists only on the Treatments tab and only at a phone's width, so the
//  desktop walk never sees it — as P051's «+ Add treatment» was reported only
//  by the phone pass.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clinic</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;font-size:16px;color:#111;background:#fff}h1{font-size:32px}button{min-width:120px;min-height:48px;margin:8px;font-size:16px;color:#fff;background:#0f5f8a;border:0;border-radius:8px}.phone-only{display:none}@media (max-width:600px){.phone-only{display:inline-block}}</style></head><body>
<nav><button id="tab-summary">Summary</button><button id="tab-treatments">Treatments</button></nav>
<main id="view"></main>
<script>
  var count = 0;
  function show(view) {
    var main = document.getElementById('view');
    if (view === 'summary') main.innerHTML = '<h1>Summary</h1><p>' + count + ' treatments recorded</p>';
    else {
      main.innerHTML = '<h1>Treatments</h1><button id="add">+ Add treatment</button><button id="quick" class="phone-only">Quick add</button><ul id="list"></ul>';
      document.getElementById('quick').onclick = function () { document.getElementById('add').click(); };
      document.getElementById('add').onclick = function () { count++; var li = document.createElement('li'); li.textContent = 'Treatment ' + count; document.getElementById('list').appendChild(li); };
    }
  }
  document.getElementById('tab-summary').onclick = function () { show('summary'); };
  document.getElementById('tab-treatments').onclick = function () { show('treatments'); };
  show('summary');
</script></body></html>`;

describe('a control that lives on a tab the reload does not restore', () => {
    it('is never reported unreachable: the phone pass lists from the freshly loaded home page', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tabs-'));
        fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
        const audit = await auditBuiltApp(dir, { timeoutMs: 45_000, request: 'A clinic admin with a summary tab and a treatments tab where staff add treatments' });
        expect(audit.skipped).toBeUndefined();
        expect(audit.findings.map(f => f.id)).not.toContain('controls_not_reached');
        expect(audit.findings.map(f => f.id)).not.toContain('qa_budget_exhausted');
    });
});
