/**
 * Turns the internal engineering report into a small delivery answer.
 * The complete report remains available to the technical Logs surface.
 */
export function isEngineeringReport(markdown: string): boolean {
    const source = String(markdown || '');
    return /Joe Engineering Execution Report|(?:^|\n)#{0,3}\s*(?:✅\s*)?(?:Project delivered|Build stopped honestly|Accepted with gaps)\b|Self-QA in the Browser panel|Visible Browser QA|Project files|npm install\s*\+\s*vite build succeeded|تقرير تنفيذ جو|فحص المتصفح/i.test(source);
}

export function summarizeEngineeringReport(markdown: string, language = 'en'): string {
    const source = String(markdown || '').trim();
    if (!source) return '';

    const isArabic = String(language).toLowerCase().startsWith('ar');
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    const title = first.match(/[—-]\s*["«]([^"»]+)["»]/)?.[1]?.trim()
        || first.match(/Project delivered:\s*(.+)$/iu)?.[1]?.trim()
        || '';
    const scoreMatch = source.match(/Visible Browser QA[^\n]*?(\d{1,3})\s*\/\s*100/i)
        || Array.from(source.matchAll(/(?:Self-QA|تدقيق[^\n]*|جودة[^\n]*).*?(\d{1,3})\s*\/\s*100/gi)).pop();
    const score = scoreMatch?.[1] || '';
    const pages = Array.from(source.matchAll(/(?:page|صفحة)\s*[«"]([^»"]+)[»"]/gi))
        .map(match => match[1].trim())
        .filter((page, index, all) => page && all.indexOf(page) === index)
        .slice(0, 8);

    const issueLines = lines
        .filter(line => /^[-•*]\s*/.test(line))
        .map(line => line.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '').trim())
        .filter(line => /unresponsive|does not exist|tap target|horizontal scrolling|controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|I did not inspect|لم أفحص|لم أتحقق|لا يستجيب|غير موجود|صغير|تمرير أفقي|لم أصل|لا يمكن الوصول|خطأ|عطل/i.test(line))
        .map(line => {
            if (/unresponsive|navigation link/i.test(line)) return isArabic ? 'بعض روابط التنقل لا تستجيب بعد.' : 'Some navigation links still need attention.';
            if (/does not exist/i.test(line)) return isArabic ? 'بعض الروابط تشير إلى أقسام غير موجودة.' : 'Some links point to sections that are not present.';
            if (/tap target|hard to hit|صغير/i.test(line)) return isArabic ? 'يوجد عنصر صغير على شاشة الهاتف ويحتاج تكبيرًا.' : 'One mobile tap target needs to be larger.';
            if (/horizontal scrolling|تمرير أفقي/i.test(line)) return isArabic ? 'يوجد تمرير أفقي على شاشة الهاتف ويحتاج إصلاحًا.' : 'Horizontal scrolling needs to be fixed on a phone.';
            if (/I did not inspect|لم أفحص|لم أتحقق/i.test(line)) return isArabic ? 'بعض الأجزاء المطلوبة لم تُثبت بعد؛ لا يكتمل قبول الطلب قبل التحقق منها.' : 'Some requested parts were not proven; request acceptance is still incomplete.';
            if (/controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|لم أصل|لا يمكن الوصول/i.test(line)) return isArabic ? 'بعض عناصر الواجهة لم تصل إليها جولة الاختبار؛ يلزم إعادة التحقق.' : 'Some controls were not reached by the test and need another verification pass.';
            return isArabic ? 'بقيت ملاحظة في فحص الجودة.' : 'One quality finding remains.';
        })
        .filter((line, index, all) => all.indexOf(line) === index)
        .slice(0, 3);

    const explicitFinalVerified = /finalVerified:\s*`?true`?/iu.test(source);
    const buildVerified = /verified to compile|تُحقق من تجميعه|vite build (?:succeeded|passed)|(?:vite build|البناء)\s+نجح/iu.test(source)
        || (explicitFinalVerified && /(?:^|\n)#{0,3}\s*(?:✅\s*)?Project delivered\b/iu.test(source));
    // The report can contain a clean build-stage audit followed by a failed
    // final live-run audit. The final machine verdict always outranks an older
    // 100/100; otherwise the chat says "fully verified" while Logs say
    // finalVerified=false and browserQaFailed=true.
    const finalVerificationFailed = /finalVerified:\s*`?false`?|browserQaFailed:\s*`?true`?|Build stopped honestly|Stopped at step|final delivery is blocked|Accepted with gaps|Visible Browser QA:\s*\*\*not run\*\*|I did not deliver the system|لم أسلّم النظام|توقف التسليم|قُبل مع فجوات/iu.test(source);
    const fullyVerified = buildVerified && !finalVerificationFailed && (!score || Number(score) === 100) && issueLines.length === 0;
    const credential = source.match(/Owner account(?:\s*\([^)]*\))?:\s*([^\s/]+)\s*\/\s*([^\s]+)/iu);
    const liveUrl = source.match(/(?:Open at:|live at:?)\s*\*\*?(https?:\/\/[^\s*]+)/iu)?.[1];
    const checked = source.match(/\((\d+)\s+page\(s\),\s*(\d+)\s+control\(s\)[^)]*\)/i);
    const exploratoryActions = Array.from(source.matchAll(/(\d+)\s+exploratory action\(s\)/gi)).pop()?.[1] || '';
    const statesDiscovered = Array.from(source.matchAll(/(\d+)\s+state\(s\) discovered/gi)).pop()?.[1] || '';
    const measuredInteractions = exploratoryActions
        || Array.from(source.matchAll(/(\d+)\s+interaction\(s\) measured/gi)).pop()?.[1]
        || checked?.[2]
        || '';
    // External API selection is a user-facing product dependency, not internal
    // trace noise. Keep the backend's maintained metadata in the compact chat
    // receipt while leaving request URLs and technical evidence in Logs.
    const externalApiStatus = lines.find(line => /^[-•*]?\s*(?:External API|API خارجي):/iu.test(line))
        ?.replace(/^[-•*]\s*/, '')
        .trim();

    if (isArabic) {
        const heading = title ? `${fullyVerified ? '## تم التسليم' : '## نتيجة التنفيذ'}: ${title}` : (fullyVerified ? '## ملخص التسليم' : '## نتيجة التنفيذ');
        const result = [heading, fullyVerified ? 'اكتمل البناء والتحقق من المشروع.' : 'اكتمل البناء، لكن التحقق لم يكتمل بعد وتوجد نقاط يجب إصلاحها.'];
        if (liveUrl) result.push(`المعاينة الحية: ${liveUrl}`);
        if (credential) result.push(`بيانات الاختبار: ${credential[1]} / ${credential[2]}`);
        if (pages.length) result.push(`الصفحات المنفذة: ${pages.join(' · ')}.`);
        if (score) result.push(`فحص المتصفح: **${score}/100**${checked ? ` — ${checked[1]} صفحات و${measuredInteractions} فعلاً استكشافياً${statesDiscovered ? ` عبر ${statesDiscovered} حالة` : ''}` : ''}.`);
        if (externalApiStatus) result.push(externalApiStatus);
        if (issueLines.length) {
            result.push('الملاحظات المتبقية:');
            result.push(...issueLines.map(line => `- ${line}`));
        } else if (finalVerificationFailed) {
            result.push('لم يكتمل التحقق النهائي من التشغيل الحي؛ يجب إعادة الفحص قبل التسليم.');
        } else if (score && Number(score) < 100) {
            result.push('توجد ملاحظات غير حاجبة في فحص المتصفح الأخير؛ تفاصيلها التقنية مسماة في Logs.');
        } else {
            result.push('لم تظهر ملاحظات حرجة في الفحص الأخير.');
        }
        result.push('', 'التفاصيل التقنية الكاملة موجودة في Logs.');
        return result.join('\n');
    }

    const heading = title ? `${fullyVerified ? '## Delivered' : '## Execution result'}: ${title}` : (fullyVerified ? '## Delivery summary' : '## Execution result');
    const result = [heading, fullyVerified ? 'The project was built and fully verified.' : 'The project was built, but verification is incomplete and remaining findings must be fixed.'];
    if (liveUrl) result.push(`Live preview: ${liveUrl}`);
    if (credential) result.push(`Test account: ${credential[1]} / ${credential[2]}`);
    if (pages.length) result.push(`Implemented pages: ${pages.join(' · ')}.`);
    if (score) {
        const pageLabel = checked?.[1] === '1' ? 'page' : 'pages';
        const interactionLabel = measuredInteractions === '1' ? 'exploratory action' : 'exploratory actions';
        result.push(`Browser QA: **${score}/100**${checked ? ` — ${checked[1]} ${pageLabel} and ${measuredInteractions} ${interactionLabel}${statesDiscovered ? ` across ${statesDiscovered} discovered states` : ''}` : ''}.`);
    }
    if (externalApiStatus) result.push(externalApiStatus);
    if (issueLines.length) {
        result.push('Remaining findings:');
        result.push(...issueLines.map(line => `- ${line}`));
        } else if (finalVerificationFailed) {
            result.push('Final live verification did not complete; the system must be checked again before delivery.');
        } else if (score && Number(score) < 100) {
            result.push('The latest browser check still has non-blocking findings; the technical trace names them in Logs.');
        } else {
            result.push('No critical findings were reported in the latest check.');
        }
    result.push('', 'The complete technical trace is available in Logs.');
    return result.join('\n');
}
