/**
 * Turns the internal engineering report into a small delivery answer.
 * The complete report remains available to the technical Logs surface.
 */
export function isEngineeringReport(markdown: string): boolean {
    const source = String(markdown || '');
    return /Joe Engineering Execution Report|Self-QA in the Browser panel|Project files|npm install\s*\+\s*vite build succeeded|تقرير تنفيذ جو|فحص المتصفح/i.test(source);
}

export function summarizeEngineeringReport(markdown: string, language = 'en'): string {
    const source = String(markdown || '').trim();
    if (!source) return '';

    const isArabic = String(language).toLowerCase().startsWith('ar');
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    const title = first.match(/[—-]\s*["«]([^"»]+)["»]/)?.[1]?.trim() || '';
    const scoreMatch = source.match(/(?:Self-QA|تدقيق[^\n]*|جودة[^\n]*).*?(\d{1,3})\s*\/\s*100/i);
    const score = scoreMatch?.[1] || '';
    const pages = Array.from(source.matchAll(/(?:page|صفحة)\s*[«"]([^»"]+)[»"]/gi))
        .map(match => match[1].trim())
        .filter((page, index, all) => page && all.indexOf(page) === index)
        .slice(0, 8);

    const issueLines = lines
        .filter(line => /^[-•*]\s*/.test(line))
        .map(line => line.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '').trim())
        .filter(line => /unresponsive|does not exist|tap target|horizontal scrolling|controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|لا يستجيب|غير موجود|صغير|تمرير أفقي|لم أصل|لا يمكن الوصول|خطأ|عطل/i.test(line))
        .map(line => {
            if (/unresponsive|navigation link/i.test(line)) return isArabic ? 'بعض روابط التنقل لا تستجيب بعد.' : 'Some navigation links still need attention.';
            if (/does not exist/i.test(line)) return isArabic ? 'بعض الروابط تشير إلى أقسام غير موجودة.' : 'Some links point to sections that are not present.';
            if (/tap target|hard to hit|صغير/i.test(line)) return isArabic ? 'يوجد عنصر صغير على شاشة الهاتف ويحتاج تكبيرًا.' : 'One mobile tap target needs to be larger.';
            if (/horizontal scrolling|تمرير أفقي/i.test(line)) return isArabic ? 'يوجد تمرير أفقي على شاشة الهاتف ويحتاج إصلاحًا.' : 'Horizontal scrolling needs to be fixed on a phone.';
            if (/controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|لم أصل|لا يمكن الوصول/i.test(line)) return isArabic ? 'بعض عناصر الواجهة لم تصل إليها جولة الاختبار؛ يلزم إعادة التحقق.' : 'Some controls were not reached by the test and need another verification pass.';
            return isArabic ? 'بقيت ملاحظة في فحص الجودة.' : 'One quality finding remains.';
        })
        .filter((line, index, all) => all.indexOf(line) === index)
        .slice(0, 3);

    const buildVerified = /verified to compile|تُحقق من تجميعه|vite build succeeded|نجحا/i.test(source);
    const checked = source.match(/\((\d+)\s+page\(s\),\s*(\d+)\s+control\(s\)[^)]*\)/i);

    if (isArabic) {
        const heading = title ? `## تم التسليم: ${title}` : '## ملخص التسليم';
        const result = [heading, buildVerified ? 'اكتمل البناء والتحقق من تجميع المشروع.' : 'اكتمل تنفيذ المشروع، مع وجود نقاط تحتاج متابعة.'];
        if (pages.length) result.push(`الصفحات المنفذة: ${pages.join(' · ')}.`);
        if (score) result.push(`فحص المتصفح: **${score}/100**${checked ? ` — ${checked[1]} صفحات و${checked[2]} تفاعلًا` : ''}.`);
        if (issueLines.length) {
            result.push('الملاحظات المتبقية:');
            result.push(...issueLines.map(line => `- ${line}`));
        } else if (score && Number(score) < 100) {
            result.push('توجد ملاحظات غير حاجبة في فحص المتصفح الأخير؛ تفاصيلها التقنية مسماة في Logs.');
        } else {
            result.push('لم تظهر ملاحظات حرجة في الفحص الأخير.');
        }
        result.push('', 'التفاصيل التقنية الكاملة موجودة في Logs.');
        return result.join('\n');
    }

    const heading = title ? `## Delivered: ${title}` : '## Delivery summary';
    const result = [heading, buildVerified ? 'The project was built and verified to compile.' : 'The project was implemented, with follow-up items still visible.'];
    if (pages.length) result.push(`Implemented pages: ${pages.join(' · ')}.`);
    if (score) result.push(`Browser QA: **${score}/100**${checked ? ` — ${checked[1]} pages and ${checked[2]} interactions` : ''}.`);
    if (issueLines.length) {
        result.push('Remaining findings:');
        result.push(...issueLines.map(line => `- ${line}`));
        } else if (score && Number(score) < 100) {
            result.push('The latest browser check still has non-blocking findings; the technical trace names them in Logs.');
        } else {
            result.push('No critical findings were reported in the latest check.');
        }
    result.push('', 'The complete technical trace is available in Logs.');
    return result.join('\n');
}
