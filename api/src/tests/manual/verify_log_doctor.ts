/**
 * WHAT THE TERMINAL DISCOVERS, JOE FIXES — «سواء اكتشفها عن طريق المتصفح او
 * الثيرمال او اي اداه اخرى».
 *
 * The browser half was finished: a defect found by the audit is repaired in the
 * source before delivery. The terminal half was not. A command failed, its
 * output was matched against a table of known problems, and the table returned
 * ADVICE — «Change port or kill process using the port» — printed at the person
 * who had asked Joe to do the work.
 *
 * Every case below is a REAL failing command in a REAL project, healed and
 * re-run for real. Nothing is simulated with a canned log string except where
 * the failure itself cannot be provoked safely (a heap exhaustion), and those
 * are marked as what they are.
 *
 *   [1] packages missing entirely → installed → the build passes
 *   [2] a package the build names  → fetched  → the build passes
 *   [3] a busy port                → moved to a free one → the server starts
 *   [4] what cannot be fixed safely is NAMED in Arabic, never invented
 *   [5] one remedy, one retry — a broken project fails honestly
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_log_doctor.ts
 */
export {};
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function tinyProject(dir: string, extra: Record<string, string> = {}) {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'doctor-probe', private: true, version: '1.0.0', type: 'module',
        scripts: { build: 'esbuild src/main.js --bundle --outfile=dist/out.js' },
        devDependencies: { esbuild: '^0.21.0' },
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(dir, 'src', 'main.js'), extra.main ?? 'console.log("hello");\n', 'utf-8');
    for (const [rel, text] of Object.entries(extra)) {
        if (rel === 'main') continue;
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text, 'utf-8');
    }
}

