/**
 * ⛔ A SEARCH BUTTON IS PRESSED WITH WORDS IN ITS BOX, A CLEAR BUTTON WITH SOMETHING TO CLEAR.
 *
 * The 500-prompt exam, 2026-11-05, P069: «Build an admin dashboard for a auto
 * repair garage to manage vehicles, repair jobs, spare parts: add, edit,
 * delete and search each one …». Every list had a search box, «Search» and
 * «Clear», and both worked. Pressed on the page as it loads — an empty box —
 * «Search» lists the same rows and «Clear» clears nothing, so «Unresponsive
 * controls: "#/vehicles Search", "#/vehicles Clear", "#/jobs Search"»
 * refused the garage five times in 28 minutes.
 *
 * A person types before pressing Search, and clears what they searched. The
 * probe now does the same for a quiet control named for searching or
 * clearing that sits beside a text box (core/quality/behaviour-audit.ts).
 * A button wired to nothing still changes nothing, and is still reported.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { responsivePassBudget } from '../core/quality/app-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

/** P069's list, as delivered: the search reads the box when «Search» is pressed or Enter typed; «Clear» empties it. */
const PAGE = (dead: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Garage</title>
<style>body{font-family:sans-serif;margin:16px}button,input{min-height:44px;min-width:44px;font-size:16px}</style></head>
<body><main><h1>Vehicles</h1><div id="view"></div></main><script>
const ROWS = ['ABC-123 Toyota Corolla', 'XYZ-987 Ford Focus', 'JKL-555 Kia Rio'];
let q = '';
const view = document.getElementById('view');
function render() {
  const rows = ROWS.filter(r => r.toLowerCase().includes(q.toLowerCase()));
  view.innerHTML = '<div class="toolbar" role="search"><input type="search" id="q" aria-label="Search" value="' + q + '">'
    + '<button type="button" data-search>Search</button><button type="button" class="secondary" data-clear>Clear</button></div>'
    + '<p role="status">' + rows.length + ' records' + (q ? ' matching ' + q : '') + '</p>'
    + (rows.length ? '<ul>' + rows.map(r => '<li>' + r + '</li>').join('') + '</ul>' : '<p>No matching records.</p>');
}
view.addEventListener('click', (e) => {
  const t = e.target;
  ${dead ? '' : `if (t.hasAttribute('data-search')) { q = view.querySelector('#q').value.trim(); render(); }
  else if (t.hasAttribute('data-clear')) { q = ''; render(); }`}
});
view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'q') { q = e.target.value.trim(); render(); } });
render();
</script></body></html>`;

describe('P069: a list whose «Search» and «Clear» read and empty its search box', () => {
    const servers: http.Server[] = [];
    afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

    const probe = async (dead: boolean) => {
        const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE(dead)); });
        servers.push(server);
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
            return await probeControls(page, { fillForms: false, budgetMs: 40_000, isolateBaselineControls: true });
        } finally {
            await browser.close();
        }
    };
    const worked = (p: Awaited<ReturnType<typeof probe>>, label: string) => p.controls.some(c => c.label === label && c.worked);

    it('«Search» is pressed with words in its box, and «Clear» after a search: both work', async () => {
        const p = await probe(false);
        expect(worked(p, 'Search')).toBe(true);
        expect(worked(p, 'Clear')).toBe(true);
        expect((p.metrics.secondLook || []).map((s: any) => `${s.label}: ${s.effect ? 'changed' : 'nothing'}`)).toEqual(expect.arrayContaining(['Search: changed', 'Clear: changed']));
    });

    it('…and buttons wired to nothing still change nothing, and are still reported', async () => {
        const p = await probe(true);
        expect(worked(p, 'Search')).toBe(false);
        expect(worked(p, 'Clear')).toBe(false);
    });
});

/**
 * P069's second finding, «qa_budget_exhausted», came from the responsive
 * sweep: its first pass was handed all of the sweep's 32 s, and every later
 * route at tablet and phone width was skipped — at 145 s of a 360 s walk.
 * Measured on the delivered garage: 2 findings, score 49, before; none, score
 * 100, after, at both the first budget and the retry's.
 */
describe('P069: every width of every route gets its share of the responsive sweep', () => {
    it('the sweep\'s time is split among the passes still to run', () => {
        const now = 1_000_000;
        expect(responsivePassBudget(now + 32_000, now, 4, 300_000)).toBe(8_000);
        expect(responsivePassBudget(now + 80_000, now, 8, 300_000)).toBe(10_000);
    });

    it('a pass is never starved below 6 s while the walk has time, and never runs past the walk', () => {
        const now = 1_000_000;
        expect(responsivePassBudget(now - 5_000, now, 3, 300_000)).toBe(6_000);
        expect(responsivePassBudget(now + 60_000, now, 1, 4_000)).toBe(4_000);
        expect(responsivePassBudget(now + 60_000, now, 1, 0)).toBe(0);
    });
});
