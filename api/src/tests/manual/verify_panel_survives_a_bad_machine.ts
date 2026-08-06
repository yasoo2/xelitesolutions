/**
 * «لم يتحرك متصفح جو مع انه في اللوجز يقول انه تم تشغيله … ولكن كل شي وهمي»
 *
 * His run finally said the true thing — «🔒 The Browser panel could not be
 * used — the audit is running in a private browser» — and then, three seconds
 * later, said «👁️ Watch it happen in the Browser panel». Two lines, one run,
 * one of them a lie: the audit emits a second progress event when it starts
 * pressing controls, and the handler treated everything that was not the word
 * «private» as an invitation to watch.
 *
 * Under both lines sits the real defect: on HIS machine the panel session fails
 * to start on every run, and the reason died inside `catch { }`.
 *
 * Measured here with REAL browsers, by breaking the machine on purpose:
 *
 *   [1] a saved login state Chromium REFUSES no longer kills the panel
 *   [2] a headed launch on a machine with no display no longer kills it either
 *   [3] and when it truly cannot be borrowed, the audit names the reason —
 *       and nothing afterwards invites him to watch a browser he cannot see
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_panel_survives_a_bad_machine.ts
 */
export {};
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
// Isolate every artefact this proof writes.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-badmachine-'));
process.env.BROWSER_SESSION_DIR = path.join(SANDBOX, 'sessions');
process.env.BROWSER_PROFILE_DIR = path.join(SANDBOX, 'profiles');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** The exact on-disk layout the manager writes: [12B iv][16B tag][ciphertext]. */
function writeSavedState(sessionId: string, state: any) {
    const master = process.env.BROWSER_SESSION_SECRET || process.env.JWT_SECRET || 'joe-local-browser-secret';
    const key = crypto.createHash('sha256').update(`${master}::${sessionId}`).digest();
    const hash = crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 40);
    const file = path.join(process.env.BROWSER_SESSION_DIR!, `${hash}.enc`);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(state), 'utf-8')), cipher.final()]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([iv, cipher.getAuthTag(), enc]));
    return file;
}

function builtSite(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),
        `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر</title>
<style>body{margin:0;background:#0b3d2e;color:#fff;font-family:sans-serif}button{min-width:48px;min-height:48px;margin:8px}</style>
</head><body><h1>متجرنا</h1><button onclick="document.title='ok'">أضف إلى السلة</button></body></html>`, 'utf-8');
}

async function main() {
    const dist = path.join(SANDBOX, 'dist');
    builtSite(dist);

    const mgr = await import('../../modules/browser/manager');
    const { auditBuiltApp } = await import('../../core/quality/app-audit');
    const SID = 'panel-browser';

    console.log('\n[1] حالة تسجيل دخول محفوظة يرفضها كروميوم — كما على جهازه');
    /**
     * A cookie missing `domain`/`path`: it DECRYPTS perfectly, so the loader's
     * own guard never fires, and `newContext({ storageState })` throws. One bad
     * cookie on disk used to mean: no panel browser, on every run, for ever.
     */
    const poisoned = writeSavedState(SID, { cookies: [{ name: 'joe', value: '1' }], origins: [] });
    check('الحالة المسمومة مكتوبة على القرص', fs.existsSync(poisoned));

    const t1 = Date.now();
    let s1: any = null, err1 = '';
    try { s1 = await mgr.getBrowserSession(SID); } catch (e: any) { err1 = String(e?.message || e); }
    check('الجلسة قامت رغم الحالة الفاسدة', !!s1?.page, err1.slice(0, 160));
    check('ولم تُبقِ الملف الفاسد ليقتل الجلسة التالية', !fs.existsSync(poisoned), poisoned);
    console.log(`   ℹ️ الإقلاع استغرق ${Date.now() - t1}ms`);

    console.log('\n[2] والفحص يجري داخل هذه الجلسة — لا في متصفّح خاصّ');
    const seen1: string[] = [];
    const a1 = await auditBuiltApp(dist, { timeoutMs: 30_000, watchSessionId: SID, onProgress: (m: string) => seen1.push(m) });
    check('الفحص جرى', !a1.skipped, String(a1.skipped));
    check('واستعار لوحة المتصفّح فعلاً', seen1.includes('watching'), seen1.join(' · ') || 'لا شيء');
    check('ولم يسقط إلى متصفّح خاصّ', !seen1.some(m => m.startsWith('private')), seen1.join(' · '));
    await mgr.stopSession(SID);

    console.log('\n[3] وإقلاع بواجهة رسومية على جهاز بلا شاشة — لا يقتل اللوحة أيضاً');
    process.env.BROWSER_HEADED = 'true';
    const t3 = Date.now();
    let s3: any = null, err3 = '';
    try { s3 = await mgr.getBrowserSession(SID); } catch (e: any) { err3 = String(e?.message || e); }
    delete process.env.BROWSER_HEADED;
    check('الجلسة قامت رغم الوضع المرئي', !!s3?.page, err3.slice(0, 200));
    console.log(`   ℹ️ ${Date.now() - t3}ms — ${s3?.page ? 'حيّة' : 'ميتة'}`);
    const a3 = await auditBuiltApp(dist, { timeoutMs: 30_000, watchSessionId: SID });
    check('والفحص جرى داخلها', !a3.skipped && a3.score > 0, `${a3.score}/100 ${a3.skipped || ''}`);
    await mgr.stopSession(SID);

    console.log('\n[4] وإن تعذّر فعلاً — يُقال السبب، ولا دعوة للمشاهدة بعده');
    // Break the borrow itself: the audit resolves the manager through require()
    // at call time, so the module's cache entry is the honest injection point.
    const id = require.resolve('../../modules/browser/manager');
    const real = require.cache[id]!.exports;
    require.cache[id]!.exports = {
        ...real,
        getBrowserSession: async () => { throw new Error('storage state is not valid: cookie without domain'); },
    };
    const seen4: string[] = [];
    const a4 = await auditBuiltApp(dist, { timeoutMs: 30_000, watchSessionId: SID, onProgress: (m: string) => seen4.push(m) });
    require.cache[id]!.exports = real;

    console.log(`   ℹ️ الأحداث: ${seen4.join(' · ') || 'لا شيء'}`);
    check('الفحص لم يتوقف — جرى في متصفّح خاصّ', !a4.skipped, String(a4.skipped));
    const priv = seen4.find(m => m.startsWith('private')) || '';
    check('وأعلن أنه خاصّ', !!priv, seen4.join(' · '));
    check('ومعه السبب الحقيقي لا كلمة مبهمة', /cookie without domain/.test(priv), priv);
    check('ولم يدّعِ أنه في اللوحة', !seen4.includes('watching'), seen4.join(' · '));

    // …and the build's own handler must stay silent afterwards. The 'pressing'
    // event is what printed «👁️ Watch it happen» three seconds after «🔒».
    const R = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    check('وحدث الضغط لا يتكلّم إلا إذا كان مرئياً فعلاً',
        /if \(where === 'pressing' && auditVisible\)/.test(R) && /auditVisible = false;/.test(R));
    check('وحدث «watching» وحده يرفع الراية', /if \(where === 'watching'\) \{\s*\n\s*auditVisible = true;/.test(R));

    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
