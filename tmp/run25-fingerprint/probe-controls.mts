// RUN25-EDIT-EFFECT-FINGERPRINT-001 — end-to-end RED via REAL probeControls (MUSE check).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
import pwCore from '../../api/node_modules/playwright-core';
const { chromium } = pwCore as any;
import { probeControls } from '../../api/src/core/quality/behaviour-audit';

const FIXTURE = path.join(DIR, 'fixture.html');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
    const ctx = await chromium.launchPersistentContext(path.join(DIR, 'ctl-profile'), {
        executablePath: CHROME, headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.goto('file:///' + FIXTURE.replace(/\\/g, '/'));
        const out = await probeControls(page as any, { fillForms: false, budgetMs: 45000, maxControls: 12 });
        const picks = (out.controls || []).map((c: any) => ({
            label: c.label, kind: c.kind, worked: c.worked, effect: c.effect,
            exploratory: !!c.exploratory,
        }));
        const summary = {
            controls: picks,
            clickErrors: (out.metrics as any)?.controlClickErrors || [],
            budgetExhausted: !!(out.metrics as any)?.explorationBudgetExhausted,
            statesVisited: (out.metrics as any)?.statesVisited,
            finalValues: await page.evaluate(() => ({
                name: (document.getElementById('f-name') as HTMLInputElement).value,
                qty: (document.getElementById('f-qty') as HTMLInputElement).value,
                notes: (document.getElementById('f-notes') as HTMLTextAreaElement).value,
            })),
        };
        fs.writeFileSync(path.join(DIR, 'controls-results.json'), JSON.stringify(summary, null, 2));
        console.log(JSON.stringify(summary, null, 2));
    } finally { await ctx.close(); }
}
main().catch((e) => { console.error('PROBE_FAILED', e); process.exit(1); });
