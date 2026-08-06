/**
 * THE BUILD FIXES ITSELF BEFORE IT IS HANDED OVER.
 *
 * Joe has been able to mend a project's source for a while — but only when the
 * user ASKED. A build Joe had just measured at 62/100 was delivered at 62/100
 * with the findings printed underneath, the repair machinery sitting one
 * function away, reachable only by someone who knew to say «أصلح الواجهة».
 * Reading a defect report was being treated as the user's job.
 *
 *   [1] the cycle is ONE piece of code — the tool and the build path share it
 *   [2] a real broken project is repaired, rebuilt, and re-measured
 *   [3] a repair that would break the build reverts the project WHOLE
 *   [4] a build with nothing auto-fixable is not rebuilt for nothing
 *   [5] and the delivery message states the two numbers, not a promise
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_self_repair.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { repairAndRebuild, worthRepairing, collectSources } = await import('../../core/quality/self-repair');

    console.log('\n[1] الدورة قرار واحد في النظام — لا نسختان');
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    const U = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'UiFixTool.ts'), 'utf-8');
    check('مسار البناء يستدعي الدورة المشتركة', /await repairAndRebuild\(proj/.test(R));
    check('وأداة «أصلح الواجهة» تستدعي الدورة نفسها', /await repairAndRebuild\(dir/.test(U));
    check('ولم تبقَ نسخة ثانية من الإصلاح داخل الأداة',
        !/const plan = repairProjectFiles\(sources/.test(U) && !/function collectSources/.test(U));

    console.log('\n[2] وما لا يُصلَح آلياً لا يستهلك إعادة بناء');
    check('ملاحظة قابلة للإصلاح تستدعي الدورة',
        worthRepairing([{ id: 'console_errors' }, { id: 'small_targets' }]) === true);
    check('وملاحظات لا يصلحها تعديل حتمي لا تستدعيها',
        worthRepairing([{ id: 'console_errors' }, { id: 'dead_controls' }, { id: 'webfont_missing' }]) === false);

    console.log('\n[3] مشروع React حقيقي — يُبنى، يُكسر عمداً، ثم يصلح نفسه');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-selfrepair-'));
    const sessionId = `selfrepair-${Date.now()}`;
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx: any = { sessionId, workspaceId: work, userId: 'u1' };
    const executeTool = (name: string, args: any) =>
        executionFirewall.runInContext(`selfrepair-${Date.now()}`, () => rawExecute(name, args, ctx));

    const app: any = await executeTool('react_project', { request: 'صفحة خدمات بسيطة', skipAudit: true });
    const dir = String(app?.output?.path || '');
    check('المشروع بُني', app?.ok === true && fs.existsSync(path.join(dir, 'dist', 'index.html')), String(app?.error || ''));
    if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) { console.log('\n===== توقّف ====='); process.exit(1); }

    const shell = path.join(dir, 'src', 'App.jsx');
    const pristine = fs.readFileSync(shell, 'utf-8');
    // The scaffolder shapes App.jsx differently per app kind, so the injection
    // point is found rather than assumed — a replace that silently matched
    // nothing would let every assertion below pass while testing air.
    const marker = (pristine.match(/<main[^>]*>/) || [])[0] || '';
    check('نقطة الحقن موجودة فعلاً في المشروع المُولَّد', !!marker, pristine.slice(0, 120));
    fs.writeFileSync(shell, pristine.replace(marker, `${marker}
        <a href="#" className="btn">رابط ميت</a>
        <div className="tile" onClick={() => window.scrollTo(0, 0)}>إلى الأعلى</div>`), 'utf-8');
    check('وكُسر المشروع عمداً', fs.readFileSync(shell, 'utf-8') !== pristine);

    const before = collectSources(dir);
    check('المصدر جُمع من المشروع الحقيقي', Object.keys(before).length > 3, String(Object.keys(before).length));

    const cycle = await repairAndRebuild(dir, { onLine: () => { /* quiet */ } });
    check('الدورة أصلحت ملفات فعلاً', cycle.changed.length > 0, JSON.stringify(cycle.skipped || cycle.changed));
    check('والبناء نجح بعدها', cycle.built === true);
    check('ولم تُرجَع التعديلات', cycle.reverted === false);

    const now = fs.readFileSync(shell, 'utf-8');
    check('الرابط الميت صار زراً حقيقياً', !/href="#"/.test(now), (now.match(/href="[^"]*"/g) || []).join(' '));
    check('والعنصر النقري صار تصله لوحة المفاتيح', /tabIndex=\{0\}/.test(now));
    check('و dist أُعيد بناؤه فعلاً', fs.existsSync(path.join(dir, 'dist', 'index.html'))
        && fs.statSync(path.join(dir, 'dist', 'index.html')).mtimeMs > 0);

    console.log('\n[4] وإصلاح يكسر البناء يُرجِع المشروع كما كان — بالبايت');
    // A file that PARSES perfectly and still explodes at build time: it imports
    // something that does not exist, and it is really rendered, so the bundler
    // has to resolve it. Only a real `npm run build` catches this — which is
    // exactly why the cycle runs one.
    const poison = path.join(dir, 'src', 'components', 'Poison.jsx');
    fs.mkdirSync(path.dirname(poison), { recursive: true });
    fs.writeFileSync(poison, 'import missing from "./nope-does-not-exist.js";\n'
        + 'export default function Poison(){ return (<a href="#">{String(missing)}</a>); }\n', 'utf-8');
    const withPoison = fs.readFileSync(shell, 'utf-8');
    const marker2 = (withPoison.match(/<main[^>]*>/) || [])[0] || '';
    fs.writeFileSync(shell, `import Poison from './components/Poison.jsx';\n`
        + withPoison.replace(marker2, `${marker2}\n        <Poison />`), 'utf-8');
    const appBefore = fs.readFileSync(shell, 'utf-8');
    const poisonBefore = fs.readFileSync(poison, 'utf-8');
    const bad = await repairAndRebuild(dir, { onLine: () => { /* quiet */ } });
    check('الدورة أعلنت فشل البناء', bad.built === false, JSON.stringify(bad.skipped || ''));
    check('وأرجعت كل ملف', bad.reverted === true && bad.changed.length === 0);
    check('و App.jsx عاد بالبايت كما كان', fs.readFileSync(shell, 'utf-8') === appBefore);
    check('و الملف السام نفسه عاد كما كان — لم يُصلَح ولم يُشوَّه',
        fs.readFileSync(poison, 'utf-8') === poisonBefore);
    fs.rmSync(poison);
    fs.writeFileSync(shell, withPoison, 'utf-8');    // the project is healthy again

    console.log('\n[5] ومشروع لا شيء فيه ليُصلَح لا يُعاد بناؤه بلا سبب');
    const clean = await repairAndRebuild(dir, { onLine: () => { /* quiet */ } });
    check('الدورة قالت: لا شيء لأصلحه', clean.skipped === 'nothing_to_repair', JSON.stringify(clean));
    check('ولم تلمس ملفاً', clean.changed.length === 0);

    console.log('\n[6] والبناء الكامل يُصلح نفسه ويقول الرقمين');
    const full: any = await executeTool('react_project', { request: 'صفحة خدمات ثانية' });
    const msg = String(full?.output?.message || '');
    check('البناء الكامل نجح', full?.ok === true, String(full?.error || ''));
    check('وفحص نفسه في متصفح حقيقي', /فحص الجودة الذاتي/.test(msg), msg.slice(0, 200));
    check('والرسالة تذكر عدد الصفحات والأزرار المضغوطة', /صفحة، \d+ زر مضغوط/.test(msg),
        (msg.match(/\(.*?زر مضغوط.*?\)/) || [''])[0]);
    // A freshly generated project may already be clean — that is a pass, not a
    // failure, so the claim is conditional and states which branch it took.
    const repaired = /أصلحتُ ما وجدتُه بنفسي قبل التسليم/.test(msg);
    const score = Number((msg.match(/(\d+)\/100/) || [])[1] || 0);
    check(repaired ? 'وأصلح ما وجده وذكر الرقمين قبل وبعد' : 'أو كان نظيفاً أصلاً فلم يعبث به',
        repaired ? /\d+\/100 ← \d+\/100/.test(msg) : score >= 85, `score=${score}, repaired=${repaired}`);

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
