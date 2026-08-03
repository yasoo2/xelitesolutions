/**
 * WIRE PROOF — the delivered-build fix pack, measured on the REAL page bytes
 * from the field (build joe-6a6ff28f1364299418639007) and the REAL browser:
 *
 *   1. The corrupted contact-section edit (literal «...» elisions, verbatim
 *      from the shipped file) is REFUSED by extractEditedSection.
 *   2. The fabricated «joe-form@1.0.0» CDN script is stripped; the page is
 *      then audited in the real browser BEFORE and AFTER — the js_errors
 *      finding its 404 causes disappears.
 *   3. The prefilled dummy contact values become placeholders.
 *
 * Run:  npx tsx src/tests/manual/verify_build_fixpack.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { extractEditedSection } = await import('../../core/design/section-editor');
    const { stripFabricatedScripts } = await import('../../core/quality/html-qa');
    const { demotePlaceholderPrefills } = await import('../../core/design/content-contract');
    const { auditVisually } = await import('../../core/quality/visual-audit');

    // ── 1. the elided edit is refused ───────────────────────────────────
    console.log('\n[1] القسم المعطوب من الميدان («...» بدل السمات) يُرفض ويبقى الأصل');
    const original: any = {
        id: 'contact', tag: 'section', index: 6, start: 0, end: 4000, headings: ['اتصل بنا'],
        html: '<section class="section" id="contact"><h2>اتصل بنا</h2>' + '<p>فقرة نصية كاملة</p>'.repeat(40) + '</section>',
    };
    // Verbatim shapes read out of the shipped index.html.
    const corrupted = '<section class="section" id="contact">\n<div class="wrap">\n<div class="section-head">\n'
        + '<span ... بنا</span>\n<h2>اتصل بنا</h2>\n</div>\n<form data-joe-form>\n'
        + '<div ... var(--space-4);">\n'
        + '<label for="name" style="display: block; margin-bottom: ...\n'
        + '<input type="text" id="name" name="name" required>\n</div>\n'
        + '<button type="submit" class="btn btn-primary" style="margin-top: ... الرسالة</button>\n'
        + '</form>\n</div>\n' + '<p>فقرة نصية كاملة</p>'.repeat(40) + '</section>';
    const refused = extractEditedSection(corrupted, original);
    check('the corrupted section is refused', refused.ok === false, JSON.stringify(refused).slice(0, 120));
    check('the reason names the elision', /elided/i.test(String(refused.reason)));
    const clean = '<section class="section" id="contact"><h2>اتصل بنا</h2>'
        + '<label for="name">الاسم</label><input type="text" id="name">'
        + '<p>فقرة نصية كاملة</p>'.repeat(40) + '</section>';
    check('a clean edit still passes', extractEditedSection(clean, original).ok === true);

    // ── 2. fabricated CDN script: strip + real-browser before/after ─────
    console.log('\n[2] سكربت CDN مُختلَق (joe-form@1.0.0) — قبل: خطأ 404 في المتصفح الحقيقي، بعد: صفحة نظيفة');
    const page = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>اختبار</title>
<style>body{background:#fff;color:#222;font-family:sans-serif}</style></head><body>
<h1>صفحة الاختبار</h1><p>نموذج التواصل أدناه.</p>
<form><input type="email" value="info@example.com"><input type="tel" value="059999999999">
<input type="text" name="city" value="عمّان"></form>
<script src="https://cdn.jsdelivr.net/npm/joe-form@1.0.0/dist/joe-form.min.js"></script>
</body></html>`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fixpack-'));
    fs.writeFileSync(path.join(tmp, 'before.html'), page);
    const stripped = stripFabricatedScripts(page);
    check('the joe-form tag is stripped', stripped.removed.length === 1 && !/joe-form/.test(stripped.html), stripped.removed.join(','));
    fs.writeFileSync(path.join(tmp, 'after.html'), stripped.html);

    const server = http.createServer((req, res) => {
        try { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(tmp, (req.url || '').replace(/^\//, '').split('?')[0]))); }
        catch { res.writeHead(404); res.end(); }
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;

    const before = await auditVisually(`${origin}/before.html`, {});
    const after = await auditVisually(`${origin}/after.html`, {});
    if (!before.ran || !after.ran) {
        console.log(`  (i) المتصفح غير متاح هنا (${before.skipped || after.skipped}) — إثبات المتصفح يتخطى، إثبات النصوص أعلاه قائم`);
    } else {
        const beforeJsErr = before.findings.some(f => f.code === 'js_errors');
        const afterJsErr = after.findings.some(f => f.code === 'js_errors');
        check('BEFORE: the real browser reports the failing external script', beforeJsErr,
            JSON.stringify(before.findings.map(f => f.code)));
        check('AFTER: the js_errors finding is gone', !afterJsErr,
            JSON.stringify(after.findings.map(f => f.code)));
        check('AFTER scores no worse than BEFORE', after.score >= before.score, `${before.score} → ${after.score}`);
    }

    // ── 3. dummy prefills become placeholders ───────────────────────────
    console.log('\n[3] القيم الوهمية المعبأة مسبقاً تصبح placeholder');
    const demoted = demotePlaceholderPrefills(stripped.html);
    check('both dummy values demoted', demoted.fixed === 2, `fixed=${demoted.fixed}`);
    check('the email became a placeholder', /placeholder="info@example\.com"/.test(demoted.html) && !/value="info@example\.com"/.test(demoted.html));
    check('the dummy phone became a placeholder', /placeholder="059999999999"/.test(demoted.html) && !/value="059999999999"/.test(demoted.html));
    check('the REAL value («عمّان») survived', /value="عمّان"/.test(demoted.html));

    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
