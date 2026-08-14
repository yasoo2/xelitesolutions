/**
 * LIVE PROOF — the long loop: build a phase, verify it, repair it, go on.
 *
 * The promise being measured is the one he asked for in plain words: a large
 * request is carried to the end WITHOUT stopping to ask him anything, on a
 * machine where no language model answers.
 *
 *   run:  JWT_SECRET=x npx ts-node -T src/tests/manual/verify_the_long_loop.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
process.env.LOCAL_LLM_BASE_URL = '';
for (const k of ['GROQ_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
    'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'HUGGINGFACE_API_KEY']) delete process.env[k];
process.env.OFFLINE_MODE = 'true';

import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** His sentence — eleven domains, and «المستودعات» among them. */
const BIG = 'ابنِ نظاماً متكاملاً لشركة شحن: العملاء، الشحنات، الحاويات، الجمارك، المستودعات، السائقون، الرواتب، الفوترة';

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const run = (tool: string, input: any, ctx: any) =>
        executionFirewall.runInContext(undefined, () => executeTool(tool, input, ctx)) as Promise<any>;

    console.log('\n[1] «المستودعات» مخزنٌ، لا مستودع Git');
    {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ll1-'));
        const d = await run('engineering_discovery', { request: BIG },
            { sessionId: `w${Date.now()}`, userId: 'u1', workspaceRoot: root });
        check('طلبٌ فيه مستودعات يُقرأ إنشاءً جديداً',
            d?.output?.evidence?.constraints?.createsNewProject === true,
            `createsNewProject=${d?.output?.evidence?.constraints?.createsNewProject}`);

        // …and a real repository request must still be read as one.
        const git = await run('engineering_discovery',
            { request: 'استنسخ المستودع من github.com/yasoo2/xelitesolutions وحلّل الكود' },
            { sessionId: `g${Date.now()}`, userId: 'u1', workspaceRoot: root });
        check('وطلب مستودع Git حقيقي ما زال يُقرأ كذلك',
            git?.output?.evidence?.constraints?.userRequestedExistingProject === true);
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n[2] الحلقة الطويلة — من الطلب إلى نظام حيّ، بلا نموذج وبلا سؤال');
    {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ll2-'));
        const sessionId = `long-${Date.now()}`;
        const asked: string[] = [];
        const t0 = Date.now();
        const r = await run('project_pipeline', { request: BIG }, {
            sessionId, userId: 'u1', workspaceRoot: root, workspaceId: `session-${sessionId}`, language: 'ar',
            // Anything that stops to ask him is recorded here.
            onProgress: (m: string) => { if (/اختر|حدّد|select|choose|which project/i.test(String(m))) asked.push(String(m)); },
        });
        const seconds = Math.round((Date.now() - t0) / 1000);
        console.log(`   ℹ️ ${r?.output?.completedPhases}/${r?.output?.totalPhases} مراحل · ${seconds}s · delivery=${r?.output?.deliveryStatus}`);

        check('لم يُحجب', r?.output?.deliveryStatus !== 'blocked', String(r?.output?.deliveryStatus));
        check('وخطّط بلا نموذج', (r?.logs || []).some((l: string) => /planning deterministically|أخطّط حتمياً|عادت فارغة/.test(l)));
        check('ونفّذ كل مراحله', Number(r?.output?.completedPhases || 0) >= 2
            && r?.output?.completedPhases === r?.output?.totalPhases,
            `${r?.output?.completedPhases}/${r?.output?.totalPhases}`);
        check('ولم يسأله شيئاً في الطريق', asked.length === 0, asked.slice(0, 2).join(' | '));
        check('ولم يطلب قراراً بشرياً', r?.output?.requiresUserDecision !== true);

        // The system it produced is the one he described, on disk.
        const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
        console.log(`   ℹ️ ${dir || '(لا مسار)'}`);
        if (dir && fs.existsSync(path.join(dir, 'entities.js'))) {
            const src = fs.readFileSync(path.join(dir, 'entities.js'), 'utf8');
            const his = ['clients', 'shipments', 'containers', 'customs', 'warehouses', 'drivers'];
            const present = his.filter(k => new RegExp(`['"\`]${k}['"\`]`).test(src));
            console.log(`   ℹ️ جداوله على القرص: ${present.join(', ')}`);
            check('والنظام على القرص يحمل مجالاته هو', present.length >= 6, `${present.length}/${his.length}`);
        } else {
            check('والنظام على القرص يحمل مجالاته هو', false, 'entities.js not found');
        }
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n[3] ومرحلةٌ تسقط حقاً — تُبلَّغ ولا تُخفى');
    {
        // A phase naming a tool that cannot exist: the plan sanitiser must
        // neutralise it with a written reason, and the run must not pretend.
        const { sanitisePlanPhases } = await import('../../core/orchestrator/plan-tools');
        const clean = sanitisePlanPhases([
            { name: 'Impossible', tasks: [{ tool: 'Jira', task: 'open a board', args: {} }] },
            { name: 'Data service', tasks: [{ tool: 'api_project', task: 'build', args: { request: BIG } }] },
        ], 'project');
        check('مهمة لا أداة لها تُسقَط بسبب مكتوب',
            clean.notes.some(n => /أسقطتُ|لا أداة/.test(n)), clean.notes.slice(0, 2).join(' | '));
        check('ولا تُفشل بقية الخطة',
            clean.phases.some((p: any) => (p.tasks || []).some((t: any) => t.tool === 'api_project')));
        check('والمرحلة الميتة تُسلّم وثيقة بدل ادعاء تنفيذ',
            clean.phases.some((p: any) => (p.tasks || []).some((t: any) => t.tool === 'write_file')));
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} checks passed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
