/**
 * ⛔ A FUNCTION SENT INTO THE PAGE CALLS NOTHING OF JOE'S.
 *
 * page.evaluate(fn) sends fn as TEXT; the page has none of the module around
 * it. On 2026-09-23 findForms (behaviour-audit.ts) began to call
 * expectsPersistentRecord, a function of its module. Every findForms threw
 * «expectsPersistentRecord is not defined», probeForms reported «0 forms» with
 * the error in a metric nobody read, and for seven weeks not one form was
 * filled on any delivery. Found 2026-11-10, when the owner watched the QA and
 * said «الأزرار ما بجربهم … القوائم ما بعبيهم» — measured on L451: 74 controls,
 * 0 fields.
 *
 * Pinned twice: every function a quality module hands to the page by name
 * calls no function of its module (read from the source), and a real form on a
 * real page is filled.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

const QUALITY = path.join(__dirname, '..', 'core', 'quality');

/** For each function a module sends into the page by name, the module functions its body calls. */
function sentFunctionsCallingTheirModule(): string[] {
    const out: string[] = [];
    for (const file of fs.readdirSync(QUALITY).filter(f => f.endsWith('.ts'))) {
        const src = fs.readFileSync(path.join(QUALITY, file), 'utf8');
        const top = new Set<string>();
        for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) top.add(m[1]);
        for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm)) top.add(m[1]);
        for (const m of src.matchAll(/^import\s+(?!type\b)\{([^}]*)\}/gm)) {
            for (const part of m[1].split(',')) {
                const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
                if (name && !/^type\s/.test(part.trim())) top.add(name);
            }
        }
        const sent = new Set<string>();
        for (const m of src.matchAll(/(?:evalInPage\(\s*\w+\s*,\s*|\.evaluate\(\s*)([A-Za-z_$][\w$]*)\s*[,)]/g)) sent.add(m[1]);
        for (const name of sent) {
            const at = src.search(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`, 'm'));
            if (at < 0) continue;
            const end = src.indexOf('\n}', at);
            const body = src.slice(at, end > 0 ? end : undefined);
            const inner = body.slice(body.indexOf('{'));
            const calls = [...top].filter(n => n !== name && new RegExp(`(?<![\\w$.'"\`])${n.replace(/\$/g, '\\$')}\\s*\\(`).test(inner));
            if (calls.length) out.push(`${file} ${name} calls ${calls.join(', ')}`);
        }
    }
    return out;
}

test('every function a quality module sends into the page calls nothing of its module', () => {
    expect(sentFunctionsCallingTheirModule()).toEqual([]);
});

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Projects</title></head><body>
<h1>Projects</h1>
<form id="new-project"><label>Key <input name="key" maxlength="10" required></label>
<label>Name <input name="name" required></label><button>Create project</button></form>
<ul id="list"></ul>
<script>
  document.getElementById('new-project').addEventListener('submit', function (e) {
    e.preventDefault();
    var li = document.createElement('li');
    li.textContent = e.target.key.value + ' ' + e.target.name.value;
    document.getElementById('list').appendChild(li);
    e.target.reset();
  });
</script></body></html>`;

test('a real form on a real page is filled and sent', async () => {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const r = await probeForms(page, { budgetMs: 20_000 });
        expect(r.metrics.formsError).toBeUndefined();
        expect(r.metrics.formsSeen).toBe(1);
        expect(r.metrics.formsFilled).toBe(1);
        expect(r.metrics.fieldsFilled).toBe(2);
        //  Sent through its own button, and the page answered (the list grew before the persistence reload).
        expect(r.forms[0]?.effect).toBeTruthy();
        expect(r.forms[0]?.effect).not.toBe('dead');
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
