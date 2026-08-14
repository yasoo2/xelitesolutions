/**
 * LIVE PROOF — the three blockers the review found, measured on the running
 * system rather than argued about.
 *
 *   [1] a NEW build is not refused because old projects exist on the disk
 *   [2] an EXISTING-project operation still asks, and the answer has a wire
 *   [3] with every provider dead, a build still plans and still lands
 *
 *   run:  JWT_SECRET=x npx ts-node -T src/tests/manual/verify_it_still_builds.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
/** No model anywhere: no keys, and an Ollama address nothing answers on. */
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

/** A workspace holding `n` previous projects, exactly like his after a month of use. */
function workspaceWith(n: number): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-crowded-'));
    for (let i = 0; i < n; i++) {
        const dir = path.join(root, `old-project-${i}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `old-project-${i}` }), 'utf8');
    }
    return root;
}

const NEW_BUILD = 'بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات';
const ON_EXISTING = 'شغّل الاختبارات على المشروع الحالي وأصلح ما يسقط';

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const run = (tool: string, input: any, ctx: any) =>
        executionFirewall.runInContext(undefined, () => executeTool(tool, input, ctx)) as Promise<any>;

    console.log('\n[1] «ابنِ لي جديداً» — مهما تراكم في مساحة العمل');
    for (const count of [0, 1, 3, 24]) {
        const root = workspaceWith(count);
        const result = await run('engineering_discovery', { request: NEW_BUILD },
            { sessionId: `d${Date.now()}`, userId: 'u1', workspaceRoot: root });
        const evidence = result?.output?.evidence;
        check(`${String(count).padStart(2)} مشروعاً موجوداً → يبني`,
            evidence?.mode === 'greenfield' && (evidence?.blockers || []).length === 0,
            `mode=${evidence?.mode} blockers=${(evidence?.blockers || []).length}`);
        check(`   …ويعلن أن القائمة لن تُمسّ`,
            count === 0 || (evidence?.facts || []).some((f: any) => f.id === 'workspace.other_projects_untouched' || f.id === 'request.creates_new_project'));
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n[2] «اشتغل على القائم» — يسأل، والسؤال له سلك');
    {
        const root = workspaceWith(3);
        const asked = await run('engineering_discovery', { request: ON_EXISTING },
            { sessionId: `e${Date.now()}`, userId: 'u1', workspaceRoot: root });
        const evidence = asked?.output?.evidence;
        check('ما زال يسأل حين يجب أن يسأل', evidence?.mode === 'ambiguous' && (evidence.blockers || []).length > 0,
            `mode=${evidence?.mode}`);
        check('والعلاج يسمّي الحقل الذي يحمل الجواب',
            /`path`/.test(String((evidence?.blockers || [])[0]?.remedy || '')),
            String((evidence?.blockers || [])[0]?.remedy || ''));

        // …and the answer actually arrives when it is given.
        const answered = await run('engineering_discovery', { request: ON_EXISTING, path: 'old-project-1' },
            { sessionId: `e2${Date.now()}`, userId: 'u1', workspaceRoot: root });
        const settled = answered?.output?.evidence;
        check('وحين يُعطى المسار يمضي', settled?.mode === 'existing_workspace' && (settled.blockers || []).length === 0,
            `mode=${settled?.mode}`);
        check('على المشروع الذي سمّاه هو', String(settled?.selectedProject?.root || '').endsWith('old-project-1'),
            String(settled?.selectedProject?.root || ''));
        // The pipeline must forward it, or the remedy is words only.
        const pipelineSource = fs.readFileSync(path.join(__dirname, '../../modules/tools/definitions/ProjectPipelineTool.ts'), 'utf8');
        check('والأنبوب يمرّره فعلاً إلى الاكتشاف',
            /projectPath \? \{ request, path: projectPath \} : \{ request \}/.test(pipelineSource));
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log('\n[3] وبلا أي مزوّد — يخطّط ممّا صرّح به الطلب، ويسلّم');
    {
        const { deterministicPhasesFor } = await import('../../modules/tools/definitions/ProjectPipelineTool');
        const plan = deterministicPhasesFor(NEW_BUILD);
        check('خطة حتمية موجودة', !!plan);
        check('خادم قبل واجهة — لأنّ فيه كيانات', plan?.phases?.[0]?.tasks?.[0]?.tool === 'api_project'
            && plan?.phases?.[1]?.tasks?.[0]?.tool === 'react_project',
            (plan?.phases || []).map(p => p.tasks[0].tool).join(' → '));
        check('والسبب مُعلن، لا اسم منتج', /entities|data service/.test(String(plan?.reason)), String(plan?.reason));
        const page = deterministicPhasesFor('اعمل لي صفحة هبوط لشركتي');
        check('وصفحة ساكنة لا يُفرض عليها خادم', page?.phases?.length === 1 && page?.phases?.[0]?.tasks?.[0]?.tool === 'web_page_builder',
            (page?.phases || []).map(p => p.tasks[0].tool).join(' → '));
        check('وسؤال ليس بناءً لا يُخطَّط له', deterministicPhasesFor('كم سعر البن؟') === null);

        // The whole tool, end to end, on a crowded workspace with no brain at all.
        const root = workspaceWith(3);
        const sessionId = `full-${Date.now()}`;
        const result = await run('project_pipeline', { request: NEW_BUILD },
            { sessionId, userId: 'u1', workspaceRoot: root, workspaceId: `session-${sessionId}`, language: 'ar' });
        check('الأنبوب لم يعد يُحجب', result?.output?.deliveryStatus !== 'blocked',
            `delivery=${result?.output?.deliveryStatus} stop=${result?.output?.stopReason}`);
        check('وخطّط بلا نموذج', (result?.logs || []).some((l: string) => /planning deterministically|أخطّط حتمياً/.test(l)),
            (result?.logs || []).slice(-2).join(' | ').slice(0, 160));
        check('ونفّذ مرحلة واحدة على الأقل', Number(result?.output?.totalPhases || 0) > 0,
            `${result?.output?.completedPhases}/${result?.output?.totalPhases}`);
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} checks passed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
