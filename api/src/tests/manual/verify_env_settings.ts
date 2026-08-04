/**
 * THE SETTINGS SCREEN — proven against its own dangers.
 *
 * The owner asked to set environment variables from Joe's panel instead of
 * hand-editing api/.env. That is the right feature and the most dangerous
 * screen in the product: a page that writes the environment steers the
 * process. So the proof is mostly a list of things it must REFUSE.
 *
 *   - an ordinary admin must not reach it at all (owner only);
 *   - a name outside the registry must be refused BY NAME — with a free key
 *     field, `NODE_OPTIONS=--require /tmp/evil.js` is remote code execution
 *     on the next boot and nothing on screen would look wrong;
 *   - a value carrying a newline must be refused: it would write a SECOND
 *     assignment into .env, which is the classic injection through a form;
 *   - a secret written must never come back out;
 *   - removing your own address from the owner list must be refused, because
 *     the save would lock you out of the screen that could undo it;
 *   - opening auth bypass in production must be refused;
 *   - rotating the session key must require an explicit confirmation;
 *   - a saved live value must ACTUALLY take effect, and the file must keep
 *     its comments, its other keys, mode 0600, and a backup.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_env_settings.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.NODE_ENV = 'development';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const OWNER = 'owner@joe.local';
const ENV_FILE = path.join(process.cwd(), '.env');
const SENTINEL = '# سطر يجب ألا يختفي أبداً\nUNRELATED_KEY_KEEP_ME=untouched\n';

async function main() {
    process.env.SUPER_ADMIN_EMAILS = OWNER;
    const hadEnv = fs.existsSync(ENV_FILE);
    const original = hadEnv ? fs.readFileSync(ENV_FILE, 'utf-8') : null;
    fs.writeFileSync(ENV_FILE, `${SENTINEL}GROQ_API_KEY=old-value-1234\n`, { mode: 0o600 });

    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}/api/admin/env`;

    const tokenFor = (role: string, email: string) => jwt.sign({ sub: `${role}-${email}`, role, email }, process.env.JWT_SECRET!);
    const ownerToken = tokenFor('OWNER', OWNER);
    const adminToken = tokenFor('SUPER_ADMIN', 'promoted-admin@example.com');

    const get = async (token: string) => {
        const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
        return { status: r.status, body: await r.json().catch(() => null) as any };
    };
    const post = async (token: string, changes: any, confirm?: string) => {
        const r = await fetch(base, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes, confirm }),
        });
        return { status: r.status, body: await r.json().catch(() => null) as any };
    };

    try {
        console.log('\n[1] من يصل إلى الشاشة أصلاً');
        const anon = await fetch(base);
        check('بلا توكن → 401', anon.status === 401, String(anon.status));
        const asAdmin = await get(adminToken);
        check('مدير عادي (SUPER_ADMIN مُرقّى) → 403: يدير النظام ولا يعدّل بيئته',
            asAdmin.status === 403 && asAdmin.body?.error === 'owner_only', `${asAdmin.status}`);
        const asOwner = await get(ownerToken);
        check('المالك → 200 مع قائمة الإعدادات', asOwner.status === 200 && Array.isArray(asOwner.body?.settings),
            String(asOwner.status));
        console.log(`      (${asOwner.body?.settings?.length} مفتاحاً معروفاً، والملف ${asOwner.body?.file})`);

        console.log('\n[2] الأسرار تُكتب ولا تُقرأ');
        const groq = asOwner.body.settings.find((x: any) => x.key === 'GROQ_API_KEY');
        check('المفتاح المضبوط يظهر كمقنّع فقط', groq?.set === true && /^••••/.test(groq?.preview || ''), JSON.stringify(groq));
        check('…ولا تظهر قيمته الحقيقية في الرد إطلاقاً',
            !JSON.stringify(asOwner.body).includes('old-value-1234'));

        console.log('\n[3] ما يجب أن تُرفض');
        const rce = await post(ownerToken, { NODE_OPTIONS: '--require /tmp/evil.js' });
        check('اسم خارج القائمة يُرفض بالاسم (NODE_OPTIONS = تنفيذ شيفرة)',
            rce.status === 400 && rce.body?.error === 'unknown_key', `${rce.status} ${JSON.stringify(rce.body)}`);
        const injection = await post(ownerToken, { PUBLIC_URL: 'http://ok.com\nENABLE_AUTH_BYPASS=true' });
        check('قيمة تحمل سطراً جديداً تُرفض (كانت ستكتب تعييناً ثانياً في الملف)',
            injection.status === 400 && injection.body?.error === 'invalid_value', String(injection.status));
        const badUrl = await post(ownerToken, { LOCAL_LLM_BASE_URL: 'not-a-url' });
        check('قيمة لا تطابق نوعها تُرفض', badUrl.status === 400, String(badUrl.status));
        const lockout = await post(ownerToken, { SUPER_ADMIN_EMAILS: 'someone-else@example.com' });
        check('حذف بريدك من قائمة المالكين يُرفض — كان سيقفل الشاشة في وجهك',
            lockout.status === 400 && lockout.body?.error === 'would_lock_you_out', JSON.stringify(lockout.body));
        const jwtNoConfirm = await post(ownerToken, { JWT_SECRET: 'a-brand-new-secret' });
        check('تدوير مفتاح الجلسات بلا تأكيد صريح يُرفض',
            jwtNoConfirm.status === 400 && jwtNoConfirm.body?.error === 'confirmation_required', String(jwtNoConfirm.status));

        // Sent as ONE change set — the guard must judge the environment the save
        // would PRODUCE, not the one the server happens to be in. (Flipping
        // NODE_ENV on the live process instead would trip Joe's own
        // «production without a database» gate and prove nothing about this.)
        const bypass = await post(ownerToken, { NODE_ENV: 'production', ENABLE_AUTH_BYPASS: 'true' });
        check('فتح تجاوز المصادقة مع تحويل البيئة إلى إنتاج يُرفض — يُحكَم على النتيجة لا على الحاضر',
            bypass.status === 400 && bypass.body?.error === 'unsafe_in_production',
            `${bypass.status} ${JSON.stringify(bypass.body)}`);

        console.log('\n[4] وما يجب أن ينجح — ويسري فعلاً');
        const before = process.env.PUBLIC_URL;
        const save = await post(ownerToken, { PUBLIC_URL: 'https://joe.example.com', GROQ_API_KEY: 'gsk-new-secret-9999' });
        check('الحفظ ينجح ويقول ما سرى وما ينتظر إعادة التشغيل',
            save.status === 200 && Array.isArray(save.body?.appliedNow), JSON.stringify(save.body?.message));
        check('القيمة الحيّة سرت في العملية فوراً — بلا إعادة تشغيل',
            process.env.PUBLIC_URL === 'https://joe.example.com' && before !== process.env.PUBLIC_URL,
            String(process.env.PUBLIC_URL));

        const onDisk = fs.readFileSync(ENV_FILE, 'utf-8');
        check('كُتبت في الملف فعلاً', onDisk.includes('PUBLIC_URL=https://joe.example.com'));
        check('والمفتاح القديم استُبدل لا كُرّر',
            (onDisk.match(/^GROQ_API_KEY=/gm) || []).length === 1 && onDisk.includes('gsk-new-secret-9999'));
        check('وبقيّة الملف لم تُمَسّ — تعليقاته ومفاتيحه الأخرى',
            onDisk.includes('UNRELATED_KEY_KEEP_ME=untouched') && onDisk.includes('# سطر يجب ألا يختفي أبداً'));
        const backups = fs.readdirSync(path.dirname(ENV_FILE)).filter(f => f.startsWith('.env.backup-'));
        check('ونسخة احتياطية أُخذت قبل الكتابة', backups.length > 0, `${backups.length}`);
        if (os.platform() !== 'win32') {
            const mode = (fs.statSync(ENV_FILE).mode & 0o777).toString(8);
            check('والملف بصلاحية 600 — لا يقرؤه غير مالكه', mode === '600', mode);
        }

        const after = await get(ownerToken);
        const groqAfter = after.body.settings.find((x: any) => x.key === 'GROQ_API_KEY');
        check('وبعد الحفظ لا يعود السرّ الجديد للمتصفّح أيضاً',
            !JSON.stringify(after.body).includes('gsk-new-secret-9999') && /^••••/.test(groqAfter?.preview || ''),
            groqAfter?.preview);

        console.log('\n[5] والتأكيد الصريح يمرّ حين يُرسَل');
        const rotated = await post(ownerToken, { JWT_SECRET: 'a-brand-new-secret-value' }, 'rotate-jwt');
        check('تدوير المفتاح بالتأكيد ينجح ويُوسَم «يحتاج إعادة تشغيل»',
            rotated.status === 200 && rotated.body?.needsRestart?.includes('JWT_SECRET'),
            JSON.stringify(rotated.body));
        check('…ولم يُطبَّق على العملية الجارية (وإلا سقطت جلستك في منتصف الحفظ)',
            process.env.JWT_SECRET === 'x', String(process.env.JWT_SECRET));
    } finally {
        server.close();
        for (const f of fs.readdirSync(path.dirname(ENV_FILE)).filter(f => f.startsWith('.env.backup-'))) {
            try { fs.unlinkSync(path.join(path.dirname(ENV_FILE), f)); } catch { }
        }
        if (original !== null) fs.writeFileSync(ENV_FILE, original);
        else { try { fs.unlinkSync(ENV_FILE); } catch { } }
        console.log('      (أُعيد ملف البيئة إلى ما كان عليه، وحُذفت النسخ المؤقتة)');
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