async function main() {
    const { diagnose, applyRemedy, runDoctored, findFreePort, portFree } =
        await import('../../core/quality/log-doctor');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-doctor-'));

    console.log('\n[1] حزم غير مثبّتة أصلاً — يشخّص، يثبّت، ويعيد المحاولة');
    const p1 = path.join(root, 'no-modules');
    tinyProject(p1);
    // The build must fail for a reason PATH cannot accidentally solve: a binary
    // lookup finds this harness's own node_modules/.bin under npx, and would
    // have made this case pass while testing nothing. An import cannot.
    fs.writeFileSync(path.join(p1, 'package.json'), JSON.stringify({
        name: 'doctor-probe', private: true, version: '1.0.0', type: 'module',
        scripts: { build: 'node -e "import(\'is-odd\').then(m => { require(\'fs\').mkdirSync(\'dist\', { recursive: true }); require(\'fs\').writeFileSync(\'dist/out.js\', \'ok\'); })"' },
        dependencies: { 'is-odd': '^3.0.1' },
    }, null, 2), 'utf-8');
    const r1 = await runDoctored('npm', ['run', 'build'], { cwd: p1, timeoutMs: 300_000, onLine: () => { /* quiet */ } });
    check('التشخيص: الحزم غير مثبّتة', r1.diagnosis?.id === 'no_node_modules', JSON.stringify(r1.diagnosis || r1.exitCode));
    check('والعلاج طُبّق فعلاً', r1.remedy?.applied === true, r1.remedy?.note);
    check('والبناء نجح في المحاولة الثانية', r1.ok === true, String(r1.exitCode));
    check('و dist/out.js موجود فعلاً على القرص', fs.existsSync(path.join(p1, 'dist', 'out.js')));

    console.log('\n[2] حزمة يسمّيها البناء بنفسه — ينزّلها ويكمل');
    const p2 = path.join(root, 'missing-pkg');
    tinyProject(p2, { main: 'import isOdd from "is-odd";\nconsole.log(isOdd(3));\n' });
    // Install only the bundler, so the build fails naming the package it wants.
    const { executionEngine } = await import('../../kernel/ExecutionEngine');
    await executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], { cwd: p2, timeout: 300_000 }).done;
    const r2 = await runDoctored('npm', ['run', 'build'], { cwd: p2, timeoutMs: 300_000, onLine: () => { /* quiet */ } });
    check('التشخيص: حزمة ناقصة', r2.diagnosis?.id === 'missing_package', JSON.stringify(r2.diagnosis || ''));
    check('وسمّاها بالاسم', (r2.diagnosis?.data?.missing || []).includes('is-odd'), JSON.stringify(r2.diagnosis?.data));
    check('ونزّلها فعلاً', fs.existsSync(path.join(p2, 'node_modules', 'is-odd')), r2.remedy?.note);
    check('والبناء اكتمل بعدها', r2.ok === true, String(r2.exitCode));

    console.log('\n[3] منفذ مشغول — ينتقل إلى منفذ حر ويشغّل فعلاً');
    const busy = net.createServer(() => { /* just occupies */ });
    const takenPort = await findFreePort(4700);
    await new Promise<void>(r => busy.listen(takenPort, '127.0.0.1', () => r()));
    check('المنفذ صار مشغولاً فعلاً', (await portFree(takenPort)) === false, String(takenPort));

    const p3 = path.join(root, 'server');
    fs.mkdirSync(p3, { recursive: true });
    fs.writeFileSync(path.join(p3, 'server.js'), `import http from 'http';
const port = Number(process.env.PORT || ${takenPort});
const srv = http.createServer((_q, s) => { s.end('ok'); });
srv.on('error', (e) => { console.error(String(e.message || e)); process.exit(1); });
srv.listen(port, '127.0.0.1', () => { console.log('listening on ' + port); srv.close(() => process.exit(0)); });
`, 'utf-8');
    fs.writeFileSync(path.join(p3, 'package.json'), JSON.stringify({ name: 's', private: true, type: 'module' }), 'utf-8');
    const r3 = await runDoctored('node', ['server.js'], { cwd: p3, timeoutMs: 30_000, onLine: () => { /* quiet */ } });
    check('التشخيص: المنفذ مشغول', r3.diagnosis?.id === 'port_in_use', JSON.stringify(r3.diagnosis || r3.log.slice(0, 120)));
    check('وانتقل إلى منفذ حرّ', typeof r3.port === 'number' && r3.port !== takenPort, String(r3.port));
    check('والخادم عمل فعلاً على المنفذ الجديد', r3.ok === true && r3.log.includes(`listening on ${r3.port}`), String(r3.exitCode));
    busy.close();

    console.log('\n[4] وما لا يُصلَح بأمان يُسمّى بالعربية — ولا يُخترَع له علاج');
    const dangling = diagnose({
        exitCode: 1, cwd: root,
        log: 'error during build:\n[vite]: Rollup failed to resolve import\nFailed to resolve import "./components/Missing.jsx" from "src/App.jsx". Does the file exist?',
    });
    check('استوردَ ملفاً غير موجود → يُسمّى', dangling?.id === 'dangling_import', JSON.stringify(dangling));
    check('ولا يُدّعى أنه قابل للإصلاح آلياً', dangling?.fixable === false);
    check('والرسالة عربية وتذكر الملفين', /غير موجود/.test(dangling?.ar || '')
        && /Missing\.jsx/.test(dangling?.ar || '') && /App\.jsx/.test(dangling?.ar || ''), dangling?.ar);

    const heap = diagnose({ exitCode: 134, cwd: root, log: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory' });
    check('نفاد الذاكرة يُشخَّص', heap?.id === 'heap_out_of_memory' && heap.fixable === true);
    const heapFix = await applyRemedy(heap!, root, async () => ({ exitCode: 0 }));
    check('وعلاجه رفع الحدّ لا أكثر', heapFix.envPatch?.NODE_OPTIONS === '--max-old-space-size=4096', JSON.stringify(heapFix));

    const nothing = diagnose({ exitCode: 1, cwd: root, log: 'Error: something nobody has ever seen before' });
    check('وخطأ مجهول لا يُخترَع له تشخيص', nothing === null, JSON.stringify(nothing));

    console.log('\n[5] علاج واحد ومحاولة واحدة — لا حلقة لا تنتهي');
    const p5 = path.join(root, 'hopeless');
    tinyProject(p5, { main: 'import x from "./nope.js";\nconsole.log(x);\n' });
    await executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], { cwd: p5, timeout: 300_000 }).done;
    const started = Date.now();
    const r5 = await runDoctored('npm', ['run', 'build'], { cwd: p5, timeoutMs: 120_000, onLine: () => { /* quiet */ } });
    check('فشل بصدق بدل أن يدور', r5.ok === false, String(r5.exitCode));
    check('ولم يعلق', Date.now() - started < 180_000, `${Math.round((Date.now() - started) / 1000)}s`);

    console.log('\n[6] وهو موصول بمسار البناء الحقيقي — لا معلّق في الفراغ');
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    check('البناء يشخّص فشله بالطبيب', /const \{ diagnose, applyRemedy \} = require\('\.\.\/\.\.\/\.\.\/core\/quality\/log-doctor'\)/.test(R));
    check('ويطبّق العلاج ثم يعيد البناء', /if \(remedy\.applied\)/.test(R) && /vite build \(after: \$\{remedy\.note\}\)/.test(R));
    check('ويقول للمستخدم ما جرى بالعربية', /شخّصتُه وعالجتُه/.test(R) && /البناء تعثّر، والسبب بالضبط/.test(R));

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
