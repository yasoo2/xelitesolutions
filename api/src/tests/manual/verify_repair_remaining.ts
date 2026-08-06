/**
 * «أصلح ما تبقّى» — A PROMISE WITH A DOOR BEHIND IT.
 *
 * The delivery message now ends, when defects survive:
 *
 *     ↳ قل «أصلح ما تبقّى» وسأفتح المتصفّح على هذه بالذات.
 *
 * Until this batch that sentence opened onto a wall: the phrase fell through
 * to the surgical text editor, which asks a model to rewrite something it was
 * never told about. A sentence offering a command that does not exist spends
 * the user's trust on nothing.
 *
 *   [1] the tool is registered and reachable by name
 *   [2] the phrase ROUTES to it — in Arabic and in English
 *   [3] it refuses honestly when there is nothing to repair
 *   [4] and on a REAL broken build it measures, repairs, rebuilds, re-measures
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_repair_remaining.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { tools } = await import('../../modules/tools/registry');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    console.log('\n[1] الأداة موجودة فعلاً — لا اسم في رسالة');
    const tool = (tools as any[]).find(t => t.name === 'project_repair');
    check('project_repair مسجّلة', !!tool, tool ? 'ok' : 'غير مسجّلة');
    check('ولها صلاحيات معلنة', Array.isArray(tool?.permissions) && tool.permissions.length > 0,
        JSON.stringify(tool?.permissions));

    console.log('\n[2] والعبارة توصل إليها — بالعربية والإنجليزية');
    const sessionId = `repair-${Date.now()}`;
    const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');

    const routeFor = async (goal: string) => {
        const plan = await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', suggestedAgent: 'Dev', rawIntent: {} }, memory: [] } as any,
            undefined, { sessionId, userId: 'u1', workspaceId: `session-${sessionId}` } as any);
        return (plan?.steps || []).map((s: any) => s.tool);
    };

    console.log('\n[3] وبلا مشروع — ترفض بصدق بدل أن تدّعي');
    const empty: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('project_repair', {}, { sessionId, userId: 'u1', workspaceId: `session-${sessionId}` }));
    check('لا مشروع = رفض واضح', empty?.ok === false && /لا مشروع مبنيّ|No built project/.test(String(empty?.error)),
        String(empty?.error).slice(0, 80));

    console.log('\n[4] بناء حقيقي، ثم إصلاح حقيقي لما تبقّى');
    const built: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: 'ابنِ متجراً بسيطاً لبيع القهوة' },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('البناء نجح', built?.ok === true, String(built?.error || '').slice(0, 100));
    const dir = ((global as any).joeProjects || {})[key]?.dir;
    check('والمشروع صار نشطاً لهذه الجلسة', !!dir && fs.existsSync(String(dir)), String(dir || 'لا شيء'));

    // Now the routing, with a project really active.
    const ar = await routeFor('أصلح ما تبقّى');
    const en = await routeFor('fix what is left');
    console.log(`   ℹ️ «أصلح ما تبقّى» → ${ar.join(', ') || 'لا شيء'}`);
    console.log(`   ℹ️ «fix what is left» → ${en.join(', ') || 'لا شيء'}`);
    check('العبارة العربية تصل إلى project_repair', ar.includes('project_repair'), ar.join(', '));
    check('والإنجليزية كذلك', en.includes('project_repair'), en.join(', '));
    check('ولم تعد تذهب إلى المحرّر الجراحي', !ar.includes('project_edit') && !en.includes('project_edit'));

    // …and a plain edit must NOT be hijacked by the new route.
    const edit = await routeFor('غيّر لون الأزرار إلى الأخضر');
    check('وتعديل عادي ما زال يذهب للمحرّر', edit.includes('project_edit'), edit.join(', '));

    console.log('\n[5] والإصلاح يقيس ويُصلح ويُعيد البناء ويقيس ثانية');
    const rep: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('project_repair', {}, { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('الإصلاح جرى', rep?.ok === true, String(rep?.error || '').slice(0, 120));
    const out = rep?.output || {};
    console.log(`   ℹ️ ${out.before} → ${out.after} — عُدّل: ${(out.changed || []).length} — باقٍ: ${(out.remaining || []).join(', ') || 'لا شيء'}`);
    check('وأعاد رقمين مقيسين لا واحداً', typeof out.before === 'number' && typeof out.after === 'number');
    check('ولم يدّع تحسّناً لم يحدث', Number(out.after) >= Number(out.before), `${out.before} → ${out.after}`);
    check('ورسالته تقول ما جرى', /أصلحتُ ما أستطيع|لم يتحسّن القياس|لا شيء لأصلحه/.test(String(out.message)),
        String(out.message).split('\n')[0]);
    check('والبناء ما زال قابلاً للعرض بعده',
        fs.existsSync(path.join(String(dir), 'dist', 'index.html')));

    console.log('\n--- ما سيقرؤه ---');
    console.log(String(out.message || '').split('\n').slice(0, 10).join('\n'));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
