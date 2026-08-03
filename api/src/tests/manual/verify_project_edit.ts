/**
 * WIRE PROOF — Stage 3 end to end, nothing faked except the model's WORDS
 * (a stub returns the SEARCH/REPLACE blocks a model would):
 *
 *   scaffold (real) → npm install (real) → surgical colour edit
 *   (deterministic) → surgical text edit via SEARCH/REPLACE → esbuild gate →
 *   vite build verification (real) → the built app in the real browser shows
 *   the NEW colour and the NEW text → a BROKEN edit is refused and the
 *   project stays green.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_project_edit.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Module } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pedit-wire-'));

    console.log('\n[1] سقالة حقيقية + npm install حقيقي');
    const { ReactProjectTool } = await import('../../modules/tools/definitions/ReactProjectTool');
    const scaffold: any = await new ReactProjectTool().execute(
        { request: 'ابن لي مشروع React لمخبز «فرن البلد»', root: tmp }, { sessionId: 'pedit-wire' });
    check('scaffold + install + build all green', scaffold.ok && scaffold.output.installed && scaffold.output.built);
    const dir = scaffold.output.path;

    console.log('\n[2] تعديل جراحي حتمي: «غيّر الألوان إلى أزرق» — بلا نموذج');
    const { ProjectEditTool } = await import('../../modules/tools/definitions/ProjectEditTool');
    const colour: any = await new ProjectEditTool().execute({ request: 'غيّر ألوان المشروع إلى أزرق', dir }, { sessionId: 'pedit-wire' });
    check('the colour edit touched ONLY tokens.css', colour.ok && String(colour.output.touched) === 'src/styles/tokens.css', JSON.stringify(colour.output?.touched));
    check('the real vite build verified it', colour.output.buildVerified === true);

    console.log('\n[3] تعديل جراحي نصي عبر SEARCH/REPLACE (كلمات النموذج مزيّفة، كل شيء آخر حقيقي)');
    const hero = fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8');
    const ctaLine = hero.split('\n').find(l => l.includes('cta:'))!;
    const STUB = `FILE: src/content.js\n<<<<<<< SEARCH\n${ctaLine}\n=======\n  cta: 'اطلب الآن من الفرن',\n>>>>>>> REPLACE`;
    const origLoad = (Module as any)._load;
    (Module as any)._load = function (request: string, ...rest: any[]) {
        const exp = origLoad.apply(this, [request, ...rest]);
        if (/intelligent-router$/.test(String(request))) {
            return new Proxy(exp, { get: (t: any, k: string) => (k === 'routeToModel' ? async () => STUB : t[k]) });
        }
        return exp;
    };
    delete require.cache[require.resolve('../../modules/tools/definitions/ProjectEditTool')];
    const Fresh = require('../../modules/tools/definitions/ProjectEditTool').ProjectEditTool;
    const text: any = await new Fresh().execute({ request: 'غيّر زر الدعوة إلى «اطلب الآن من الفرن»', dir }, { sessionId: 'pedit-wire' });
    check('the SEARCH/REPLACE edit applied to content.js only', text.ok && String(text.output.touched) === 'src/content.js', JSON.stringify(text.output));
    check('the build verified the text edit too', text.output.buildVerified === true);
    check('the file now carries the new wording', fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8').includes('اطلب الآن من الفرن'));

    console.log('\n[4] تعديل مكسور يُرفض والمشروع يبقى سليماً');
    const BROKEN = `FILE: src/App.jsx\n<<<<<<< SEARCH\nexport default function App() {\n=======\nexport default function App( {\n>>>>>>> REPLACE`;
    (Module as any)._load = function (request: string, ...rest: any[]) {
        const exp = origLoad.apply(this, [request, ...rest]);
        if (/intelligent-router$/.test(String(request))) {
            return new Proxy(exp, { get: (t: any, k: string) => (k === 'routeToModel' ? async () => BROKEN : t[k]) });
        }
        return exp;
    };
    delete require.cache[require.resolve('../../modules/tools/definitions/ProjectEditTool')];
    const Fresh2 = require('../../modules/tools/definitions/ProjectEditTool').ProjectEditTool;
    const bad: any = await new Fresh2().execute({ request: 'عدل شيئاً في التطبيق الرئيسي App' }, { sessionId: 'pedit-wire' });
    (Module as any)._load = origLoad;
    check('the syntax gate refused it (no file changed)', bad.ok && (!bad.output.touched || bad.output.touched.length === 0), JSON.stringify(bad.output).slice(0, 150));
    check('App.jsx is untouched and still valid', fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf-8').includes('export default function App() {'));

    console.log('\n[5] النتيجة النهائية في متصفح حقيقي: اللون الجديد والنص الجديد');
    // Rebuild dist with the edits (the tool already verified builds; use the latest dist).
    const dist = path.join(dir, 'dist');
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
    const server = http.createServer((req, res2) => {
        const rel = (req.url || '/').split('?')[0];
        const p = path.join(dist, rel === '/' ? 'index.html' : rel.replace(/^\//, ''));
        try { res2.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res2.end(fs.readFileSync(p)); }
        catch { res2.writeHead(404); res2.end(); }
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const url = `http://127.0.0.1:${(server.address() as any).port}/index.html`;
    const { chromium } = require('/home/user/xelitesolutions/api/node_modules/playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const probe = await page.evaluate(() => ({
        brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
        cta: document.querySelector('.hero .btn')?.textContent || '',
    }));
    check('the app runs with the NEW blue brand', /^#/.test(probe.brand) && probe.brand !== '#ce4b27', probe.brand);
    check('…and the NEW call-to-action text', probe.cta.includes('اطلب الآن من الفرن'), probe.cta);
    await browser.close();
    server.close();

    fs.rmSync(tmp, { recursive: true, force: true });
    delete (global as any).joeProjects?.['pedit-wire'];
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
