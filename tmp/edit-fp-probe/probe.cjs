/* Independent probe for RUN25-EDIT-EFFECT-FINGERPRINT-001 (Muse review).
 * Runs the SHIPPED fingerprint logic (mechanically extracted, no hand edits)
 * against a live Chromium fixture that mirrors the run25 static-records Edit
 * dispute: a shared visible form whose record switch changes only live
 * input.value properties. Fixture belongs to no product prompt.
 * Evidence only; not a repo test. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const API = 'D:/Joe/muse-worktree/api';
const ts = require(API + '/node_modules/typescript/lib/typescript.js');
const { chromium } = require(API + '/node_modules/playwright');

function extractFn(js, name) {
    const idx = js.indexOf('function ' + name + '(');
    if (idx < 0) throw new Error('missing function ' + name);
    const open = js.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < js.length; i++) {
        if (js[i] === '{') depth++;
        else if (js[i] === '}') { depth--; if (!depth) return js.slice(idx, i + 1); }
    }
    throw new Error('unbalanced ' + name);
}

// --- shipped behaviour-audit logic, transpiled mechanically ---
const qaSrc = fs.readFileSync(path.join(API, 'src/core/quality/behaviour-audit.ts'), 'utf8');
const qaJs = ts.transpileModule(qaSrc, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 } }).outputText;
const SNAPSHOT_SRC = extractFn(qaJs, 'snapshot');
const CHANGED_SRC = extractFn(qaJs, 'changed');
if (/require\(|exports\.|import\(/.test(SNAPSHOT_SRC + CHANGED_SRC)) throw new Error('extracted QA fns are not page-pure');

// --- shipped click fingerprint IIFE, extracted verbatim ---
const avSrc = fs.readFileSync(path.join(API, 'src/modules/browser/actionVerification.ts'), 'utf8');
const anchor = 'export const CLICK_FINGERPRINT_SCRIPT = `';
const start = avSrc.indexOf(anchor) + anchor.length;
const end = avSrc.indexOf('`;', start);
const CLICK_FP_IIFE = avSrc.slice(start, end);
if (CLICK_FP_IIFE.includes('`')) throw new Error('unexpected backtick in IIFE');
if (!CLICK_FP_IIFE.includes('outerHTML')) throw new Error('IIFE extraction looks wrong');

function compareFp(b, a) { // mirrors compareClickEffect lines 407-412
    return { navigated: b.url !== a.url, domChanged: b.title !== a.title || b.elements !== a.elements || b.textLength !== a.textLength || b.htmlHash !== a.htmlHash };
}

// --- candidate: hash of visible non-sensitive live form values, hash only ---
const FORM_VALUE_HASH_SRC = `(() => {
  const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const parts = [];
  for (const el of document.querySelectorAll('input,textarea,select')) {
    const tag = el.tagName.toLowerCase();
    const type = String(el.type || '').toLowerCase();
    if (['password', 'hidden', 'file'].includes(type)) continue;
    if (el.disabled || el.readOnly) continue;
    if (!vis(el)) continue;
    const key = el.name || el.id || tag;
    let val;
    if (tag === 'select') val = el.selectedIndex + ':' + (el.options[el.selectedIndex] ? el.options[el.selectedIndex].value : '');
    else if (type === 'checkbox' || type === 'radio') val = el.checked ? '1' : '0';
    else val = el.value;
    parts.push(key + '=' + val);
  }
  parts.sort();
  return djb2(parts.join('|'));
})()`;

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>FP Probe</title><link rel="icon" href="data:,"></head><body>
<h1>Records</h1>
<table><tbody>
<tr><td>ALPHA-row</td><td><button id="edit1" type="button">Edit</button></td></tr>
<tr><td>BETA-row</td><td><button id="edit2" type="button">Edit</button></td></tr>
</tbody></table>
<button id="noop" type="button">Do nothing</button>
<button id="focusonly" type="button">Focus name</button>
<form id="editor" style="display:none">
<input id="f-name" name="recordName" type="text" value="">
<textarea id="f-notes" name="notes"></textarea>
<select id="f-loc" name="location"><option value="shelf-a">Shelf A</option><option value="shelf-b">Shelf B</option></select>
<input id="f-date" name="expiry" type="date" value="">
<input id="f-pw" name="secret" type="password" value="pw-S3CRET-marker">
<input id="f-hid" name="token" type="hidden" value="hid-TOK marker">
</form>
<script>
const ROWS = { edit1: { name: 'ALPHA-marker-value', notes: 'alpha notes here', loc: 'shelf-a', date: '2026-01-05' },
               edit2: { name: 'BETA-marker-value', notes: 'beta notes here', loc: 'shelf-b', date: '2026-02-06' } };
for (const id of Object.keys(ROWS)) {
  document.getElementById(id).addEventListener('click', () => {
    const r = ROWS[id];
    document.getElementById('editor').style.display = 'block';
    document.getElementById('f-name').value = r.name;
    document.getElementById('f-notes').value = r.notes;
    document.getElementById('f-loc').value = r.loc;
    document.getElementById('f-date').value = r.date;
  });
}
document.getElementById('focusonly').addEventListener('click', () => document.getElementById('f-name').focus());
</script>
</body></html>`;

(async () => {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(FIXTURE); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await (await browser.newContext()).newPage();
    const snap = async () => ({
        qa: await page.evaluate(new Function(SNAPSHOT_SRC + '\nreturn snapshot();')),
        fp: await page.evaluate(CLICK_FP_IIFE),
        fv: await page.evaluate(FORM_VALUE_HASH_SRC),
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    const s0 = await snap();
    console.log('qa-snapshot-keys: ' + Object.keys(s0.qa).sort().join(','));
    console.log('fp-keys: ' + Object.keys(s0.fp).sort().join(','));

    const rows = [];
    async function transition(label, action) {
        const before = await snap();
        await action();
        await page.waitForTimeout(250);
        const after = await snap();
        const qaVerdict = await page.evaluate(new Function('pair', CHANGED_SRC + '\nreturn changed(pair.a, pair.b);'), { a: before.qa, b: after.qa });
        const fpVerdict = compareFp(before.fp, after.fp);
        rows.push({ label, qaEffect: qaVerdict || '(none)', fpDomChanged: fpVerdict.domChanged, formHashChanged: before.fv !== after.fv });
        return { before, after };
    }

    await transition('edit1-reveals-form', () => page.locator('#edit1').click());
    const v1 = await page.inputValue('#f-name');
    await transition('edit1-to-edit2-value-only-switch', () => page.locator('#edit2').click());
    const v2 = await page.inputValue('#f-name');
    await transition('inert-noop-control', () => page.locator('#noop').click());
    await transition('focus-only-control', () => page.locator('#focusonly').click());

    for (const r of rows) console.log(`${r.label}: qa=${r.qaEffect} fpDomChanged=${r.fpDomChanged} formHashChanged=${r.formHashChanged}`);
    console.log(`visible-name-after-edit1: ${v1} | after-edit2: ${v2}`);

    const evidence = JSON.stringify(rows) + JSON.stringify(s0) + [await page.evaluate(FORM_VALUE_HASH_SRC)].join();
    const leaks = ['ALPHA-marker-value', 'BETA-marker-value', 'pw-S3CRET-marker', 'hid-TOK'].filter((s) => evidence.includes(s));
    console.log('privacy-leaks: ' + (leaks.length ? leaks.join(',') : 'none'));

    await browser.close();
    server.close();
})().catch((e) => { console.error('PROBE_ERROR: ' + (e && e.message ? e.message : e)); process.exit(2); });
