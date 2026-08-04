/**
 * WHO OWNS THIS INSTALLATION — the race, run for real.
 *
 * Joe is about to go online for users worldwide, and every sign-up path
 * decided ownership with `count === 0 ? 'OWNER' : 'USER'`. Whoever registered
 * FIRST on an empty database became the owner, and OWNER means super admin.
 * On a public deployment that is a race against the internet: a scanner that
 * finds a fresh install and POSTs /api/auth/register once owns the platform,
 * and the real owner arrives as an ordinary user. The «registration is
 * closed» switch did not help — it explicitly exempted the first user.
 *
 * This proof plays the race out against the REAL server, from a REAL remote
 * address (the container's own LAN IP, not loopback, so the request is a
 * stranger's as far as the server is concerned):
 *
 *   1. a stranger registers FIRST on an empty install → must be USER, and
 *      must be refused by the admin API;
 *   2. the operator's own address registers SECOND → must be OWNER and must
 *      be let in;
 *   3. with no allowlist configured at all, a REMOTE first user must still
 *      not become owner — while the same request from the machine itself
 *      still may, so a developer is not locked out of their own laptop.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_owner_bootstrap.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.REGISTRATION_OPEN = 'true';   // the honest worst case: sign-ups allowed

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const OWNER = 'younes.sowady2011@gmail.com';
const STRANGER = 'first-to-arrive@example.com';
const STORE = path.join(process.cwd(), 'data', 'db', 'users.json');

/** A non-loopback address of this machine — the server must see a stranger. */
function remoteAddress(): string | null {
    for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list || []) {
            if (ni.family === 'IPv4' && !ni.internal) return ni.address;
        }
    }
    return null;
}

async function main() {
    const remote = remoteAddress();
    if (!remote) { console.error('no non-loopback address on this machine — cannot play the stranger'); process.exit(1); }
    console.log(`      (عنوان «الغريب»: ${remote} — والخادم يراه غير محلّي)`);

    const backup = fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf-8') : null;
    const resetUsers = () => fs.writeFileSync(STORE, '[]');

    const { createApp } = await import('../../api/app');
    const server = http.createServer(createApp());
    server.listen(0, '0.0.0.0');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;

    /** Register through the machine's LAN address = a remote stranger. */
    const register = async (email: string, from: 'remote' | 'local') => {
        const host = from === 'remote' ? remote : '127.0.0.1';
        const r = await fetch(`http://${host}:${port}/api/auth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'a-real-password-123' }),
        });
        return { status: r.status, body: await r.json().catch(() => null) as any };
    };
    const login = async (email: string) => {
        const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'a-real-password-123' }),
        });
        return { status: r.status, body: await r.json().catch(() => null) as any };
    };
    const adminReach = async (token: string) => (await fetch(`http://127.0.0.1:${port}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${token}` },
    })).status;

    try {
        console.log('\n[1] السباق: غريب يسجّل أولاً على تنصيب فارغ — والمالك معرّف في البيئة');
        process.env.SUPER_ADMIN_EMAILS = OWNER;
        resetUsers();

        const stranger = await register(STRANGER, 'remote');
        check('الغريب سُجّل فعلاً (لم نمنع التسجيل، منعنا الملكية)', stranger.status === 201, String(stranger.status));
        check('…لكنه USER لا OWNER — رغم أنه الأول', stranger.body?.role === 'USER', JSON.stringify(stranger.body));
        const strangerToken = (await login(STRANGER)).body?.token || '';
        check('…وباب لوحة الإدارة مغلق أمامه (403)', await adminReach(strangerToken) === 403,
            String(await adminReach(strangerToken)));

        console.log('\n[2] ثم يسجّل المالك — بعده بوقت، ومن أي مكان');
        const owner = await register(OWNER, 'remote');
        check('المالك يُمنح OWNER لأنه في القائمة، لا لأنه سبق', owner.body?.role === 'OWNER', JSON.stringify(owner.body));
        const ownerToken = (await login(OWNER)).body?.token || '';
        check('…ولوحة الإدارة تفتح له (200)', await adminReach(ownerToken) === 200,
            String(await adminReach(ownerToken)));

        console.log('\n[3] وبلا قائمة أصلاً: الغريب لا يرث المنصّة، والمطوّر المحلّي يبقى قادراً');
        delete process.env.SUPER_ADMIN_EMAILS;
        delete process.env.ADMIN_EMAIL;
        resetUsers();
        const remoteFirst = await register('remote-first@example.com', 'remote');
        check('أول مسجّل عن بُعد بلا قائمة → USER (كان OWNER)', remoteFirst.body?.role === 'USER',
            JSON.stringify(remoteFirst.body));

        resetUsers();
        const localFirst = await register('dev@joe.local', 'local');
        check('أول مسجّل من الجهاز نفسه → OWNER (حتى لا ينكسر التطوير المحلّي)',
            localFirst.body?.role === 'OWNER', JSON.stringify(localFirst.body));

        console.log('\n[4] والباب المقفل صار مقفلاً فعلاً');
        process.env.REGISTRATION_OPEN = 'false';
        process.env.SUPER_ADMIN_EMAILS = OWNER;
        resetUsers();
        const sneak = await register('sneaky@example.com', 'remote');
        check('«التسجيل مغلق» يمنع حتى أول مستخدم (كان يستثنيه صراحةً)',
            sneak.status === 403, `${sneak.status} ${JSON.stringify(sneak.body)}`);
        const ownerStill = await register(OWNER, 'remote');
        check('…والمالك المُعرَّف يمرّ رغم الإغلاق', ownerStill.status === 201 && ownerStill.body?.role === 'OWNER',
            `${ownerStill.status} ${JSON.stringify(ownerStill.body)}`);
    } finally {
        server.close();
        if (backup !== null) fs.writeFileSync(STORE, backup);
        else { try { fs.unlinkSync(STORE); } catch { } }
        console.log('      (أُعيد مخزن المستخدمين إلى ما كان عليه)');
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
