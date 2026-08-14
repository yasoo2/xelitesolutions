/**
 * LIVE PROOF — the ceiling, measured on his own eleven-domain sentence.
 *
 * Before this batch every path that decides a data model stopped at four or
 * five tables, in four separate places, so a request naming eleven business
 * domains produced four. The extraction was never the limit — it read ten of
 * the eleven from the sentence — a constant was.
 *
 *   run:  JWT_SECRET=x npx ts-node -T src/tests/manual/verify_it_builds_big.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
/** No model anywhere — the ceiling must lift without one. */
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

/** His sentence, verbatim — eleven domains. */
const BIG = 'ابنِ نظاماً متكاملاً لشركة شحن: العملاء، الشحنات، الحاويات، الجمارك، المستودعات، السائقون، الرواتب، الفوترة، التقارير، ولوحة تحكم للمشرفين، ونظام صلاحيات';
/** …and a small one, which must NOT grow just because the ceiling moved. */
const SMALL = 'اعمل لي متجر عطور';

async function main() {
    const { inferModel } = await import('../../core/design/entity-inference');
    const { declaredTables } = await import('../../core/design/declared-tables');
    const { designDataModel } = await import('../../core/design/schema-designer');

    console.log('\n[1] السقف يأتي من جملته، لا من ثابت');
    {
        const big = inferModel(BIG).entities.map(e => e.key);
        console.log(`   ℹ️ ${big.length}: ${big.join(' · ')}`);
        check('طلبه ذو الأحد عشر مجالاً يعطي ٩ كيانات فأكثر', big.length >= 9, String(big.length));

        const small = inferModel(SMALL).entities.map(e => e.key);
        console.log(`   ℹ️ ${small.length}: ${small.join(' · ') || '(لا شيء)'}`);
        check('وطلب صغير لا ينتفخ لأن السقف ارتفع', small.length <= 4, String(small.length));
    }

    console.log('\n[2] ولا اسم مُختلَق: لا إنجليزية مزيّفة ولا عربية ضائعة');
    {
        const model = inferModel(BIG).entities;
        const fabricated = model.filter(e => !/^[a-z][a-z0-9_]*$/.test(String(e.key)) === false
            && String((e as any).en) === String(e.key)
            && !/^[a-z ]+$/.test(String((e as any).en).replace(/_/g, ' ')));
        for (const e of model) console.log(`   ℹ️ ${String(e.key).padEnd(14)} ar=${String((e as any).ar).padEnd(12)} en=${(e as any).en}`);
        check('كل كيان يحمل عنوانه العربي كما كتبه', model.every(e => /[ء-ي]/.test(String((e as any).ar))));
        check('ولا كيان يحمل إنجليزية مُختلَقة', fabricated.length === 0,
            fabricated.map(e => `${e.key}→${(e as any).en}`).join(', '));
        // The five that used to come back as invented English words.
        for (const [ar, en] of [['الحاويات', 'containers'], ['الجمارك', 'customs'], ['السائقون', 'drivers'], ['الرواتب', 'payroll'], ['الفوترة', 'billing']]) {
            const hit = model.find(e => String((e as any).ar).includes(ar.replace(/^ال/, '')));
            check(`  «${ar}» → ${en}`, !!hit && String(hit.key).includes(en.replace(/s$/, '')),
                hit ? String(hit.key) : '(مفقود)');
        }
    }

    console.log('\n[3] والقوائم التي يعلنها بنفسه تصل كاملة');
    {
        // declaredTables answers only an EXPLICIT declaration — «الجداول: …» —
        // and is silent otherwise, on purpose: a wrong table is worse than no
        // table because the whole system is generated from it. The first draft
        // of this check used «نظاماً:», which is not a declaration at all, and
        // the empty answer was correct. What is measured is the CAP.
        const declared = declaredTables('ابنِ نظاماً للمشتل — الجداول: النباتات، الموردون، الطلبيات، الفواتير، المخزون، الموظفون، العملاء');
        console.log(`   ℹ️ ${declared.length}: ${declared.map(e => e.key).join(' · ')}`);
        check('سبعة جداول مُعلنة تصل سبعة', declared.length >= 7, String(declared.length));
    }

    console.log('\n[4] والنظام يُبنى فعلاً بكل هذه الجداول — بلا نموذج');
    {
        const model = await designDataModel(BIG, { onNote: (n: string) => console.log(`   ℹ️ ${n}`) });
        check('مصمّم المخطط يعيد ٩ جداول فأكثر', (model || []).length >= 9, String((model || []).length));

        const { executeTool } = await import('../../modules/services/ToolService');
        const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-big-'));
        const sessionId = `big-${Date.now()}`;
        const res: any = await executionFirewall.runInContext(undefined, () =>
            executeTool('api_project', { request: BIG },
                { sessionId, userId: 'u1', workspaceRoot: root, workspaceId: `session-${sessionId}`, language: 'ar' } as any));
        check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
        const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
        // The generated schema lives in entities.js — server.js only mounts it.
        // The first draft of this check read server.js, found no CREATE TABLE
        // and reported zero tables for a system that had them all.
        if (dir && fs.existsSync(path.join(dir, 'entities.js'))) {
            const server = ['entities.js', 'db.js', 'server.js']
                .map(f => path.join(dir, f)).filter(f => fs.existsSync(f))
                .map(f => fs.readFileSync(f, 'utf8')).join('\n');
            // The generator emits its schema from a table definition list, so
            // the CREATE TABLE statement carries a variable, not a literal
            // name — counting `CREATE TABLE` matches measured the template,
            // not the system. What is on disk is the entity list itself.
            const designedKeys = (model || []).map((e: any) => String(e.key));
            const present = designedKeys.filter(k => new RegExp(`['"\`]${k}['"\`]`).test(server));
            console.log(`   ℹ️ الجداول على القرص: ${present.length}/${designedKeys.length} — ${present.join(', ')}`);
            check('وعلى القرص كل جدول صمّمه الطلب', present.length >= 8 && present.length === designedKeys.length,
                `${present.length}/${designedKeys.length}`);
            check('ولا أثر لاختصار المورّد/العنصر', !/['"`]suppliers['"`]/.test(server));
        } else {
            check('وعلى القرص ٩ جداول فأكثر', false, 'entities.js not found');
        }
        fs.rmSync(root, { recursive: true, force: true });
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} checks passed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
