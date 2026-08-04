/**
 * THE PROVIDER BUTTON SAYS ITS NAME.
 *
 * Asked for from the field: «زر المزود اريد ان يكون كتابه وليس رموز … واذا كان
 * مجاني فليكتب بجانبه free بخط صغير ورقيق».
 *
 * It was a logo plus a label clipped to ten characters — inside a button the
 * shared CSS pinned to a 28×28 square, so the text had nowhere to go and only
 * the mark was readable. «OpenRouter» rendered as «Router».
 *
 * This measures the RENDERED button in a real browser: the text it shows, its
 * width, and the computed size/weight of the «free» badge — because «صغير
 * ورقيق» is a measurement, not an opinion.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_provider_button.ts
 */
export {};
import http from 'http';
import path from 'path';
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const WEB_DIST = path.resolve(__dirname, '..', '..', '..', '..', 'web', 'dist', 'index.html');
    if (!fs.existsSync(WEB_DIST)) { console.error('❌ الواجهة غير مبنيّة'); process.exit(1); }

    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const app = createApp();
    const server = http.createServer(app);
    attachWebSocket(server);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ sub: 'btn-tester', role: 'OWNER', email: 't@local', name: 'T', picture: '' },
            process.env.JWT_SECRET as string, { expiresIn: '1d' });
        await page.addInitScript((tok: string) => {
            localStorage.setItem('token', tok);
            localStorage.setItem('user', JSON.stringify({ id: 'btn-tester', name: 'T', role: 'OWNER' }));
        }, token);
        await page.goto(`http://127.0.0.1:${port}/joe`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        for (const label of ['Set up later', 'لاحقاً', 'لاحقا']) {
            const el = page.getByText(label, { exact: false }).first();
            if (await el.count() && await el.isVisible().catch(() => false)) { await el.click(); await page.waitForTimeout(400); break; }
        }

        console.log('\n[1] الزر يكتب اسم المزوّد');
        const btn = page.locator('button.provider-btn').first();
        await btn.waitFor({ timeout: 15_000 });
        const shot = await page.evaluate(() => {
            const b = document.querySelector('button.provider-btn') as HTMLElement;
            if (!b) return null;
            const label = b.querySelector('.provider-label') as HTMLElement | null;
            const free = b.querySelector('.provider-free') as HTMLElement | null;
            // NO inner function declarations here: esbuild (through tsx) wraps
            // named functions with a __name helper that does not exist inside
            // the page, and page.evaluate dies with «__name is not defined».
            const ls = label ? getComputedStyle(label) : null;
            const fs2 = free ? getComputedStyle(free) : null;
            return {
                text: (label?.textContent || '').trim(),
                width: Math.round(b.getBoundingClientRect().width),
                labelVisible: !!label && label.getBoundingClientRect().width > 0,
                svgs: b.querySelectorAll('svg,img').length,
                title: b.getAttribute('title') || '',
                label: ls ? { size: parseFloat(ls.fontSize), weight: Number(ls.fontWeight), opacity: parseFloat(ls.opacity) } : null,
                free: fs2 ? {
                    text: (free!.textContent || '').trim(),
                    size: parseFloat(fs2.fontSize), weight: Number(fs2.fontWeight), opacity: parseFloat(fs2.opacity),
                } : null,
            };
        });
        check('الزر موجود ويعرض نصاً', !!shot?.text, JSON.stringify(shot));
        check('النص مرئي فعلاً (له عرض على الشاشة)', !!shot?.labelVisible);
        check('ولا رمز داخل الزر', shot?.svgs === 0, `${shot?.svgs} رمز`);
        check('والزر اتّسع لاسمه (تجاوز المربّع 28px القديم)', (shot?.width || 0) > 40, `${shot?.width}px`);
        check('والاسم غير مبتور', !!shot?.text && !/…|\.\.\.$/.test(shot.text), shot?.text);

        console.log('\n[2] و«free» صغيرة ورقيقة بجانبه');
        if (shot?.free) {
            check('كلمة free ظاهرة للمزوّد المجاني', shot.free.text === 'free', shot.free.text);
            check('أصغر من الاسم فعلاً', shot.free.size < (shot.label?.size || 99),
                `free ${shot.free.size}px مقابل الاسم ${shot.label?.size}px`);
            check('وأرقّ منه فعلاً', shot.free.weight < (shot.label?.weight || 999),
                `free ${shot.free.weight} مقابل ${shot.label?.weight}`);
            check('وباهتة قليلاً فلا تنافس الاسم', shot.free.opacity < 1, String(shot.free.opacity));
        } else {
            check('كلمة free ظاهرة للمزوّد المجاني', false, 'لم تُرسم أصلاً');
        }

        console.log('\n[3] وأسماء المزوّدين تُكتب كاملة');
        const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8');
        check('لا اقتطاع إلى ١٠ أحرف بعد اليوم', !/\.slice\(0, 10\)/.test(src.slice(src.indexOf('provider-label') - 900, src.indexOf('provider-label') + 400)));
        check('والاسم يُقرأ من إعداد المزوّد نفسه', /providers\[activeProvider\]\?\.name/.test(src));
        check('والمجاني وحده يحمل الشارة', /providers\[activeProvider\]\?\.isFree \? \(/.test(src));
        console.log(`  (المعروض الآن: «${shot?.text}»${shot?.free ? ' + free' : ''} — عرض ${shot?.width}px)`);
    } finally {
        await browser.close();
        server.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
