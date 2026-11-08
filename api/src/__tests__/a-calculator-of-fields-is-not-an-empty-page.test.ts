/**
 * FIELDS ARE CONTROLS TOO.
 *
 * The ladder, 2026-11-08, L061: «Build a price calculator page for a
 * warehouse: quantity, unit price, discount percent and tax, with the total
 * updating as you type» — four number fields, no button (the total follows the
 * typing) and no <form> — was refused by the browser QA as «not one button,
 * link or form on the page». Pinned, in a real browser: such a page is a page;
 * a page with nothing to act on is still empty.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.setTimeout(180_000);

const CALCULATOR = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Warehouse price calculator</title>
<style>label{display:block;margin:8px 0}input{min-height:44px;min-width:160px;font-size:16px}</style></head><body>
<h1>Warehouse price calculator</h1>
<label>Quantity <input id="q" type="number" value="1" min="1"></label>
<label>Unit price <input id="p" type="number" value="10" min="0"></label>
<label>Discount % <input id="d" type="number" value="0" min="0" max="100"></label>
<label>Tax % <input id="t" type="number" value="15" min="0"></label>
<p>Total: <output id="total">11.50</output></p>
<script>
  const f = () => { const q=+q_.value, p=+p_.value, d=+d_.value, t=+t_.value; total.textContent = (q*p*(1-d/100)*(1+t/100)).toFixed(2); };
  const q_=document.getElementById('q'), p_=document.getElementById('p'), d_=document.getElementById('d'), t_=document.getElementById('t');
  [q_,p_,d_,t_].forEach(i => i.addEventListener('input', f));
</script></body></html>`;

const NOTHING = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nothing</title></head><body>
<h1>Coming soon</h1><p>There is nothing here to use.</p></body></html>`;

async function audit(html: string) {
    const { auditBuiltApp } = require('../core/quality/app-audit');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fields-'));
    try {
        fs.writeFileSync(path.join(dir, 'index.html'), html);
        return await auditBuiltApp(dir, { timeoutMs: 60_000, request: 'Build a price calculator page for a warehouse: quantity, unit price, discount percent and tax, with the total updating as you type and validation of every field.' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

describe('a page of fields is a page', () => {
    it('a live calculator with four fields and no button is not «empty» (L061)', async () => {
        const result = await audit(CALCULATOR);
        expect(result.skipped).toBeUndefined();
        expect(result.findings.map((f: any) => f.id)).not.toContain('empty_page');
    });

    it('a page with nothing to act on is still empty', async () => {
        const result = await audit(NOTHING);
        expect(result.skipped).toBeUndefined();
        expect(result.findings.map((f: any) => f.id)).toContain('empty_page');
    });
});
