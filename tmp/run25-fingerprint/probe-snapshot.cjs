// RUN25-EDIT-EFFECT-FINGERPRINT-001 — snapshot-level RED probe (MUSE independent check).
// Extracts the EXACT snapshot/changed functions from behaviour-audit.ts, transpiles
// with the repo's own TypeScript (type-stripping only), evaluates in real Chrome.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'api', 'src', 'core', 'quality', 'behaviour-audit.ts');
const FIXTURE = path.join(__dirname, 'fixture.html');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function extractFn(src, marker) {
    const start = src.indexOf(marker);
    if (start < 0) throw new Error('marker not found: ' + marker);
    const brace = src.indexOf('{', start);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error('unbalanced braces for ' + marker);
}

async function main() {
    const src = fs.readFileSync(SRC, 'utf-8');
    const srcHash = sha256(src);
    const snapSrc = extractFn(src, 'function snapshot() {');
    const changedSrc = extractFn(src, 'function changed(');
    const ts = require(path.join(ROOT, 'api', 'node_modules', 'typescript'));
    const snapJs = ts.transpileModule(snapSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const changedJs = ts.transpileModule(changedSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

    const { chromium } = require(path.join(ROOT, 'api', 'node_modules', 'playwright-core'));
    const userDataDir = path.join(__dirname, 'snap-profile');
    const ctx = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME, headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const results = { srcHash, snapshotSrcHash: sha256(snapSrc), changedSrcHash: sha256(changedSrc), cases: {} };
    try {
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.goto('file:///' + FIXTURE.replace(/\\/g, '/'));
        await page.evaluate(([snapSrc, changedSrc]) => {
            // eslint-disable-next-line no-new-func
            globalThis.__snap = new Function(`return (${snapSrc})`)();
            // eslint-disable-next-line no-new-func
            globalThis.__changed = new Function(`return (${changedSrc})`)();
        }, [snapJs, changedJs]);
        const snap = () => page.evaluate(() => globalThis.__snap());
        const changed = (a, b) => page.evaluate(([x, y]) => globalThis.__changed(x, y), [a, b]);
        const values = () => page.evaluate(() => ({
            name: document.getElementById('f-name').value,
            qty: document.getElementById('f-qty').value,
            notes: document.getElementById('f-notes').value,
        }));
        const textHtml = () => page.evaluate(() => ({
            text: document.body.innerText, htmlLen: document.body.innerHTML.length,
            htmlHash: (() => { let h = 2166136261; const s = document.body.innerHTML; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; })(),
        }));

        results.cases.sanityInitial = await values();

        // CASE 1 (RED premise): value-only Edit switch.
        const before1 = await snap(); const th1 = await textHtml();
        await page.click('button[data-edit="2"]');
        await page.waitForTimeout(300);
        const after1 = await snap(); const th2 = await textHtml();
        results.cases.valueOnlyEdit = {
            effect: await changed(before1, after1),
            valuesAfter: await values(),
            innerTextIdentical: th1.text === th2.text,
            innerHtmlIdentical: th1.htmlHash === th2.htmlHash,
            before: before1, after: after1,
        };

        // CASE 2 (negative control): inert button.
        const before2 = await snap();
        await page.click('#archive');
        await page.waitForTimeout(300);
        results.cases.inertButton = { effect: await changed(before2, await snap()) };

        // CASE 3 (positive control): visible text change.
        const before3 = await snap();
        await page.click('#bump');
        await page.waitForTimeout(300);
        results.cases.visibleChange = { effect: await changed(before3, await snap()) };
    } finally { await ctx.close(); }
    fs.writeFileSync(path.join(__dirname, 'snapshot-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({
        valueOnlyEditEffect: results.cases.valueOnlyEdit.effect,
        valuesAfter: results.cases.valueOnlyEdit.valuesAfter,
        innerTextIdentical: results.cases.valueOnlyEdit.innerTextIdentical,
        innerHtmlIdentical: results.cases.valueOnlyEdit.innerHtmlIdentical,
        inertEffect: results.cases.inertButton.effect,
        visibleEffect: results.cases.visibleChange.effect,
    }, null, 2));
}

main().catch((e) => { console.error('PROBE_FAILED', e); process.exit(1); });
