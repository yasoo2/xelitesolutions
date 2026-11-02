/**
 * WHAT THE USER ACTUALLY READS AT THE END OF A RUN.
 *
 * The orchestrator finishes with a map of stepId -> output, and the reply was
 * built by walking that map BACKWARDS and returning the first non-empty value.
 * For a one-step run that is right, and it stays right here. For anything
 * longer it was wrong in two ways at once, measured on a real run of
 * «افحص الروابط ثم اكتب تقريراً»:
 *
 *   {"collect":{"content":"وجدتُ 3 روابط مكسورة: /a /b /c"},"report":{"success":true}}
 *   → the chat message was:  {"success":true}
 *
 * The material the user asked for was discarded because it was not produced by
 * the LAST step, and a raw JSON object was printed into a chat window as if it
 * were a sentence.
 *
 * The rule is deliberately conservative, because most runs are one step and
 * those answers are already good:
 *
 *   - what a step CHOSE to say — its answer, text, summary or message — always
 *     reaches the user, in the order it was said. One speaking step therefore
 *     answers exactly as it did before;
 *   - raw material (a `content`, a `stdout`) is NOT prose and stays out while
 *     any step is speaking — otherwise a run that merely read a file would dump
 *     it above a perfectly good answer. It surfaces only when nothing spoke, or
 *     when everything said was a one-line «تم», and it is capped, never dumped;
 *   - and when the run produced no words at all, the answer is an honest list of
 *     what was DONE, in the user's language — never a JSON object.
 */

import { redactSecretsFromString } from '../../shared/utils/redaction';
import { types } from 'node:util';
import { parseRuntimeDiagnosticFacts } from './runtime-diagnostic-contract';
import { resolveRequestedAnswerLanguage } from '../llm/requested-answer-language';

export interface RunStep {
    id: string;
    task?: string;
    tool?: string;
    input?: any;
    status?: string;
    result?: any;
}

/** A one-line «تم» is a status, not an answer — but it is still worth saying. */
const STATUS_MAX = 40;
/** How much raw material (a file's text, a command's stdout) may reach the chat. */
const MAX_DATA = 1200;
const MAX_BLOCKS = 4;

