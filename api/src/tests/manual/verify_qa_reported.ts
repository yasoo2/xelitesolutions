/**
 * «ولكن جو لم يصنع أي شيء ظاهر من هذه الخطوات نهائياً»
 *
 * His run spent 62 seconds on the self-QA, the browser panel and the
 * self-repair, and the message he received mentioned none of it — because the
 * ENGLISH branch of that message never carried the audit section at all.
 *
 * This runs a REAL build in ENGLISH — the exact path his request took — and
 * reads the message that comes back.
 *
 *   [1] the build really audits itself in a real browser
 *   [2] and the DELIVERED MESSAGE says so, with the score
 *   [3] every finding appears as a sentence, not as a slug
 *   [4] and if a repair ran, what it changed AND what survived are both named
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_qa_reported.ts
 */
export {};
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
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    console.log('\n[1] بناء حقيقي بالإنجليزية — نفس المسار الذي سلكه طلبه');
    const sessionId = `qa-report-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: 'Build a simple online store for coffee' },
            // language: 'en' on purpose — the branch that used to say nothing.
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 120));

    const message = String(res?.output?.message || '');
    const audit = res?.output?.audit;
    console.log(`   ℹ️ الرسالة (${message.length} حرف)`);
    check('والواجهة إنجليزية كما طُلب', /A full React project/.test(message), message.slice(0, 60));
    check('والفحص الذاتي جرى فعلاً', !!audit && !audit.skipped, JSON.stringify(audit?.skipped ?? 'no audit'));

    console.log('\n[2] والرسالة المُسلَّمة تقول ذلك — لا تصمت عنه');
    check('قسم الفحص موجود في الرسالة', /Self-QA/i.test(message),
        message.split('\n').slice(0, 12).join(' | ').slice(0, 160));
    check('ومعه الدرجة', new RegExp(`${audit?.score}\\/100`).test(message), `score=${audit?.score}`);
    check('وعدد الصفحات والأزرار المضغوطة', /page\(s\)|control\(s\) pressed/.test(message));

    console.log('\n[3] وكل ملاحظة جملة لا شيفرة');
    const findings = (audit?.findings || []) as any[];
    console.log(`   ℹ️ ملاحظات: ${findings.length ? findings.map(f => f.id).join(', ') : 'لا شيء (نظيف)'}`);
    if (findings.length) {
        const missing = findings.filter(f => !message.includes(String(f.detail)));
        check('كل ملاحظة ظهرت بنصّها الكامل', missing.length === 0,
            missing.map(f => f.id).join(', '));
        check('ولم تُختصر إلى قائمة رموز', !/console_errors, failed_requests/.test(message));
    } else {
        check('البناء نظيف — والرسالة تقولها بلا اختلاق', /clean|100\/100/.test(message), message.slice(0, 80));
    }

    console.log('\n[4] وإن جرى إصلاح ذاتي — ما تغيّر وما بقي، كلاهما مذكور');
    const repaired = /Repaired before delivery/.test(message);
    console.log(`   ℹ️ إصلاح ذاتي: ${repaired ? 'جرى' : 'لم يلزم'}`);
    if (repaired) {
        check('يقول الدرجة قبل وبعد', /\d+\/100 → \d+\/100/.test(message));
        check('ويسمّي الملفات التي عدّلها', /edited: /.test(message));
        check('ويقول ما بقي بعد الإصلاح أو أنه لم يبقَ شيء',
            /Still there after the repair|Nothing left from the findings/.test(message));
    } else {
        check('ولا يدّعي إصلاحاً لم يقع', !/Repaired before delivery/.test(message));
    }

    console.log('\n[5] وإن بقي عطل جوهري — تُعلن الرسالة ذلك في صدرها');
    const blockers = ((audit?.findings || []) as any[]).filter(f => f.severity === 'high');
    console.log(`   ℹ️ أعطال جوهرية باقية: ${blockers.length ? blockers.map(f => f.id).join(', ') : 'لا شيء'}`);
    if (blockers.length) {
        check('الرسالة تبدأ بالاعتراف لا بالإنجاز', /does NOT work properly/.test(message));
        check('والعنوان لا يدّعي أكثر ممّا استحقّ', /delivered WITH open defects/.test(message), message.slice(0, 70));
        const warnAt = message.indexOf('does NOT work properly');
        check('والاعتراف قبل قائمة الملفات', warnAt >= 0 && warnAt < message.indexOf('📂 Path'), `${warnAt}`);
        for (const f of blockers) check(`ومُسمّى: ${f.id}`, message.includes(String(f.detail)), String(f.detail).slice(0, 60));
        check('ويعرض الأمر الذي يعالجها', /fix what is left|أصلح ما تبقّى/.test(message));
    } else {
        check('بناء نظيف — ولا إنذار مُختلق', !/does NOT work properly/.test(message));
        check('والعنوان يقول ما حدث بلا تهويل', /verified to compile/.test(message), message.slice(0, 70));
    }

    console.log('\n--- الرسالة كما ستصل إليه ---');
    console.log(message.split('\n').slice(0, 22).join('\n'));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
