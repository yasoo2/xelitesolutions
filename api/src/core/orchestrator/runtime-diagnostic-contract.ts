import { isBoundedTerminalDiagnosticRequest } from './buildIntent';
import { unquotedIntentText } from '../intelligence/requested-action';

export type RuntimeDiagnosticFact = 'node_version' | 'workspace_path';

/** Logical API-runtime facts only; this contract never grants command authority. */
export function parseRuntimeDiagnosticFacts(request: string): RuntimeDiagnosticFact[] | null {
    if (typeof request !== 'string' || !request.trim() || request.length > 8192
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\p{Cf}/u.test(request)) return null;
    let text = unquotedIntentText(request).normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').replace(/node\.js/gi, 'node').trim();
    if (/[;&|`<>$\\]|\b(?:pwd|shell_execute|commands?|terminal|shell|CLI|containers?|docker)\b|\bnode\s+-/iu.test(text)
        || /\b(?:(?:do\s+not|don't|never)\s+(?:use|invoke|call|execute|run|access|read)|(?:no|without)\s+(?:tools?|execution|file\s+access)|without\s+(?:using|calling|executing)|answer[-\s]+only|only\s+answer)\b/iu.test(text)
        || /(?:لا|ولا)\s+(?:تستخدم|تستعمل|تستدعي|تنفذ|تقرأ|تقرا|تصل)|(?:دون|بدون)\s+(?:استخدام|تنفيذ|قراءة)|[أا]جب\s+فقط|الرد\s+فقط|اشرح\s+فقط/u.test(text)) return null;
    const clauses = text.split(/[.!?؟\n]+/u).map(part => part.trim()).filter(Boolean);
    const positive = clauses.shift();
    if (!positive) return null;
    const operation = '(?:(?:modify|write|edit|change|delete|create)\\s+(?:(?:any|the)\\s+)?(?:files?|anything)|install\\s+(?:packages?|dependencies)|start\\s+(?:(?:a|the)\\s+)?servers?)';
    const denial = new RegExp(`^(?:do\\s+not|don't|never)\\s+${operation}(?:(?:,\\s*(?:or\\s+)?|\\s+or\\s+)${operation})*$`, 'iu');
    for (const clause of clauses) {
        if (/^no\s+file\s+changes$/iu.test(clause) || denial.test(clause)) continue;
        if (/^لا\s+(?:تعدل|تكتب|تغير|تحذف|تنشئ|تثبت|تبدأ|تشغل)/u.test(clause)) {
            const rest = clause.replace(/(?:ولا|لا)\s+(?:تعدل|تكتب|تغير|تحذف|تنشئ|تثبت|تبدأ|تشغل)|(?:الملفات|ملفات|أي\s+ملف|اي\s+ملف|الحزم|حزما|حزم|خادما|خادم)|[،,]/gu, '').trim();
            if (!rest) continue;
        }
        return null;
    }
    text = positive.replace(/^(?:please\s+)?(?:run|execute|perform)\s+(?:(?:a|the)\s+)?(?:read[-\s]?only\s+)?(?:local\s+)?diagnostic(?:\s+(?:in|for)\s+(?:the\s+)?(?:current|selected|active)\s+workspace)?\s*:\s*/iu, '')
        .replace(/^(?:نفذ|اجري|أجر)\s+فحصا?\s+محليا?(?:\s+للقراءة\s+فقط)?\s*:\s*/u, '');
    const report = /^(?:please\s+)?(?:report|show|tell\s+me|check|verify|اعرض|أخبرني|اخبرني|اذكر)(?=$|\s)\s+/iu;
    if (!report.test(text)) return null;
    text = text.replace(report, '').replace(/^(?:باللغة\s+العربية|بالعربية|in\s+English)\s+/iu, '').replace(/\s+(?:only|فقط)$/iu, '').trim();
    const facts: RuntimeDiagnosticFact[] = [];
    text = text.replace(/\b(?:the\s+)?(?:current\s+)?node\s+(?:runtime\s+)?version\b|\bversion\s+of\s+node\b|(?:إصدار|اصدار|نسخة)\s+node|\b(?:the\s+)?current\s+(?:workspace\s+path|working\s+directory|directory\s+path)\b|مسار\s+مساحة\s+العمل\s+الحالية/giu, selector => {
        facts.push(/\bnode\b/iu.test(selector) ? 'node_version' : 'workspace_path'); return ' ';
    });
    text = text.replace(/\b(?:and|only)\b|[,،]|و(?=\s)/giu, '').trim();
    return !text && facts.length > 0 && new Set(facts).size === facts.length ? facts : null;
}

/** Pure lexical prefilter; unrelated denials must not invoke diagnostic analysis. */
function hasTerminalDiagnosticFrame(text: string): boolean {
    return /(?:\b(?:terminal|shell|shell_execute)\b|طرفي)/iu.test(text)
        && /(?:\b(?:run|execute|perform|check|verify)\b|نفذ|شغل|فحص)/iu.test(text)
        || /\b(?:run|execute|perform)\b[^\n.!?]{0,100}\b(?:diagnostics?|checks?)\b/iu.test(text);
}

/** Terminal authority comes from the current unquoted request, never client flags. */
export function hasTerminalExecutionDenial(request: string): boolean {
    const text = unquotedIntentText(request).normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '');
    if (!hasTerminalDiagnosticFrame(text)) return false;
    return /\b(?:(?:do\s+not|don't|never)\s+(?:use|invoke|call|execute|run)\s+(?:(?:any|the)\s+)?(?:tools?|commands?|shell|terminal)|(?:no|without)\s+(?:tools?|execution|executing|running)|without\s+(?:using|invoking|calling)\s+(?:(?:any|the)\s+)?tools?|answer[-\s]+only|only\s+answer)\b/iu.test(text)
        || /(?:^|[\s،؛:.!?])(?:لا\s+(?:تستخدم|تستعمل|تنفذ|تشغل)\s+(?:(?:أي|اي|كل)\s+)?(?:أدوات|ادوات|الأدوات|الادوات|أداة|اداة|أوامر|اوامر|الأوامر|الاوامر|أمر|امر|شيئا?|شيء)|(?:دون|بدون)\s+(?:استخدام\s+(?:الأدوات|الادوات|أدوات|ادوات)|تنفيذ|تشغيل)|[أا]جب\s+فقط|الرد\s+فقط|اشرح\s+فقط)(?=$|[\s،؛:.!?])/u.test(text);
}

/** Finite, whole-request exception for file-prohibited version/path diagnostics. */
export function boundedNoFileTerminalCommands(request: string): string[] | null {
    let text = unquotedIntentText(request).normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').replace(/node\.js/gi, 'node');
    if (!hasTerminalDiagnosticFrame(text) || hasTerminalExecutionDenial(request) || !isBoundedTerminalDiagnosticRequest(text)
        || /[;&|`<>$\\]|\bnode\s+-e\b/iu.test(text)) return null;
    const clauses = text.split(/[.!?؟\n]+/u).map(clause => clause.trim()).filter(Boolean);
    const positive: string[] = [];
    for (const clause of clauses) {
        if (/^(?:no\s+file\s+changes|(?:do\s+not|don't|never)\s+(?:modify|write|edit|change|delete|create|install|start)\b)/iu.test(clause)) {
            const remainder = clause.replace(/^(?:no\s+file\s+changes|do\s+not|don't|never)/iu, '')
                .replace(/\b(?:modify|write|edit|change|delete|create|install|start|files?|anything|any|a|the|packages?|dependencies|server|and|or)\b|[,]/giu, '').trim();
            if (remainder) return null;
        } else if (/^لا\s+(?:تعدل|تكتب|تغير|تحذف|تنشئ|تثبت|تبدأ|تشغل)/u.test(clause)) {
            const remainder = clause.replace(/(?:ولا|لا)\s+(?:تعدل|تكتب|تغير|تحذف|تنشئ|تثبت|تبدأ|تشغل)|(?:الملفات|ملفات|أي\s+ملف|اي\s+ملف|الحزم|حزما|حزم|خادما|خادم)|[،,]/gu, '').trim();
            if (remainder) return null;
        } else positive.push(clause);
    }
    text = positive.join(' ');
    const commands: string[] = [];
    text = text.replace(/\bnode\s+--version\b|\b(?:the\s+)?node\s+version\b|\bversion\s+of\s+node\b|(?:إصدار|اصدار|نسخة)\s+node|\bpwd\b|\b(?:the\s+)?current\s+(?:workspace\s+path|working\s+directory|directory\s+path)\b|مسار\s+مساحة\s+العمل\s+الحالية/giu, selector => {
        commands.push(/\bnode\b/iu.test(selector) ? 'node --version' : 'pwd');
        return ' ';
    });
    // Every remaining word must belong to the diagnostic frame, not another action.
    text = text.replace(/\b(?:please|run|execute|perform|a|the|read[-\s]?only|local|diagnostics?|checks?|in|current|selected|active|workspace|using|with|terminal|shell_execute|report|show|print|display|verify|check|and|then|only)\b|[:،,]/giu, '')
        .replace(/(?:نفذ|اجري|أجر|فحصا?|محليا?|للقراءة\s+فقط|باستخدام|اعرض|و(?=\s))/gu, '').trim();
    return !text && commands.length ? [...new Set(commands)] : null;
}
