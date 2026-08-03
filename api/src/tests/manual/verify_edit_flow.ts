/**
 * WIRE PROOF — «عدل على كذا» after the restart, end to end with the REAL
 * modules:
 *
 *   1. A built page is stored, flushed to DISK, the process state is wiped
 *      (the update-joe restart), loadJoePages restores it — and the REAL
 *      planner then routes «عدل على الهيدر…» to web_page_builder because the
 *      active page survived.
 *   2. Without the store (the old behaviour), the same message does NOT
 *      reach the builder — proving the restart was the trigger of «يتهبل».
 *   3. The vague-edit resolver: «عدل على كذا وكذا في صفحة التواصل» traced to
 *      the contact section by pickSectionsWithModel through a stubbed model
 *      answering the JSON the local brain would.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_edit_flow.ts
 */
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

const FALLTHROUGH = 'llm-fallthrough';

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-edit-flow-'));
    process.env.JOE_CHAT_STORE_DIR = tmp;
    const { flushJoePages, loadJoePages } = await import('../../api/page-store');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const route = async (goal: string, sessionId: string) => Promise.race([
        PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
            undefined, { sessionId },
        ).then(p => p.steps[0].tool).catch(() => FALLTHROUGH),
        new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 2500); (t as any).unref?.(); }),
    ]);

    // ── 1. build → disk → "restart" → the edit still finds its page ─────
    console.log('\n[1] صفحة مبنية ← قرص ← «إعادة تشغيل» ← «عدل على الهيدر» يصل أداة البناء');
    const g: any = global as any;
    g.joePages = { 'field-sess': { filename: 'joe-field-sess.html', html: '<html><body><header>هيدر</header></body></html>', kind: 'landing', updatedAt: Date.now() } };
    flushJoePages();
    g.joePages = {};                                    // ← update-joe.ps1
    check('after the wipe the memory really is empty', !g.joePages['field-sess']);

    console.log('  … (2) بدون الاستعادة — سلوك النسخة القديمة');
    const before = await route('عدل على الهيدر وخلي الالوان زرقاء', 'field-sess');
    check('OLD behaviour reproduced: the edit does NOT reach the builder', before !== 'web_page_builder', before);

    loadJoePages();                                     // ← the fix, at boot
    check('the page came back from disk', !!g.joePages['field-sess']?.html);
    const after = await route('عدل على الهيدر وخلي الالوان زرقاء', 'field-sess');
    check('NEW behaviour: the same edit routes to web_page_builder', after === 'web_page_builder', after);

    const dialect = await route('ضيف زر واتساب وحط صورة فوق', 'field-sess');
    check('dialect verbs (ضيف/حط) route there too', dialect === 'web_page_builder', dialect);

    // ── 3. the vague edit resolver, through a stubbed local brain ───────
    console.log('\n[3] «عدل على كذا وكذا» يُترجَم إلى قسم محدد عبر العقل المحلي (مزيّف هنا)');
    const origLoad = (Module as any)._load;
    (Module as any)._load = function (request: string, ...rest: any[]) {
        const exp = origLoad.apply(this, [request, ...rest]);
        if (/intelligent-router$/.test(String(request))) {
            return new Proxy(exp, {
                get: (t: any, k: string) => (k === 'routeToModel' ? async () => ' ["contact"] ' : t[k]),
            });
        }
        return exp;
    };
    // Import the builder AFTER the interposition so its routeToModel is the stub.
    const { splitIntoSections } = await import('../../core/design/section-editor');
    const toolMod: any = await import('../../modules/tools/definitions/WebPageBuilderTool');
    const builder: any = new toolMod.WebPageBuilderTool();
    const pageHtml = '<html><body>'
        + '<section id="hero"><h2>البطل</h2></section>'
        + '<section id="services"><h2>خدماتنا</h2></section>'
        + '<section id="contact"><h2>اتصل بنا</h2></section>'
        + '</body></html>';
    const sections = splitIntoSections(pageHtml);
    check('the page split into its three sections', sections.length === 3, String(sections.length));
    const target = await builder.pickSectionsWithModel('عدل على كذا وكذا في صفحة التواصل', sections, {}, undefined, true);
    (Module as any)._load = origLoad;
    check('the resolver picked exactly the contact section', Array.isArray(target) && target.length === 1 && target[0].id === 'contact',
        JSON.stringify(Array.isArray(target) ? target.map((t: any) => t.id) : target));

    g.joePages = {};
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
