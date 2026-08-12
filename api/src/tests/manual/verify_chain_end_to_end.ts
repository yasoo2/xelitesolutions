/**
 * «اختبر ذلك تكامليا مصورا» — THE CHAIN, RUN FOR REAL, AND PHOTOGRAPHED.
 *
 * The last batch proved the PLAN: four verbs became four steps wired with
 * {{FROM:id}}. A plan is not a run. This drives the whole path end to end on a
 * real folder with real files:
 *
 *   1. a real repository is written to disk
 *   2. the REAL PlanningEngine reads one Arabic sentence and returns a chain
 *   3. every step is executed through the REAL executeTool, in order
 *   4. each step after the first has {{FROM:previous}} replaced by the actual
 *      output of the step before it — the orchestrator's own syntax
 *   5. what happened is rendered and SCREENSHOT, so the evidence is a picture
 *      and not a claim
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_chain_end_to_end.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const GOAL = 'حلّل المستودع، ثم راجع الكود، ثم اضغط الملفات في أرشيف zip';

/** The orchestrator's own way of turning a result into text for the next step. */
const textOf = (r: any): string => {
    if (r == null) return '';
    if (typeof r === 'string') return r;
    const o = r.output ?? r;
    return String(o?.answer ?? o?.message ?? o?.summary ?? o?.text
        ?? (typeof o === 'string' ? o : JSON.stringify(o)));
};

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-chain-'));
    const proj = path.join(root, 'shop');
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'shop', version: '1.0.0' }, null, 2));
    fs.writeFileSync(path.join(proj, 'src', 'index.js'),
        "const express = require('express');\nconst app = express();\n"
        + "// a deliberate smell for the reviewer to find\nconst PASSWORD = 'admin123';\n"
        + "app.get('/', (req, res) => res.send('ok'));\napp.listen(3000);\n");
    fs.writeFileSync(path.join(proj, 'src', 'util.js'), 'export const sum = (a, b) => a + b;\n');

    console.log('\n[1] المخطِّط الحقيقي يقرأ الجملة');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const plan: any = await PlanningEngine.generatePlan(
        { intent: { goal: GOAL, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any });
    const tools: string[] = (plan.steps || []).map((s: any) => s.tool);
    console.log(`      الخطّة: ${tools.join(' → ')}`);
    check('الخطّة سلسلة لا خطوة واحدة', plan.steps.length >= 3, `${plan.steps.length} خطوة`);
    check('…ومصدرها المطابقة بالقدرات', plan.metadata?.matchedBy === 'capability-chain', String(plan.metadata?.matchedBy));
    check('وكل خطوة تعتمد على التي قبلها',
        plan.steps.slice(1).every((s: any, i: number) => s.dependsOn?.[0] === `chain_${i}`),
        JSON.stringify(plan.steps.map((s: any) => s.dependsOn)));

    console.log('\n[2] وكل خطوة تُنفَّذ فعلاً — بأدوات جو نفسها');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const done: Record<string, any> = {};
    const rows: Array<{ id: string; tool: string; task: string; injected: string; ok: boolean; out: string }> = [];

    for (const step of plan.steps) {
        const raw = String(step.input?.request || '');
        // The orchestrator's own reference syntax, resolved exactly as it does.
        let injected = '';
        const text = raw.replace(/\{\{\s*FROM:([a-zA-Z0-9_-]+)\s*\}\}/g, (_m, id) => {
            injected = textOf(done[id]).slice(0, 400);
            return injected;
        });
        const input: any = { ...step.input, request: text, question: text, query: text, path: proj, directory: proj, target: proj };
        let res: any = null;
        try {
            res = await executionFirewall.runInContext(`chain-${Date.now()}`, () =>
                executeTool(step.tool, input, { sessionId: 'chain-proof' } as any));
        } catch (e: any) { res = { ok: false, output: String(e?.message || e) }; }
        done[step.id] = res;
        const out = textOf(res).replace(/\s+/g, ' ').slice(0, 300);
        rows.push({ id: step.id, tool: step.tool, task: String(step.description || ''), injected, ok: res?.ok !== false, out });
        console.log(`      ${step.tool}: ${res?.ok !== false ? 'OK' : 'FAILED'} — ${out.slice(0, 90)}`);
    }

    check('كل خطوة نُفِّذت ورجعت بنتيجة', rows.every(r => r.out.length > 0), JSON.stringify(rows.map(r => r.out.length)));
    check('والخطوة الثانية استقبلت ناتج الأولى فعلاً — لا نصّ الطلب',
        rows[1] && rows[1].injected.length > 20, `${rows[1]?.injected.length || 0} حرفاً`);
    check('والثالثة استقبلت ناتج الثانية', rows[2] && rows[2].injected.length > 20, `${rows[2]?.injected.length || 0} حرفاً`);
    check('ونواتج الخطوات مختلفة — ليست الأداة نفسها تُعيد الشيء ذاته',
        new Set(rows.map(r => r.out)).size === rows.length);

    console.log('\n[3] وتُصوَّر — الدليل صورة لا ادّعاء');
    const okCount = rows.filter(r => r.ok).length;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
 :root{--bg:#0b1120;--card:#111a2e;--line:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--ok:#34d399;--bad:#f87171;--brand:#60a5fa}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);
   font:15px/1.75 system-ui,'Segoe UI',sans-serif;padding:28px}
 h1{margin:0 0 4px;font-size:21px} .sub{color:var(--muted);font-size:13.5px;margin-bottom:18px}
 .goal{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:20px}
 .goal b{color:var(--brand)}
 .step{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
 .head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
 .n{width:26px;height:26px;flex:none;border-radius:999px;background:var(--brand);color:#0b1120;
    display:grid;place-items:center;font-weight:800;font-size:13px}
 .tool{font-family:ui-monospace,Menlo,monospace;font-size:14px;color:var(--brand)}
 .badge{margin-inline-start:auto;font-size:12px;padding:2px 10px;border-radius:999px;border:1px solid currentColor}
 .ok{color:var(--ok)} .bad{color:var(--bad)}
 .task{color:var(--muted);font-size:13.5px;margin-bottom:8px}
 .flow{border-inline-start:3px solid var(--ok);padding:8px 12px;margin:8px 0;background:#0e1a2b;border-radius:0 8px 8px 0}
 .flow .lab{color:var(--ok);font-size:12px;font-weight:700}
 .out{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);
      background:#0a1322;border:1px solid var(--line);border-radius:8px;padding:8px 10px;
      overflow-wrap:anywhere;direction:ltr;text-align:start}
 .arrow{text-align:center;color:var(--muted);font-size:18px;margin:-6px 0 6px}
 .foot{margin-top:16px;color:var(--muted);font-size:12.5px}
</style></head><body>
<h1>سلسلة أدوات حقيقية — منفَّذة، لا مخطَّطة</h1>
<div class="sub">جملة واحدة → ${rows.length} خطوات → ${okCount}/${rows.length} نجحت · كل خطوة تقرأ ناتج التي قبلها</div>
<div class="goal">الطلب: <b>${esc(GOAL)}</b></div>
${rows.map((r, i) => `
<div class="step">
  <div class="head"><span class="n">${i + 1}</span><span class="tool">${esc(r.tool)}</span>
    <span class="badge ${r.ok ? 'ok' : 'bad'}">${r.ok ? 'نُفِّذت' : 'فشلت'}</span></div>
  <div class="task">المهمّة: ${esc(r.task.split('—').slice(1).join('—').trim() || r.task)}</div>
  ${r.injected ? `<div class="flow"><span class="lab">◀ استقبلت ناتج الخطوة ${i}:</span>
     <div class="out">${esc(r.injected.slice(0, 200))}…</div></div>` : ''}
  <div class="out">${esc(r.out)}</div>
</div>${i < rows.length - 1 ? '<div class="arrow">↓</div>' : ''}`).join('')}
<div class="foot">${new Date().toISOString().slice(0, 19).replace('T', ' ')} · الأدوات نفسها التي يستعملها جو، عبر executeTool، على مستودع حقيقي على القرص.</div>
</body></html>`;

    const shot = path.join(os.tmpdir(), 'joe-chain-proof.png');
    const page = path.join(root, 'proof.html');
    fs.writeFileSync(page, html, 'utf-8');
    try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ args: ['--no-sandbox'] });
        const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        await p.goto('file://' + page, { waitUntil: 'load' });
        await p.screenshot({ path: shot, fullPage: true });
        await browser.close();
        check('الصورة كُتبت فعلاً', fs.existsSync(shot) && fs.statSync(shot).size > 10000,
            `${Math.round((fs.statSync(shot).size || 0) / 1024)}KB`);
        console.log(`      📸 ${shot}`);
    } catch (e: any) { check('الصورة كُتبت فعلاً', false, String(e?.message || e).slice(0, 90)); }

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* fine */ }
    delete (global as any).joeProjects?.['chain-proof'];
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