/** The sentence a step said, if it said one. */
export function proseOf(output: any): string {
    if (output == null) return '';
    if (typeof output === 'string') return output.trim();
    if (typeof output !== 'object') return String(output);
    // `summary` before `message`: a tool's message is a one-line status
    // («analysis complete») while the summary is the content itself.
    for (const k of ['answer', 'text', 'summary', 'message']) {
        const v = (output as any)[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** The material a step produced, when it produced material instead of prose. */
export function dataOf(output: any): string {
    if (!output || typeof output !== 'object') return '';
    for (const k of ['content', 'stdout', 'output', 'result', 'body']) {
        const v = (output as any)[k];
        if (typeof v === 'string' && v.trim()) {
            const t = v.trim();
            return t.length > MAX_DATA ? `${t.slice(0, MAX_DATA)}\n…` : t;
        }
    }
    return '';
}

const isStatusLine = (s: string) => !!s && s.length <= STATUS_MAX && !s.includes('\n');

/** Joins blocks in order, dropping repeats and anything already contained. */
function join(blocks: string[]): string {
    const kept: string[] = [];
    for (const b of blocks) {
        if (!b) continue;
        if (kept.some(k => k.includes(b))) continue;
        kept.push(b);
    }
    return kept.slice(-MAX_BLOCKS).join('\n\n');
}

function readFileEvidence(step: RunStep): { file: string; content: string; totalLines: number; expectedMarker?: string } | null {
    if (String(step.tool || '') !== 'read_file') return null;
    const raw = step.result;
    const output = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
    if (!output || typeof output.content !== 'string' || typeof output.totalLines !== 'number') return null;
    const task = String(step.task || '').replace(/\s+/g, ' ').trim();
    const file = String(step.input?.path || task.match(/:\s*(\S+)$/)?.[1] || 'الملف المحدد');
    const expectedMarker = typeof step.input?.expectedMarker === 'string' && step.input.expectedMarker.trim()
        ? step.input.expectedMarker.trim()
        : undefined;
    return { file, content: output.content.trim(), totalLines: output.totalLines, expectedMarker };
}

/** Finite npm metadata selectors, never instructions from the file content. */
function requestedMetadataFields(request: string, expectedMarker?: string): string[] | null {
    if (!request || request.length > 8192) return request ? [] : null;
    const unquoted = request.replace(/"[^"\r\n]*"|(?<!\w)'[^'\r\n]*'(?!\w)|“[^”]*”|«[^»]*»|`[^`]*`/g, value => ' '.repeat(value.length));
    const frames = [...unquoted.matchAll(/(?:^|[.,،;؛]\s*(?:also\s+)?|\b(?:and|then|also)\s+|\s+و|\s+ثم\s+)(?:tell\s+me|report|show|list|give\s+me|extract|أخبرني|اخبرني|أخبرنا|اخبرنا|اذكر|اعرض|استخرج)\s+?/giu)];
    if (frames.length > 1) return [];
    const outputAuthority = unquoted.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '');
    if (/\b(?:do\s+not|don't|don’t|never)\s+(?:report|show|display|mention|include|tell|list|extract|give)\b|(?:لا|ولا)\s+(?:تذكر|تعرض|تخبر|تظهر|تدرج)(?=$|[^\p{L}\p{N}_])/iu.test(outputAuthority)) return [];
    const frame = frames[0];
    if (!frame) return null;
    const clauses = request.slice(frame.index! + frame[0].length).split(/[.!?؟](?=\s|$)/u);
    let body = clauses[0].normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').trim();
    body = body.replace(/^(?:in\s+(?:English|Arabic)|باللغة\s+(?:العربية|الإنجليزية|الانجليزية)|بالعربية)\s+/iu, '')
        .replace(/^only\s+/i, '').replace(/\s+(?:only|فقط)$/iu, '').replace(/^ب(?=(?:اسم|الإصدار|الاصدار|الترخيص|الرخصة))/u, '');
    const explicitFieldSelection = /^(?:the\s+)?(?:JSON\s+)?(?:fields?|keys?|key\s+paths?)\s*:?\s*/i.test(body);
    body = body.replace(/^(?:the\s+)?(?:JSON\s+)?(?:fields?|keys?|key\s+paths?)\s*:?\s*/i, '').trim();
    // A request for the file's whole text or its lines is not a JSON field
    // selection. Keep this grammar finite: a subset, mixed fields, or unknown
    // explicit selector still fails closed instead of dumping file contents.
    const fullContent = !explicitFieldSelection && /^(?:(?:its|the)\s+)?(?:(?:exact|full|whole|entire|all)\s+)?(?:contents?|text)$|^(?:its|the)\s+(?:(?:all|[0-9]{1,5}|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?lines$|^ب?(?:محتواه|محتوى\s+الملف|نصه|نص\s+الملف)(?:\s+(?:كامل|كاملا|بالكامل))?$|^ب?(?:أسطره|اسطره|سطوره)(?:\s+(?:كلها|كاملة|الكاملة|[0-9٠-٩]{1,5}|الثلاثة|الأربعة|الاربعة|الخمسة|الستة|السبعة|الثمانية|التسعة|العشرة))?$/iu.test(body);
    const tails = unquoted.slice(frame.index! + frame[0].length).split(/[.!?؟](?=\s|$)/u).slice(1);
    const operationWords = /^(?:do|not|don't|don’t|never|no|without|any|a|the|file|files|write|writes|edit|modify|change|changes|create|delete|move|run|runs|execute|install|installs|start|build|deploy|publish|commit|command|commands|test|tests|program|programs|dependencies|packages|anything|internet|network|access|connection|connections|and|or|لا|ولا|دون|بدون|تعدل|تكتب|تنشئ|تنشي|تحذف|تشغل|تثبت|تغير|تنشر|تنفذ|أي|اي|ملف|الملف|ملفات|الملفات|برنامج|برنامجا|الاختبارات|أوامر|اوامر|الحزم|شيء|شيئا|الإنترنت|الانترنت|إنترنت|انترنت|شبكة|الشبكة|اتصال|الاتصال|أو|او)$/iu;
    for (const tail of tails) {
        const text = tail.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').trim();
        if (!text) continue;
        if (fullContent && expectedMarker && /^(?:verify|check|confirm)\s+(?:that\s+)?\S+\s+(?:contains|includes|has)\s+(?:the\s+)?marker\s*$/i.test(text)) continue;
        if (!/^(?:do\s+not|don't|don’t|never|no|without|لا|ولا|دون|بدون)\s+/iu.test(text)
            || /\b(?:then|but|also|however)\b|\band\s+(?!do\s+not|don't|don’t|never|no\s+)/iu.test(text)
            || text.split(/[\s,،;؛]+/u).some(word => !operationWords.test(word))) return [];
    }
    if (fullContent) return null;
    const parts = body.split(/\s*(?:,|،|;|؛|\band\b)\s*|\s+و(?=(?:اسم|أمر|امر|الاسم|الإصدار|الاصدار|إصدار|اصدار|النسخة|الرخصة|الترخيص|ترخيص|رخصة|scripts|version|license|name))/iu);
    if (!parts.length || parts.length > 8) return [];
    const fields: string[] = [];
    for (let part of parts) {
        part = part.trim().replace(/^(?:"([^"\r\n]+)"|'([^'\r\n]+)'|`([^`\r\n]+)`|“([^”\r\n]+)”)$/u, (_all, ...groups) => groups.slice(0, 4).find(Boolean));
        let field = '';
        if (/^(?:(?:the\s+)?(?:project|package)\s+)?name$|^name\s+of\s+the\s+(?:project|package)$|^(?:اسم\s+(?:المشروع|الحزمة)|الاسم)$/iu.test(part)) field = 'name';
        else if (/^(?:(?:the\s+)?(?:project|package)\s+)?version$|^(?:الإصدار|الاصدار|إصدار\s+(?:المشروع|الحزمة)|اصدار\s+(?:المشروع|الحزمة)|رقم\s+الإصدار|النسخة)$/iu.test(part)) field = 'version';
        else if (/^(?:(?:the\s+)?(?:project|package)\s+)?licen[cs]e$|^(?:الرخصة|الترخيص|رخصة\s+(?:المشروع|الحزمة)|ترخيص\s+(?:المشروع|الحزمة))$/iu.test(part)) field = 'license';
        else if (/^(?:أمر|امر)\s+(?:تشغيل\s+)?الاختبارات$|^test\s+(?:command|script)$|^command\s+(?:to\s+run|for\s+running)\s+tests$/iu.test(part)) field = 'scripts.test';
        else {
            const command = part.match(/^(test|start|build|lint|dev|serve|check)\s+(?:command|script)$/i);
            const key = part.match(/^(?:\$\.)?(name|version|license|scripts(?:\.[A-Za-z0-9_:-]{1,64})?)$/u)
                || part.match(/^(?:\$\.)?(scripts)\[(?:"([A-Za-z0-9_:-]{1,64})"|'([A-Za-z0-9_:-]{1,64})')\]$/u);
            field = command ? `scripts.${command[1].toLowerCase()}` : key ? (key[2] || key[3] ? `scripts.${key[2] || key[3]}` : key[1]) : '';
        }
        if (!field || /(?:__proto__|constructor|prototype|secret|password|credential|token|api[_-]?key)/i.test(field)) return [];
        if (!fields.includes(field)) fields.push(field);
    }
    return fields;
}

const metadataDisplay = (value: string) => value.replace(/[\\`*_{}\[\]<>()!#|$]/g, '\\$&');
const metadataStringIsDisplayable = (value: any): value is string => typeof value === 'string' && !!value.trim() && value.length <= MAX_DATA
    && !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value) && redactSecretsFromString(value) === value
    && !/\[(?:REDACTED|Content Redacted|redacted:\d+)\]|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(value);

/** Format only the measured finite facts; the gateway owns identity verification. */
function composeRuntimeDiagnosticReport(steps: RunStep[], language?: string): string {
    let ar = String(language || '').startsWith('ar');
    const unavailable = () => ar ? 'لا تتوفر حقائق مكتملة من فحص وقت التشغيل المصرح به.' : 'Completed authorized runtime diagnostic facts are unavailable.';
    const record = (value: any): Record<string, any> => {
        if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('invalid_record');
        const descriptors = Object.getOwnPropertyDescriptors(value), result: Record<string, any> = Object.create(null);
        for (const key of Reflect.ownKeys(descriptors)) {
            const d = descriptors[key as any];
            if (typeof key !== 'string' || !('value' in d) || !d.enumerable) throw Error('invalid_record');
            result[key] = d.value;
        }
        return result;
    };
    const array = (value: any): any[] => {
        if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 2) throw Error('invalid_array');
        const d = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(d).some(key => key !== 'length' && !/^[01]$/.test(String(key)))) throw Error('invalid_array');
        return Array.from({ length: value.length }, (_, i) => { if (!d[i] || !('value' in d[i])) throw Error('invalid_array'); return d[i].value; });
    };
    try {
        if (steps.length !== 1 || steps[0].tool !== 'runtime_diagnostics' || steps[0].status !== 'completed') return unavailable();
        const input = record(steps[0].input);
        ar = resolveRequestedAnswerLanguage(typeof input.request === 'string' ? input.request : '', language).startsWith('ar');
        const selected = parseRuntimeDiagnosticFacts(input.request);
        if (!selected || input.path !== '.' || Object.keys(input).some(key => !['request', 'facts', 'path'].includes(key))
            || JSON.stringify(array(input.facts)) !== JSON.stringify(selected)) return unavailable();
        const raw = record(steps[0].result), output = raw.output === undefined ? raw : record(raw.output);
        if (raw.ok === false || raw.success === false || output.ok === false || output.success === false
            || output.status !== 'completed' || output.kind !== 'runtime_diagnostics' || output.runtimeScope !== 'joe_api_process'
            || output.executedCommands !== false || Object.keys(output).some(key => !['status', 'kind', 'runtimeScope', 'executedCommands', 'facts'].includes(key))) return unavailable();
        const facts = array(output.facts);
        if (facts.length !== selected.length) return unavailable();
        const rows = facts.map((item, i) => {
            const fact = record(item), node = selected[i] === 'node_version';
            if (fact.id !== selected[i] || fact.source !== (node ? 'api_process' : 'authorized_workspace')
                || Object.keys(fact).some(key => !['id', 'value', 'source'].includes(key)) || !metadataStringIsDisplayable(fact.value)
                || node && !/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(fact.value)
                || !node && (!/^(?:[A-Za-z]:[\\/]|\/)/u.test(fact.value) || fact.value.split(/[\\/]/u).includes('..'))) throw Error('invalid_fact');
            const label = node ? (ar ? 'إصدار Node.js لعملية Joe API' : 'Joe API Node.js version')
                : (ar ? 'مسار مساحة العمل المصرح بها' : 'Authorized workspace path');
            return `**${label}:** ${metadataDisplay(fact.value)}`;
        });
        return `${ar ? 'حقائق مرصودة دون تنفيذ أوامر.' : 'Observed facts; no commands executed.'}\n\n${rows.join('\n')}`;
    } catch { return unavailable(); }
}

/** Format already measured complete reads; no defaults, execution or content fallback. */
function composeMetadataProjection(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => step.tool === 'read_file')) return '';
    const selections = done.map(step => requestedMetadataFields(typeof step.input?.request === 'string' ? step.input.request : '',
        typeof step.input?.expectedMarker === 'string' ? step.input.expectedMarker.trim() : undefined));
    if (selections.every(fields => fields === null)) return '';
    const ar = String(language || '').startsWith('ar');
    if (done.length !== 1 || !selections[0]?.length) return ar ? 'تعذّر تحديد جميع حقول البيانات المطلوبة ضمن الصيغة المدعومة.' : 'Cannot identify all requested metadata fields within the supported format.';
    const step = done[0], raw = step.result, output = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
    if (step.status !== 'completed' || raw?.ok === false || raw?.success === false || output?.ok === false || output?.success === false || output?.truncated === true
        || step.input?.startLine != null && step.input.startLine !== 1 || typeof output?.content !== 'string'
        || !Number.isSafeInteger(output?.totalLines) || output.totalLines !== output.content.split('\n').length) {
        return ar ? 'لا تتوفر قراءة مكتملة وناجحة لاستخراج الحقول المطلوبة.' : 'A complete successful read is unavailable for the requested fields.';
    }
    if (output.content.length > 262144) return ar ? 'يتجاوز المحتوى حد استخراج البيانات.' : 'Content exceeds the metadata projection limit.';
    let data: any;
    try { data = JSON.parse(output.content); } catch { return ar ? 'المحتوى المقروء ليس JSON صالحا؛ لم أستخرج أي قيمة.' : 'The read content is not valid JSON; no values were extracted.'; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ar ? 'المحتوى المقروء ليس كائن JSON للبيانات المطلوبة.' : 'The read content is not a JSON metadata object.';
    const own = (object: any, key: string) => object && typeof object === 'object' && !Array.isArray(object) && Object.prototype.hasOwnProperty.call(object, key);
    const missing = ar ? 'غير موجود' : 'Not present';
    const invalid = ar ? 'قيمة نصية صالحة غير متوفرة' : 'A valid string value is unavailable';
    const label = (key: string) => !ar ? metadataDisplay(key) : key === 'name' ? 'اسم المشروع' : key === 'version' ? 'الإصدار' : key === 'license' ? 'الترخيص' : key === 'scripts' ? 'أوامر scripts' : key === 'scripts.test' ? 'أمر الاختبارات (scripts.test)' : `أمر (${metadataDisplay(key)})`;
    const display = (key: string, value: any) => `**${label(key)}:** ${metadataStringIsDisplayable(value) ? metadataDisplay(value) : invalid}`;
    const rows: string[] = [];
    for (const field of selections[0]) {
        if (field === 'scripts') {
            if (!own(data, 'scripts')) rows.push(`**${label('scripts')}:** ${missing}`);
            else if (!data.scripts || typeof data.scripts !== 'object' || Array.isArray(data.scripts) || Object.keys(data.scripts).length > 32) rows.push(`**${label('scripts')}:** ${invalid}`);
            else if (!Object.keys(data.scripts).length) rows.push(`**${label('scripts')}:** ${ar ? 'لا توجد أوامر مسجلة' : 'No script entries'}`);
            else for (const key of Object.keys(data.scripts)) {
                if (!/^[A-Za-z0-9_:-]{1,64}$/.test(key) || /(?:__proto__|constructor|prototype|secret|password|credential|token|api[_-]?key)/i.test(key)) { rows.push(`**${label('scripts')}:** ${invalid}`); break; }
                rows.push(display(`scripts.${key}`, data.scripts[key]));
            }
        } else {
            const [root, key] = field.split('.');
            rows.push(key ? own(data, root) && own(data[root], key) ? display(field, data[root][key]) : `**${label(field)}:** ${missing}`
                : own(data, root) ? display(field, data[root]) : `**${label(field)}:** ${missing}`);
        }
    }
    const marker = typeof step.input?.expectedMarker === 'string' ? step.input.expectedMarker.trim() : '';
    if (marker) rows.push(`**${ar ? 'العلامة' : 'Marker'}:** ${output.content.includes(marker) ? 'PASS' : 'FAIL'} — ${metadataStringIsDisplayable(marker) ? metadataDisplay(marker) : invalid}`);
    return rows.join('\n');
}

function composeReadFileReport(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => String(step.tool || '') === 'read_file')) return '';
    const evidence = done.map(readFileEvidence);
    if (evidence.some(item => !item)) return '';
    const rows = (evidence as Array<{ file: string; content: string; totalLines: number; expectedMarker?: string }>).map(item => {
        const marker = item.expectedMarker
            ? `\n**Marker:** ${item.content.includes(item.expectedMarker) ? 'PASS' : 'FAIL'} — \`${item.expectedMarker}\``
            : '';
        return `**${item.file}** — ${item.totalLines} ${item.totalLines === 1 ? 'line' : 'lines'}${marker}\n\`\`\`text\n${item.content}\n\`\`\``;
    }
    ).join('\n\n');
    const ar = String(language || '').startsWith('ar');
    const hasExpectedMarkers = (evidence as Array<{ expectedMarker?: string }>).some(item => item.expectedMarker);
    return ar
        ? `## ✅ تقرير قراءة الملفات\n\n${rows}\n\n${hasExpectedMarkers ? '**حالة العلامات:** تم التحقق من كل علامة مذكورة مقابل المحتوى المقروء. ' : ''}لم تُجرَ أي كتابة أو تعديل.`
        : `## ✅ File reading report\n\n${rows}\n\n${hasExpectedMarkers ? '**Marker status:** Each supplied marker was checked against the file content. ' : ''}No files were written or modified.`;
}

function composeDirectoryReport(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => String(step.tool || '') === 'inspect_directory')) return '';
    const evidence = done.map(step => {
        const raw = step.result;
        const output = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
        const tree = Array.isArray(output?.tree) ? output.tree : null;
        if (!tree) return null;
        return { path: String(step.input?.path || 'المجلد المحدد'), tree, expectedEntry: String(step.input?.expectedEntry || '').trim() };
    });
    if (evidence.some(item => !item)) return '';
    const rows = (evidence as Array<{ path: string; tree: any[]; expectedEntry: string }>).map(item => {
        const entries = item.tree.map(entry => `- ${entry.type === 'directory' ? '[dir]' : '[file]'} ${entry.name}`).join('\n') || '- (empty)';
        const found = item.expectedEntry
            ? item.tree.some(entry => entry.name === item.expectedEntry || entry.name === item.expectedEntry.replace(/^[\\/]+/, '').split(/[\\/]/).pop())
            : false;
        const confirmation = item.expectedEntry
            ? `\n**${found ? 'Confirmed' : 'Not found'}:** \`${item.expectedEntry}\` ${found ? 'exists in this directory.' : 'was not found in this directory.'}`
            : '';
        return `**${item.path}**\n${entries}${confirmation}`;
    }).join('\n\n');
    const ar = String(language || '').startsWith('ar');
    return ar
        ? `## ✅ تقرير استكشاف المجلد\n\n${rows}\n\nلم تُجرَ أي كتابة أو تعديل.`
        : `## ✅ Directory inspection report\n\n${rows}\n\nNo files were written or modified.`;
}

function composeWriteAndReadReport(done: RunStep[], language?: string): string {
    const append = done.find(step => ['write_file', 'file_edit'].includes(String(step.tool || '')));
    const read = done.find(step => String(step.tool || '') === 'read_file');
    if (!append || !read) return '';
    const evidence = readFileEvidence(read);
    if (!evidence) return '';
    const raw = append.result?.output && typeof append.result.output === 'object' ? append.result.output : append.result;
    const ar = String(language || '').startsWith('ar');
    const appendMode = append.input?.mode === 'append';
    const state = append.tool === 'file_edit'
        ? (ar ? 'تم تعديل النص المحدد ثم قراءة الملف للتحقق من النتيجة.' : 'The specified text was replaced and the file was read back to verify the result.')
        : appendMode
        ? raw?.alreadySatisfied
            ? (ar ? 'كان المحتوى المطلوب موجوداً بالفعل، فلم أكرره.' : 'The requested content was already present, so Joe did not duplicate it.')
            : (ar ? 'تمت الإضافة مرة واحدة مع إبقاء المحتوى السابق كما هو.' : 'The content was appended once and the existing content was preserved.')
        : (ar ? 'تمت كتابة الملف ثم قراءته للتحقق من النتيجة.' : 'The file was written and then read back to verify the result.');
    return ar
        ? `## تم تحديث ${evidence.file}\n\n${state}\n\n**عدد الأسطر النهائي:** ${evidence.totalLines}\n\n\`\`\`text\n${evidence.content}\n\`\`\``
        : `## Updated ${evidence.file}\n\n${state}\n\n**Final line count:** ${evidence.totalLines}\n\n\`\`\`text\n${evidence.content}\n\`\`\``;
}

/** Present the bounded decision receipt rather than echoing its task label. */
function composeCapabilityDecisionReport(done: RunStep[], language?: string): string {
    const source = done.find(step => {
        const result = step?.result;
        return result?.receipt?.version === 1 && result?.receipt?.selected;
    });
    const receipt = source?.result?.receipt;
    const selected = receipt?.selected;
    if (!receipt || !selected) return '';

    const ar = String(language || '').startsWith('ar');
    const alternatives = Array.isArray(receipt.viableAlternatives)
        ? receipt.viableAlternatives.map(String).filter(Boolean).slice(0, 3)
        : Array.isArray(receipt.rankedAlternatives)
            ? receipt.rankedAlternatives
                .map((item: any) => item?.candidate)
                .filter((candidate: any) => candidate && candidate.id !== selected.id)
                .slice(0, 3)
                .map((candidate: any) => `${candidate.route} (${candidate.setup})`)
            : [];
    const rejected = Array.isArray(receipt.rejectedAlternatives)
        ? receipt.rejectedAlternatives.map(String).filter(Boolean).slice(0, 3)
        : Array.isArray(receipt.rejected)
            ? receipt.rejected.slice(0, 3).map((item: any) => {
            const reasons = Array.isArray(item?.reasons)
                ? item.reasons
                : item?.reasons == null ? [] : [String(item.reasons)];
            return `${item?.id || 'candidate'}: ${reasons.slice(0, 2).join('; ')}`;
            }).filter(Boolean)
            : [];
    const action = receipt.requiredUserAction || source?.result?.userAction || null;

    if (ar) {
        return [
            '## قرار مسار القدرة',
            `**المسار المختار:** ${selected.route} (${selected.setup})`,
            `**الموثوقية والدليل:** ${selected.reliability}؛ ${receipt.evidenceFreshness === 'fresh' ? 'الدليل مسجل كحديث' : 'الدليل قديم أو غير مكتمل'}.`,
            alternatives.length ? `**بدائل مناسبة:** ${alternatives.join('، ')}` : '',
            rejected.length ? `**بدائل مرفوضة:**\n${rejected.map((line: string) => `- ${line}`).join('\n')}` : '',
            action ? `**إجراء مطلوب منك:** ${action}. لم أجرِ اتصال حساب أو استخدام مفتاح أو دفع.` : '**لا يوجد إجراء مطلوب منك. لم أجرِ اتصال حساب أو استخدام مفتاح أو دفع.**',
        ].filter(Boolean).join('\n\n');
    }

    return [
        '## Capability route decision',
        `**Selected route:** ${selected.route} (${selected.setup})`,
        `**Reliability and evidence:** ${selected.reliability}; ${receipt.evidenceFreshness === 'fresh' ? 'evidence is recorded as fresh' : 'evidence is stale or incomplete'}.`,
        alternatives.length ? `**Viable alternatives:** ${alternatives.join(', ')}` : '',
        rejected.length ? `**Rejected alternatives:**\n${rejected.map((line: string) => `- ${line}`).join('\n')}` : '',
        action ? `**Action required from you:** ${action}. No account was connected, key used, or payment made.` : '**No action is required from you. No account was connected, key used, or payment made.**',
    ].filter(Boolean).join('\n\n');
}

/** Only measured screenshot output supplies a delivery sentence, never plan diagnostics. */
function composeScreenshotReport(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => step.tool === 'screenshot' && step.status === 'completed')) return '';
    const images = done.map(step => {
        const output = step.result?.output ?? step.result;
        if (output?.success !== true || typeof output.path !== 'string'
            || typeof output.publicUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(output.publicUrl)
            || !Number.isSafeInteger(output.width) || output.width <= 0
            || !Number.isSafeInteger(output.height) || output.height <= 0) return null;
        const name = output.path.split(/[\\/]/).pop() || '';
        if (!name || /[\r\n\x00-\x1f]/.test(name)) return null;
        // Escape Markdown punctuation without modifying the actual artifact name.
        const label = name.replace(/[\\`*_{}\[\]<>()!#]/g, '\\$&');
        return { label, width: output.width, height: output.height };
    });
    if (images.some(image => !image)) return '';
    const ar = String(language || '').startsWith('ar');
    return images.map(image => ar
        ? 'تم حفظ لقطة الشاشة «'+image!.label+'» بأبعاد '+image!.width+' × '+image!.height+' بكسل.'
        : 'Saved screenshot «'+image!.label+'» ('+image!.width+' × '+image!.height+' pixels).').join('\n\n');
}

/**
 * The whole run, in one message. `steps` is in plan order; anything that never
 * completed is ignored.
 */
export function composeAnswer(steps: RunStep[], language?: string): string {
    if ((steps || []).some(step => step?.tool === 'runtime_diagnostics')) return composeRuntimeDiagnosticReport(steps, language);
    const done = (steps || []).filter(s => s && s.status !== 'failed');
    if (!done.length) return '';

    const writeAndReadReport = composeWriteAndReadReport(done, language);
    if (writeAndReadReport) return writeAndReadReport;

    const capabilityDecisionReport = composeCapabilityDecisionReport(done, language);
    if (capabilityDecisionReport) return capabilityDecisionReport;

    const metadataProjection = composeMetadataProjection(done, language);
    if (metadataProjection) return metadataProjection;

    const readFileReport = composeReadFileReport(done, language);
    if (readFileReport) return readFileReport;

    const directoryReport = composeDirectoryReport(done, language);
    if (directoryReport) return directoryReport;

    const prose = done.map(s => proseOf(s.result)).filter(Boolean);

    // What a step CHOSE to say always reaches the user, in the order it was
    // said. One step that spoke gives exactly what it gave before — the case
    // that covers most requests, unchanged.
    if (prose.length) {
        const said = join(prose);
        // …unless every word of it was a status line («تم»). Then the run's
        // material is all it really has to show, and that material is what the
        // question was about.
        if (prose.every(isStatusLine)) {
            const material = join(done.map(s => (proseOf(s.result) ? '' : dataOf(s.result))));
            if (material) return `${material}\n\n${said}`;
        }
        return said;
    }

    // Nothing spoke. Raw material now counts — this is the measured failure:
    // the findings lived in a `content` field and the reply was the next step's
    // `{success:true}`.
    const material = join(done.map(s => dataOf(s.result)));
    if (material) return material;

    const screenshotReport = composeScreenshotReport(done, language);
    if (screenshotReport) return screenshotReport;

    // And when the run produced no words at all, report what was DONE —
    // truthfully, from the tasks that really ran — instead of printing an
    // object into a chat window.
    const ar = String(language || '').startsWith('ar');
    const lines = done.map(s => `- ${s.task || s.tool || s.id}`).join('\n');
    return ar ? `تمّ التنفيذ:\n${lines}` : `Done:\n${lines}`;
}

/**
 * A RUN THAT FAILED HALFWAY STILL DID SOMETHING.
 *
 * Measured on a real three-step run — build a page, write a note, then a step
 * that failed: two files were on disk, and the entire reply was
 *
 *   ⚠️ File not found
 *
 * The user was not told the page existed, not told WHICH of the three steps
 * failed, and read it in English in an Arabic session. The work was invisible
 * and the error was unplaceable.
 *
 * The technical detail stays — it is real and it is what repairs the problem —
 * but it arrives inside a sentence that names the step it belongs to, above a
 * list of what survived.
 */
/**
 * A STEP NAME IS A LABEL, NOT THE REQUEST IT CARRIES.
 *
 * Measured on a real WeatherGo run: the pipeline names its step «استكشف السياق
 * ثم خطط ونفّذ تطبيق React المطلوب بأدلة واختبارات: <the whole 1700-character
 * prompt>». The failure line then read the entire prompt back to the person who
 * had just typed it — twice, once here and once in the surrounding report —
 * and buried the one sentence that mattered under it.
 *
 * A colon that introduces a payload longer than the label is not punctuation in
 * a title; it is a seam. Cut there, then cap. Nothing is lost: the request is
 * on screen already, two lines above, in his own words.
 */
export function stepLabel(raw: string, max = 70): string {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const at = text.indexOf(':');
    const head = at > 0 && text.length - at > at ? text.slice(0, at).trim() : text;
    return head.length > max ? `${head.slice(0, max - 1).trimEnd()}…` : head;
}

export function composeFailure(steps: RunStep[], rawError: string, language?: string): string {
    const ar = String(language || '').startsWith('ar');
    const detail = String(rawError || '').trim().slice(0, 400);
    const list = (steps || []).filter(s => s && s.status === 'completed');
    const failed = (steps || []).find(s => s && s.status === 'failed');

    const name = failed ? stepLabel(failed.task || failed.id) : '';
    const failedOutput = failed?.result?.output && typeof failed.result.output === 'object'
        ? proseOf(failed.result.output)
        : typeof failed?.result === 'string' || (failed?.result && typeof failed.result === 'object') ? proseOf(failed?.result) : '';
    const head = failed
        ? (ar ? `توقّفت عند الخطوة «${name}»${detail ? ` — ${detail}` : ''}`
              : `Stopped at step “${name}”${detail ? ` — ${detail}` : ''}`)
        : detail;
    const explained = failedOutput && !head.includes(failedOutput)
        ? `${head}\n\n${failedOutput.slice(0, 1800)}`
        : head;
    if (!list.length) return explained;

    const lines = list.map(s => {
        const p = proseOf(s.result);
        const extra = p && !isStatusLine(p) ? `\n  ${p.split('\n')[0].slice(0, 200)}` : '';
        return `- ${stepLabel(s.task || s.tool || s.id, 90)}${extra}`;
    }).join('\n');
    return `${explained}\n\n${ar ? 'وما أُنجز قبل التوقّف — وهو باقٍ:' : 'Completed before stopping — and it is still there:'}\n${lines}`;
}
