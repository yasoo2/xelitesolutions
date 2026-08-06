/**
 * A PICTURE ADDRESS THAT ONLY EXISTS ON HIS LAPTOP.
 *
 * His own preview server, answering his own build:
 *
 *     GET /project-preview/6a72…/%22C:/Users/home/OneDrive/Pictures/
 *         Screenshots/rMdxgLDt1aCSm5wlwOc9wfydlWaylEfbvu3of2u3.jpg%22   404
 *
 * Decoded, the `src` written into the delivered application was:
 *
 *     "C:/Users/home/OneDrive/Pictures/Screenshots/rMdx….jpg"
 *
 * Two defects in one string: a value that kept the quotation marks it was
 * quoted with, and a filesystem path used as a web address. It cannot load for
 * a visitor, and — as the 404 shows — it did not load for him either.
 *
 * Measured here:
 *
 *   [1] the rule recognises his exact string, and leaves real addresses alone
 *   [2] a whole assembled content object is cleaned, at every depth
 *   [3] a REAL browser proves the consequence: the old address 404s, the
 *       replacement paints
 *   [4] and the React builder applies it before it writes a single file
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_local_image_paths.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** His, character for character. */
const HIS = '"C:/Users/home/OneDrive/Pictures/Screenshots/rMdxgLDt1aCSm5wlwOc9wfydlWaylEfbvu3of2u3.jpg"';

