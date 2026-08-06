/**
 * «القائمة مغلقة… وحجمها غير ملائم لدردشة جو… ومتداخلة مع الحدود»
 *
 * Three faults in one screenshot of the live card:
 *
 *   · it showed «3 steps ▾» and stayed SHUT — the timeline only opened from
 *     four steps up, so a run with three hid everything it had;
 *   · it was sized for a page, not for a chat;
 *   · and it overlapped its container's border on both sides.
 *
 * The first version of this proof measured the card against its IMMEDIATE
 * PARENT only — and passed, while his screenshot still showed the card crossing
 * the chat's border. It could not have seen the fault: the overflow was BORN in
 * that parent (a `width: 100%` column sharing a flex row with a 30px avatar), so
 * card-vs-parent was always 0. The measurement now walks the WHOLE chain up to
 * the viewport and names whichever element crosses its own container.
 *
 * Measured in a real browser:
 *
 *   [1] with steps arriving, the card is OPEN — the details are visible
 *   [2] it never exceeds the width it was given
 *   [3] no element between the card and the viewport crosses its container,
 *       and the card stays inside the CHAT's borders
 *   [4] and a long goal line is truncated instead of stretching the card
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_neural_card_fits.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** His own headline, at his own length. */
const GOAL = 'Initializing Autonomous Brain for goal: Build a world-class e-commerce platform similar to Shopify. Features: Multi-vendor marketplace AI product generation Inventory management Payments';

