/**
 * WIRE PROOF — Stage 2, end to end with NOTHING faked:
 *
 *   1. The REAL tool scaffolds the project, runs the REAL `npm install`,
 *      then the REAL `vite build`.
 *   2. The produced dist/ is served over HTTP and opened in the REAL
 *      browser: the React app must MOUNT (rendered heading), the theme
 *      toggle must actually flip data-theme, and Joe's visual audit must
 *      score the page.
 *   3. The planner routes «ابن لي مشروع React لمقهى» to react_project.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_react_project.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-react-'));

    // ── routing ─────────────────────────────────────────────────────────
    console.log('\n[0] التوجيه: «ابن لي مشروع React لمقهى» → react_project');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const plan = await Promise.race([
        PlanningEngine.generatePlan({ intent: { goal: 'ابن لي مشروع React لمقهى', complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any })
            .then(p => p.steps[0].tool).catch(() => 'fail'),
        new Promise<string>(r => { const t = setTimeout(() => r('timeout'), 2000); (t as any).unref?.(); }),
    ]);
    check('routed to react_project', plan === 'react_project', String(plan));
    const plain = await Promise.race([
        PlanningEngine.generatePlan({ intent: { goal: 'ابن لي موقعاً لمطعم بيتزا مع قائمة طعام', complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any })
            .then(p => p.steps[0].tool).catch(() => 'fail'),
        new Promise<string>(r => { const t = setTimeout(() => r('timeout'), 2000); (t as any).unref?.(); }),
    ]);
    check('a plain site request keeps the page builder', plain === 'web_page_builder', String(plain));

    // ── scaffold + REAL install + REAL build ────────────────────────────
    console.log('\n[1] الأداة الحقيقية: سقالة ← npm install حقيقي ← vite build حقيقي');
    const { ReactProjectTool } = await import('../../modules/tools/definitions/ReactProjectTool');
    const tool = new ReactProjectTool();
    const t0 = Date.now();
    const res: any = await tool.execute({ request: 'ابن لي مشروع React لمقهى القهوة المختصة «بُن»', root: tmp }, { sessionId: 'react-proof' });
    console.log(`  (i) استغرق ${(Date.now() - t0) / 1000 | 0} ثانية`);
    check('the tool reported ok', !!res.ok, JSON.stringify(res).slice(0, 200));
    const proj = String(res.output?.path || '');
    check('package.json + vite.config + components exist', ['package.json', 'vite.config.js', 'src/App.jsx', 'src/components/Hero.jsx', 'src/styles/tokens.css']
        .every(f => fs.existsSync(path.join(proj, f))));
    check('npm install really ran', res.output?.installed === true, 'installed=' + res.output?.installed);
    check('vite build really produced dist/index.html', res.output?.built === true && fs.existsSync(path.join(proj, 'dist', 'index.html')));
    const distHtml = fs.readFileSync(path.join(proj, 'dist', 'index.html'), 'utf-8');
    check('the dist page is RTL Arabic with the brand title', /dir="rtl"/.test(distHtml) && /بُن|مقهى/.test(distHtml), distHtml.slice(0, 120));

    // ── the built app, in the real browser ──────────────────────────────
    console.log('\n[2] التطبيق المبني يعمل في متصفح حقيقي (تحميل + زر الثيم + تدقيق جو البصري)');
    const dist = path.join(proj, 'dist');
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

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
    check('React MOUNTED: the hero heading rendered', h1.length > 3, h1 || '(empty)');
    const before = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        bg: getComputedStyle(document.body).backgroundColor,
    }));
    await page.click('.theme-toggle');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        bg: getComputedStyle(document.body).backgroundColor,
    }));
    check('the theme toggle really flips data-theme', before.theme !== after.theme, `${before.theme} → ${after.theme}`);
    check('…and the COLOURS actually change with it', before.bg !== after.bg, `${before.bg} → ${after.bg}`);

    const { auditVisually } = await import('../../core/quality/visual-audit');
    const audit = await auditVisually(url, {});
    check('Joe\'s own visual audit scores the React app ≥ 80', audit.ran && audit.score >= 80, `score=${audit.score} ${audit.findings.map(f => f.code).join(',')}`);

    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
