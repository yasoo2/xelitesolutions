/**
 * «عند وضع بروميت بالانجليزية … يجب ان تكون النتيجة والذكاء العصبي كلها
 *  انجليزية، وعندما نغير الى لغه اخرى … يجب ان يعطينا جو النتيجه في نفس اللغه»
 *
 * From his own trace, on an English prompt in English mode:
 *
 *     جاري تنفيذ: api project…
 *     🗄️ Building a real backend with a database: MyApp
 *
 * Two languages, one request, three lines apart. The build tools had followed
 * the rule for months — «the interface's setting wins, else the prompt's own
 * script» — and the neural trace never learned it, because the rule lived
 * copy-pasted inside each tool instead of in one place.
 *
 * This captures every thinking event Joe broadcasts during a real run and
 * asserts the whole stream is in ONE language: the one he asked in.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_one_language_per_run.ts
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

const ARABIC = /[؀-ۿ]/;
/** Latin letters that are WORDS, not a tool name or a path. */
const wordy = (s: string) => /[A-Za-z]{4,}/.test(s.replace(/[a-z_]+\.(js|ts|jsx|json|css)/gi, ''));

async function traceOf(request: string, language: string): Promise<string[]> {
    const lines: string[] = [];
    // ws.ts carries an observer hook built for exactly this: «a proof that
    // measures a build must not depend on a client being there».
    const { observeBroadcasts } = await import('../../api/ws');
    const stop = observeBroadcasts((e: any) => {
        if (e?.type !== 'thinking_phase' && e?.type !== 'thinking_detail') return;
        const text = String(e?.data?.detail ?? e?.data?.text ?? e?.data ?? '');
        if (text) lines.push(text);
    });
    try {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-lang-'));
        const { executeTool } = await import('../../modules/services/ToolService');
        const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
        const sessionId = `lang-${Date.now()}`;
        // The firewall refuses a direct call — every execution goes through a
        // context, exactly as a real run does.
        await executionFirewall.runInContext(`lang-${Date.now()}`, () =>
            executeTool('api_project', { request, root, skipInstall: true }, { sessionId, language } as any));
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* fine */ }
        delete (global as any).joeProjects?.[sessionId];
    } finally { stop(); }
    return lines.filter(Boolean);
}

async function main() {
    console.log('\n[1] بروميت إنجليزي + واجهة إنجليزية → أثرٌ إنجليزي بالكامل');
    const en = await traceOf('Build a social media platform with groups and pages', 'en');
    console.log(`      (${en.length} سطراً)`);
    for (const l of en) console.log(`      | ${l.slice(0, 90)}`);
    const arabicInEn = en.filter(l => ARABIC.test(l));
    check('لا سطر عربي واحد في الأثر', arabicInEn.length === 0, arabicInEn.join(' | ').slice(0, 160));
    check('والأثر ليس فارغاً — الذكاء العصبي يتكلّم فعلاً', en.length > 0, String(en.length));
    check('و«Running:» حلّت محلّ «جاري تنفيذ:»',
        !en.some(l => l.includes('جاري تنفيذ')), en.filter(l => l.includes('جاري')).join(' | '));

    console.log('\n[2] بروميت عربي + واجهة عربية → أثرٌ عربي بالكامل');
    const ar = await traceOf('ابنِ نظاماً لمشتل: النباتات والموردون', 'ar');
    console.log(`      (${ar.length} سطراً)`);
    for (const l of ar) console.log(`      | ${l.slice(0, 90)}`);
    const englishInAr = ar.filter(l => !ARABIC.test(l) && wordy(l));
    check('لا جملة إنجليزية في الأثر العربي', englishInAr.length === 0, englishInAr.join(' | ').slice(0, 160));

    console.log('\n[3] وبلا إعداد واجهة، النصّ نفسه هو الذي يقرّر');
    const { isArabicReply } = await import('../../shared/reply-language');
    check('نصّ عربي بلا إعداد → عربي', isArabicReply({ text: 'ابنِ متجراً' }) === true);
    check('نصّ إنجليزي بلا إعداد → إنجليزي', isArabicReply({ text: 'build me a store' }) === false);
    check('وإعداد الواجهة يغلب النصّ — كلمة عربية واحدة لا تقلب الوضع الإنجليزي',
        isArabicReply({ language: 'en-US', text: 'build a متجر' }) === false);
    check('…والعكس صحيح', isArabicReply({ language: 'ar', text: 'build a store' }) === true);

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