async function main() {
    const webDist = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist');
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
        console.error('❌ ابنِ الواجهة أولاً: npm run build داخل web');
        process.exit(1);
    }

    console.log('\n[0] واجهة جو الحقيقية في متصفّح حقيقي');
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast, broadcastThinkingPhase, broadcastThinkingDetail } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
    const shim = () => page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });

    await page.goto(base + '/joe', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shim();
    try { await page.getByRole('button', { name: /ضيف/ }).click({ timeout: 8000 }); await page.waitForTimeout(3000); } catch { /* reported below */ }
    try {
        const overlay = page.locator('.dialog-overlay');
        if (await overlay.count()) { await overlay.first().click({ position: { x: 6, y: 6 }, timeout: 4000 }); await page.waitForTimeout(600); }
    } catch { /* no modal */ }
    await shim();

    const sessions: any[] = (global as any).mockSessions || [];
    const sid = String(sessions[0]?.id || sessions[0]?._id || '');
    check('الجلسة معروفة', !!sid, sid || 'لا جلسة');
    if (!sid) { await browser.close(); server.close(); process.exit(1); }

    console.log('\n[1] ثلاث خطوات فقط — كما في لقطته — والبطاقة يجب أن تكون مفتوحة');
    broadcast({ type: 'run_started', sessionId: sid, data: { sessionId: sid } } as any);
    await page.waitForTimeout(400);
    broadcastThinkingPhase(sid, 'analyzing', GOAL);
    await page.waitForTimeout(500);
    broadcastThinkingDetail(sid, 'قرأت الطلب وحدّدت نوعه: منصّة تجارة');
    await page.waitForTimeout(500);
    broadcastThinkingDetail(sid, 'npm install — 148 packages');
    await page.waitForTimeout(900);
    await shim();

    const m = await page.evaluate(() => {
        const card = document.querySelector('.neural-card') as HTMLElement | null;
        if (!card) return null;
        const parent = card.parentElement as HTMLElement;
        const c = card.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        const cs = getComputedStyle(card);
        const name = (el: HTMLElement) =>
            `${el.tagName.toLowerCase()}${(el.className || '').toString().trim() ? '.' + (el.className || '').toString().trim().split(/\s+/).join('.') : ''}`;

        // Every element from the card up to <body>, measured against ITS OWN
        // container. One offender anywhere on this chain is what he sees.
        const chain: any[] = [];
        let el: HTMLElement | null = card;
        while (el && el !== document.body && chain.length < 20) {
            const par = el.parentElement as HTMLElement | null;
            if (!par) break;
            const r = el.getBoundingClientRect(), pr = par.getBoundingClientRect();
            chain.push({
                el: name(el), parent: name(par),
                over: Math.max(Math.round(pr.left - r.left), Math.round(r.right - pr.right)),
                w: Math.round(r.width), pw: Math.round(pr.width),
            });
            el = par;
        }
        const chat = document.querySelector('.joe-chat-messages') as HTMLElement | null;
        const cr = chat?.getBoundingClientRect();
        return {
            open: !!card.querySelector('.jt-timeline'),
            steps: card.querySelectorAll('.jt-step').length,
            cardW: Math.round(c.width), parentW: Math.round(p.width),
            overflowStart: Math.round(p.left - c.left), overflowEnd: Math.round(c.right - p.right),
            boxSizing: cs.boxSizing,
            scrollW: card.scrollWidth, clientW: card.clientWidth,
            headline: (card.querySelector('.nc-line') as HTMLElement | null)?.getBoundingClientRect().width || 0,
            bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
            chain,
            worst: chain.reduce((a, b) => (b.over > a.over ? b : a), { el: '—', over: -9999 }),
            chatW: cr ? Math.round(cr.width) : 0,
            outOfChatStart: cr ? Math.round(cr.left - c.left) : 0,
            outOfChatEnd: cr ? Math.round(c.right - cr.right) : 0,
            // The card should end exactly where a normal reply ends — it lives
            // in the SAME column, not in a wider one of its own.
            rowGapEnd: (() => {
                const row = card.closest('.joe-message') as HTMLElement | null;
                if (!row) return 0;
                const rr = row.getBoundingClientRect();
                return Math.round(Math.abs(rr.right - c.right));
            })(),
        };
    });
    check('البطاقة ظاهرة', !!m, 'لا بطاقة');
    if (!m) { await browser.close(); server.close(); process.exit(1); }
    console.log(`   ℹ️ عرض البطاقة ${m.cardW}px داخل حاوية ${m.parentW}px — خطوات: ${m.steps}`);

    check('مفتوحة بثلاث خطوات — لا «3 steps ▾» مغلقة', m.open === true && m.steps >= 3, `open=${m.open} steps=${m.steps}`);

    console.log('\n[2] وحجمها لا يتجاوز ما أُعطي لها');
    check('لا تتعدّى عرض حاويتها', m.cardW <= m.parentW + 1, `${m.cardW} ≤ ${m.parentW}`);
    check('وbox-sizing يمنع الحشوة من دفعها', m.boxSizing === 'border-box', m.boxSizing);
    check('ولا تفيض أفقياً داخل نفسها', m.scrollW <= m.clientW + 1, `${m.scrollW} ≤ ${m.clientW}`);

    console.log('\n[3] ولا تتداخل مع الحدود — لا هي ولا أيّ حاوية فوقها');
    for (const link of m.chain) console.log(`   ↳ ${link.el} داخل ${link.parent}: ${link.w}px/${link.pw}px — تجاوز ${link.over}px`);
    check('لا تخرج من الحافة الأولى', m.overflowStart <= 1, `${m.overflowStart}px`);
    check('ولا من الحافة الثانية', m.overflowEnd <= 1, `${m.overflowEnd}px`);
    // The fault his screenshot showed was BORN one level above the card, where
    // the old proof could not see it.
    check('ولا أيّ حاوية بين البطاقة والصفحة تتجاوز حدّها',
        m.worst.over <= 1, `${m.worst.el} تتجاوز ${m.worst.over}px`);
    check('والبطاقة داخل حدود الدردشة نفسها',
        m.outOfChatStart <= 1 && m.outOfChatEnd <= 1,
        `بداية ${m.outOfChatStart}px · نهاية ${m.outOfChatEnd}px (الدردشة ${m.chatW}px)`);
    check('والصفحة نفسها لا تنزلق أفقياً', m.bodyOverflowX <= 1, `${m.bodyOverflowX}px`);

    console.log('\n[4] وعنوان طويل يُقصّ ولا يمدّها');
    check('سطر العنوان داخل البطاقة', m.headline > 0 && m.headline <= m.cardW, `${Math.round(m.headline)} ≤ ${m.cardW}`);
    check('وتنتهي حيث ينتهي أيّ ردّ عادي — نفس عمود المحادثة', m.rowGapEnd <= 2, `فرق ${m.rowGapEnd}px`);

    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