async function main() {
    const images = await import('../../core/design/images');
    const { isUnservableImageSrc, unquoteSrc, safeImageSrc, sanitizeContentImages, gradientPlaceholder } = images;

    console.log('\n[1] القاعدة تعرف عنوانه بالضبط — ولا تمسّ العناوين الحقيقية');
    check('العنوان الذي فشل عنده يُرفض', isUnservableImageSrc(unquoteSrc(HIS)), unquoteSrc(HIS).slice(0, 50));
    check('والاقتباس يُنزع عنه', !unquoteSrc(HIS).startsWith('"'), unquoteSrc(HIS).slice(0, 20));
    check('وحتى المُرمّز %22 يُنزع', unquoteSrc('%22C:/x.jpg%22') === 'C:/x.jpg', unquoteSrc('%22C:/x.jpg%22'));

    for (const bad of ['C:\\Users\\home\\a.png', 'file:///C:/x.jpg', '\\\\nas\\share\\a.jpg',
        '/home/user/a.jpg', '/Users/younes/b.png', 'D:/photos/c.webp']) {
        check(`يُرفض: ${bad}`, isUnservableImageSrc(bad));
    }
    for (const good of ['/artifacts/images/hero.jpg', '/hero.jpg', 'images/x.png', './a.jpg',
        'https://images.example.com/x.jpg', 'data:image/svg+xml;base64,AAA', '//cdn.example.com/a.png']) {
        check(`يمرّ كما هو: ${good.slice(0, 40)}`, !isUnservableImageSrc(good));
    }

    const grad = gradientPlaceholder('hero', 200);
    const verdict = safeImageSrc(HIS, grad);
    check('والبديل تدرّج لوني لا فراغ', verdict.src === grad && verdict.changed, verdict.why || '');
    check('ويقول سبب الاستبدال', /local path/.test(String(verdict.why)), String(verdict.why));
    check('وعنوان سليم يبقى كما هو بلا تغيير',
        safeImageSrc('/artifacts/images/a.jpg', grad).src === '/artifacts/images/a.jpg');

    console.log('\n[2] ومحتوى كامل يُنظَّف على كل عمق');
    const content: any = {
        brand: 'متجري',
        heroImage: { src: HIS, alt: 'الواجهة' },
        menu: [{ name: 'قهوة', img: { src: 'C:\\Users\\home\\coffee.jpg', alt: 'قهوة' } },
        { name: 'شاي', img: { src: '/artifacts/images/tea.jpg', alt: 'شاي' } }],
        products: [{ name: 'كيس', img: { src: 'https://example.com/bag.jpg', alt: 'كيس' } }],
        team: [{ name: 'يونس', img: { src: '  "/home/user/me.png"  ', alt: 'يونس' } }],
        testimonials: [{ img: { src: 'data:image/svg+xml;base64,AA', alt: 'ضيف' } }],
    };
    const notes = sanitizeContentImages(content, 200);
    check('استبدل الثلاثة المعطوبة فقط', notes.length === 3, `${notes.length}: ${notes.join(' | ').slice(0, 120)}`);
    check('صورة الواجهة استُبدلت', content.heroImage.src.startsWith('data:image/svg'), content.heroImage.src.slice(0, 30));
    check('وصورة الطبق الويندوزية استُبدلت', content.menu[0].img.src.startsWith('data:image/svg'));
    check('وصورة الفريق المقتبسة استُبدلت', content.team[0].img.src.startsWith('data:image/svg'));
    check('والصورة الحقيقية من الأرشيف لم تُمسّ', content.menu[1].img.src === '/artifacts/images/tea.jpg');
    check('والصورة البعيدة لم تُمسّ', content.products[0].img.src === 'https://example.com/bag.jpg');
    check('وdata: لم تُمسّ', content.testimonials[0].img.src.startsWith('data:image/svg+xml;base64,AA'));

    console.log('\n[3] وفي متصفّح حقيقي: العنوان القديم يُخفق، والبديل يُرسم');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-imgsrc-'));
    fs.writeFileSync(path.join(work, 'old.html'),
        `<!doctype html><meta charset="utf-8"><body><img id="p" src=${HIS} alt="x"></body>`, 'utf-8');
    fs.writeFileSync(path.join(work, 'new.html'),
        `<!doctype html><meta charset="utf-8"><body><img id="p" src="${verdict.src}" alt="x"></body>`, 'utf-8');
    const server = http.createServer((req, res) => {
        const file = path.join(work, (req.url || '/').split('?')[0].replace(/^\//, '') || 'old.html');
        if (!file.startsWith(work) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('no'); }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(file));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    const { chromium } = await import('playwright');
    const { findChromiumExecutable } = await import('../../modules/browser/manager');
    const exe = findChromiumExecutable();
    const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    const page = await browser.newPage();
    const failed: string[] = [];
    page.on('response', (r: any) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(-50)}`); });

    await page.goto(base + '/old.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const oldPainted = await page.evaluate(() => {
        const i = document.getElementById('p') as HTMLImageElement | null;
        return { complete: !!i?.complete, natural: i?.naturalWidth || 0 };
    });
    check('العنوان القديم لا يُحمّل — بالضبط كما في سجلّه', oldPainted.natural === 0,
        `naturalWidth=${oldPainted.natural} · ${failed.slice(0, 1).join('')}`);

    failed.length = 0;
    await page.goto(base + '/new.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const newPainted = await page.evaluate(() => {
        const i = document.getElementById('p') as HTMLImageElement | null;
        return { natural: i?.naturalWidth || 0 };
    });
    check('والبديل يُرسم فعلاً على الصفحة', newPainted.natural > 0, `naturalWidth=${newPainted.natural}`);
    check('وبلا طلب فاشل واحد', failed.length === 0, failed.slice(0, 2).join(' | '));
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log('\n[4] والبنّاء يطبّقها قبل أن يكتب ملفاً واحداً');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    const call = src.indexOf('sanitizeContentImages(content');
    const write = src.indexOf("'src/content.js': fileContentJs(content)");
    const photos = src.indexOf('buildNavLinks();', src.indexOf('resolveImages'));
    check('البنّاء يستدعيها', call > 0);
    check('بعد أن تُحسم الصور', call > photos && photos > 0, `${photos} → ${call}`);
    check('وقبل كتابة المحتوى إلى القرص', call < write, `${call} < ${write}`);
    check('ويقول للمستخدم ماذا استبدل', /عنوان صورة كان يشير إلى ملف على جهازك/.test(src));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
