export interface ExplicitFileRequest {
    path: string;
    content: string;
    readBack: boolean;
}

export interface ExplicitAppendFileRequest {
    path: string;
    content: string;
    readBack: boolean;
    expectedFinalLineCount?: number;
}

export interface ExplicitFileEditRequest {
    path: string;
    find: string;
    replace: string;
    readBack: boolean;
}

/** Whole-message literal text-to-file command. The tail grants only same-file read-back. */
export function parseQuotedTextWriteRequest(input: string): ExplicitFileRequest | null {
    const raw = String(input || '').trim();
    if (!raw || raw.length > 8192) return null;
    const quoted = String.raw`(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60|“(?:\\[\s\S]|[^”\\])*”)`;
    const target = String.raw`(?<path>[^\s"'\x60“”،؛]+)`;
    const tail = String.raw`\s*[.,؛،]?\s*(?<follow>(?:then\s+read\s+(?:the\s+)?file(?:\s+back)?|ثم\s+(?:اقرأ|اقرا)\s+(?:الملف|ملف)))?\s*[.!؟]?\s*$`;
    const patterns = [
        new RegExp(`^(?:please\\s+)?(?:write|save)\\s+(?:exactly\\s+)?(?<content>${quoted})\\s+(?:to|into|in)\\s+(?:(?:the\\s+)?file\\s+)?${target}(?:\\s+in\\s+the\\s+(?:current\\s+)?workspace)?${tail}`, 'iu'),
        new RegExp(`^(?:من\\s+فضلك\\s+)?(?:اكتب|احفظ)\\s+(?:بالضبط\\s+)?(?<content>${quoted})\\s+(?:في|إلى|الى)\\s+(?:(?:الملف|ملف)\\s+)?${target}(?:\\s+في\\s+مساحة\\s+العمل(?:\\s+الحالية)?)?${tail}`, 'u'),
    ];
    const match = patterns.map(pattern => raw.match(pattern)).find(Boolean);
    if (!match?.groups) return null;
    const path = match.groups.path.replace(/[.,؛،]+$/u, '');
    if (!path || path.length > 512 || path.includes('..') || /^[\\/]/u.test(path)
        || /^[A-Za-z]:/u.test(path) || !SAFE_RELATIVE_PATH.test(path)) return null;
    return { path, content: match.groups.content.slice(1, -1), readBack: !!match.groups.follow };
}

/** A complete literal edit only; extra operations and negated requests stay out of this route. */
export function parseExplicitFileEditRequest(input: string): ExplicitFileEditRequest | null {
    const raw = String(input || '').trim();
    if (!raw || raw.length > 8192) return null;
    const quoted = String.raw`(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60|“(?:\\[\s\S]|[^”\\])*”)`;
    const file = String.raw`(?<path>[^\s"'\x60“”،؛]+)`;
    const pair = `(?<find>${quoted})\\s+with\\s+(?<replace>${quoted})`;
    const tail = String.raw`\s*[.,؛،]?\s*(?<follow>(?:then\s+read\s+(?:the\s+)?file(?:\s+back)?|ثم\s+(?:اقرأ|اقرا)\s+(?:الملف|ملف)))?\s*[.!؟]?\s*$`;
    const patterns = [
        new RegExp(`^(?:please\\s+)?replace\\s+${pair}\\s+in\\s+(?:the\\s+)?file\\s+${file}${tail}`, 'iu'),
        new RegExp(`^in\\s+(?:the\\s+)?file\\s+${file},\\s*replace\\s+${pair}${tail}`, 'iu'),
        new RegExp(`^استبدل\\s+(?<find>${quoted})\\s+(?:بـ|ب)\\s*(?<replace>${quoted})\\s+في\\s+(?:الملف|ملف)\\s+${file}${tail}`, 'u'),
        new RegExp(`^في\\s+(?:الملف|ملف)\\s+${file}[،,]\\s*استبدل\\s+(?<find>${quoted})\\s+(?:بـ|ب)\\s*(?<replace>${quoted})${tail}`, 'u'),
    ];
    const match = patterns.map(pattern => raw.match(pattern)).find(Boolean);
    if (!match?.groups) return null;
    const token = match.groups.path;
    if (/^[A-Za-z]:/u.test(token) || /^[\\/]/u.test(token)) return null;
    const path = token.replace(/[.,؛،]+$/u, '');
    if (!path || path.includes('..') || !SAFE_RELATIVE_PATH.test(path)) return null;
    const find = match.groups.find.slice(1, -1), replace = match.groups.replace.slice(1, -1);
    if (!find) return null;
    return { path, find, replace, readBack: !!match.groups.follow };
}

const SAFE_READ_PATH = /^[A-Za-z0-9_\-.\/\\\u0600-\u06FF]+$/;

const SAFE_RELATIVE_PATH = /^[A-Za-z0-9_\-.\/\\\u0600-\u06FF]+$/;

export interface ExplicitDirectoryRequest {
    path: string;
    expectedEntry?: string;
}

/**
 * Extract a read-only directory inspection target before file extraction. A
 * request can mention both a directory and a file it expects inside it; the
 * file is evidence to check, not the directory to open from the workspace
 * root.
 */
export function parseExplicitDirectoryInspectionRequest(input: string): ExplicitDirectoryRequest | null {
    const raw = String(input || '').trim();
    if (!raw || !/\b(?:inspect|list|show|report|confirm|verify|check|review)\b|(?:افحص|استكشف|اعرض|اعرض|تحقق|تاكد|تأكد|راجع)/i.test(raw)) return null;
    const mutationPattern = /\b(?:create|write|save|edit|delete|modify|change|build|install|deploy)\b/gi;
    let mutation: RegExpExecArray | null;
    while ((mutation = mutationPattern.exec(raw)) !== null) {
        const before = raw.slice(Math.max(0, mutation.index - 90), mutation.index);
        if (!/\b(?:do\s+not|don't|never|without|no)\b[^.!?\n]{0,90}$/i.test(before)) return null;
    }
    if (/(?:انشئ|أنشئ|اكتب|عدل|عدّل|احذف|غير|غيّر|ابن|ابني)/i.test(raw)) return null;

    const directoryMatch = raw.match(/\b(?:directory|folder)\s+(?:named|called)?\s*[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+)[`'"“”]?/i)
        || raw.match(/(?:مجلد|دليل)\s+(?:باسم|اسمه)?\s*[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+)[`'"“”]?/i);
    const directory = String(directoryMatch?.[1] || '').trim().replace(/[.,؛،:]+$/u, '');
    if (!directory || directory.includes('..') || directory.startsWith('/') || /^[A-Za-z]:/i.test(directory) || !SAFE_RELATIVE_PATH.test(directory)) return null;

    const entryMatch = raw.match(/\b(?:confirm|verify|check)\s+(?:that\s+)?[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+\.[A-Za-z0-9]{1,16})[`'"“”]?\s+exists\b/i)
        || raw.match(/(?:تحقق|تاكد|تأكد)\s+(?:من\s+)?(?:وجود\s+)?[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+\.[A-Za-z0-9]{1,16})[`'"“”]?/i);
    const expectedEntry = String(entryMatch?.[1] || '').trim().replace(/[.,؛،:]+$/u, '');
    return { path: directory, ...(expectedEntry ? { expectedEntry } : {}) };
}

/**
 * Extract only an explicit, bounded file contract. This is deliberately not a
 * general language parser: vague requests still go through the normal planner.
 * A named path plus declared content is enough evidence to avoid an LLM making
 * up an unrelated project scaffold.
 */
export function parseExplicitFileRequest(input: string): ExplicitFileRequest | null {
    const raw = String(input || '').trim();
    if (!raw) return null;

    // An incomplete or mixed quoted-text command must not fall through to the
    // broader legacy containing/with-content grammar and lose its extra action.
    if (/^(?:(?:please\s+)?(?:write|save)\s+(?:exactly\s+)?|(?:من\s+فضلك\s+)?(?:اكتب|احفظ)\s+(?:بالضبط\s+)?)["'\x60“]/iu.test(raw)) {
        return parseQuotedTextWriteRequest(raw);
    }

    const mutation = /\b(?:create|write|save|make)\b|(?:أنشئ|انشئ|أنشأ|انشا|اكتب|احفظ|حفظ)\s+(?:ملف|الملف)/i.test(raw);
    const fileMention = /\bfile\b|ملف|الملف/i.test(raw);
    if (!mutation || !fileMention) return null;

    const pathMatch = raw.match(/(?:file\s+(?:named|called)|ملف\s+(?:باسم|اسمه)|اسم\s+الملف)\s*[`'"“”]?([^\s`'"“”،؛]+)[`'"“”]?/i)
        || raw.match(/(?:create|write|save)\s+[`'"“”]?([A-Za-z0-9_\-.\/\\]+\.[A-Za-z0-9]{1,16})[`'"“”]?/i);
    if (/^[A-Za-z]:/i.test(String(pathMatch?.[1] || ''))) return null;
    let filePath = String(pathMatch?.[1] || '').trim().replace(/[.,؛،:]+$/, '');
    const folderMatch = raw.match(/(?:folder|directory)\s+(?:named|called)\s*[`'"“”]?([A-Za-z0-9_\-.\/\\]+)[`'"“”]?/i)
        || raw.match(/(?:مجلد|دليل)\s+(?:باسم|اسمه)\s*[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+)[`'"“”]?/i);
    const isNested = !!folderMatch && /(?:inside\s+(?:it|the\s+folder)|داخل(?:ه|ها|ه\s+ثم)|فيه|بداخله)/i.test(raw);
    if (isNested && folderMatch?.[1] && filePath && !filePath.includes('/')) {
        filePath = `${folderMatch[1]}/${filePath}`;
    }
    if (!filePath || filePath.includes('..') || filePath.startsWith('/') || /^[A-Za-z]:/i.test(filePath) || !SAFE_RELATIVE_PATH.test(filePath)) return null;

    const contentMatch = raw.match(/(?:containing|with\s+content|contents?)\s+(?:(?:exactly\s+)?(?:\d+|one|two|three|four|five)\s+lines?\s*:\s*)?([\s\S]*)/i)
        || raw.match(/(?:يحتوي\s+على|بمحتوى)\s+(?:(?:بالضبط\s+)?(?:\d+|سطر|سطرين|ثلاثة\s+أسطر|ثلاثة\s+سطور)\s*[:：]\s*)?([\s\S]*)/i);
    if (!contentMatch?.[1]) return null;

    const body = contentMatch[1].trim();
    const closingQuote: Record<string, string> = { '"': '"', "'": "'", '`': '`', '“': '”' };
    const closing = closingQuote[body[0]];
    let content: string;
    let followUp: string;
    if (closing) {
        // Quoted text is literal, even when it contains command words. Keep
        // escaped delimiters and whitespace intact; an unclosed quote is vague.
        let end = 1;
        for (; end < body.length; end++) {
            if (body[end] === '\\') { end++; continue; }
            if (body[end] === closing) break;
        }
        if (end >= body.length) return null;
        content = body.slice(1, end);
        followUp = body.slice(end + 1);
    } else {
        // JavaScript \b does not recognize Arabic word boundaries.
        const separator = body.match(/(?:\.\s*|\s+)(?:then\b|after\s+that\b|finally\b|ثم(?=\s|$)|بعد\s+ذلك(?=\s|$)|اخيرا(?=\s|$))/iu);
        const end = separator?.index ?? body.length;
        content = body.slice(0, end).trim();
        followUp = body.slice(end);
    }
    const declaredLines = raw.match(/(?:exactly|بالضبط)\s+(\d+|one|two|three|four|five)\s+(?:lines?|أسطر|سطور)/i);
    const lineCountWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const lineCount = declaredLines ? (Number(declaredLines[1]) || lineCountWords[declaredLines[1].toLowerCase()]) : 0;
    if (lineCount > 1 && !content.includes('\n') && content.split(';').length === lineCount) {
        content = content.split(';').map(line => line.trim()).join('\n');
    }

    return {
        path: filePath,
        content,
        readBack: /(?:then|after\s+that|finally)[\s\S]{0,100}\b(?:read|report|verify)|read\s+(?:the\s+)?file\s+back|اقرأ\s+(?:ال)?ملف|قراءة\s+(?:ال)?ملف/i.test(followUp),
    };
}

/**
 * Extract a bounded request to append literal text to an existing file. This
 * is deliberately separate from file creation: "append" promises to preserve
 * the existing bytes and must fail if the named file is absent.
 */
export function parseExplicitAppendFileRequest(input: string): ExplicitAppendFileRequest | null {
    const raw = String(input || '').trim();
    if (!raw || !/\b(?:append|add)\b|(?:أضف|اضف|ألحق|الحق)/i.test(raw)) return null;

    const pathMatch = raw.match(/\b(?:to|into)\s+(?:the\s+)?(?:file\s+)?[`'\"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+\.[A-Za-z0-9]{1,16})[`'\"“”]?/i)
        || raw.match(/(?:إلى|الى|في)\s+(?:ملف|الملف)?\s*[`'\"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+\.[A-Za-z0-9]{1,16})[`'\"“”]?/i);
    const filePath = String(pathMatch?.[1] || '').trim().replace(/[.,؛،:]+$/u, '');
    if (!filePath || filePath.includes('..') || filePath.startsWith('/') || /^[A-Za-z]:/i.test(filePath) || !SAFE_RELATIVE_PATH.test(filePath)) return null;

    const linePrefix = '(?:exactly\\s+)?(?:(?:one|a|the)\\s+)?(?:(?:first|second|third|fourth|fifth|\\d+(?:st|nd|rd|th)?)\\s+)?(?:new\\s+)?line';
    const english = new RegExp(`\\b(?:append|add)\\s+${linePrefix}\\s+[` + "`'\"“”" + `]([^` + "`'\"“”" + `\\r\\n]+)[` + "`'\"“”" + `]`, 'i');
    const contentMatch = raw.match(english)
        || raw.match(/(?:أضف|اضف|ألحق|الحق)\s+(?:بالضبط\s+)?(?:سطر(?:اً|ا)?|السطر)\s*[`'\"“”]([^`'\"“”\r\n]+)[`'\"“”]/i);
    const content = String(contentMatch?.[1] || '').trim();
    if (!content) return null;

    const ordinal = raw.match(/\b(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)?\s+line\b/i);
    const ordinalWords: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
    const expectedFinalLineCount = ordinal
        ? (Number(ordinal[1]) || ordinalWords[ordinal[1].toLowerCase()])
        : undefined;

    return {
        path: filePath,
        content,
        readBack: /read\s+(?:the\s+)?(?:whole\s+)?file\s+back|report\s+(?:the\s+)?final\s+line\s+count|اقر[أا]\s+(?:الملف|محتواه)|عدد\s+الأسطر/i.test(raw),
        ...(expectedFinalLineCount ? { expectedFinalLineCount } : {}),
    };
}

/**
 * Extract named files from a read-only request. A workspace can contain many
 * projects, but an explicit relative file path is already a precise target;
 * forcing project selection here loses the user's actual scope.
 */
/** A complete read/report request; filenames never grant other capabilities. */
export function parseExplicitFileReadRequest(input: string): string | null {
    const raw = String(input || '').trim();
    const target = '(?:"([^"\\r\\n]+)"|\'([^\'\\r\\n]+)\'|“([^”\\r\\n]+)”|([^\\s"\'“”]+))';
    const english = new RegExp(`^(?:please\\s+)?read\\s+(?:the\\s+)?file\\s+${target}(?:\\s+and\\s+(?:report|show)\\s+(?:its|the)\\s+(?:exact\\s+)?contents?)?\\s*[.!]?\\s*$`, 'i');
    const arabic = new RegExp(`^(?:من\\s+فضلك\\s+)?(?:اقرأ|اقرا)\\s+(?:الملف|ملف)\\s+${target}(?:\\s+(?:و|ثم\\s+)(?:اعرض|أظهر|اظهر)\\s+(?:محتواه|محتوى\\s+الملف))?\\s*[.؟!]?\\s*$`, 'u');
    let match = raw.match(english) || raw.match(arabic);
    if (!match && raw.length <= 8192) {
        const prefix = explicitReadPrefix(raw);
        if (prefix && isBoundedReadReportTail(raw.slice(prefix[0].length))) match = prefix;
    }
    if (!match) return null;
    const file = match[4] !== undefined ? match[4].replace(/[.!؟]+$/u, '')
        : String(match.slice(1).find(value => value !== undefined) || '');
    if (!file || file.length > 512 || !SAFE_READ_PATH.test(file) || file.includes('..')
        || /^[\\/]/.test(file) || /^[A-Za-z]:/.test(file)) return null;
    return file;
}

function explicitReadPrefix(raw: string): RegExpMatchArray | null {
    const target = '(?:"([^"\\r\\n]+)"|\'([^\'\\r\\n]+)\'|“([^”\\r\\n]+)”|([^\\s"\'“”،,؛;]+))';
    return raw.match(new RegExp(`^(?:please\\s+)?read\\s+(?:the\\s+)?file\\s+${target}`, 'i'))
        || raw.match(new RegExp(`^(?:من\\s+فضلك\\s+)?(?:اقرأ|اقرا)\\s+(?:الملف|ملف)\\s+${target}`, 'u'));
}

function readAuthorityText(input: string): string {
    return input.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[‘’]/g, "'")
        .replace(/"[^"]*"|(?<!\w)'[^']*'(?!\w)|“[^”]*”|«[^»]*»|`[^`]*`/g, ' ');
}

function globalReadDenial(input: string): boolean {
    const tail = readAuthorityText(input);
    return /\b(?:no\s+(?:tools?|execution|file\s+access)|answer[-\s]+only|only\s+answer|(?:do\s+not|don't|never)\s+(?:access|read))\b|\b(?:without\s+(?:(?:using|calling|executing)\s+)?|(?:do\s+not|don't|never)\s+(?:use|call|execute)\s+)(?:any\s+|the\s+)?tools?\b|\b(?:do\s+not|don't|never)\s+(?:execute|run)\s+anything\b|(?:^|[^\p{L}\p{N}_])و?(?:[أا]جب\s+فقط|اشرح\s+فقط|الرد\s+فقط|إجابة\s+فقط)(?=$|[^\p{L}\p{N}_])|(?:لا|ولا)\s+(?:تقرأ|تقرا|تصل)(?=$|[^\p{L}\p{N}_])|(?:لا|ولا|دون|بدون)\s+(?:(?:تستخدم|تستعمل|تستدعي|تنفذ|تشغل|استخدام|استعمال|تشغيل|تنفيذ)\s+)?(?:أي\s+|اي\s+)?(?:ال)?(?:أدوات|ادوات)(?=$|[^\p{L}\p{N}_])|(?:دون|بدون)\s+(?:قراءة|تنفيذ)(?=$|[^\p{L}\p{N}_])/iu.test(tail);
}

/** A named read never overrides a complete tool/file-access denial. Filename text is data. */
export function hasGlobalExplicitReadDenial(input: string): boolean {
    const raw = String(input || '').trim();
    const prefix = explicitReadPrefix(raw);
    return !!prefix && globalReadDenial(raw.slice(prefix[0].length));
}

function hasAdditionalReadOperation(input: string): boolean {
    const authority = readAuthorityText(input);
    // Sequential/precondition clauses exceed a read plus report contract.
    return /\b(?:then|after|before|once|afterwards|instead)\b|(?:^|[^\p{L}\p{N}_])(?:ثم|بعد|قبل)(?=$|[^\p{L}\p{N}_])/iu.test(authority)
        || /(?:\b(?:and|but|or)\s+|[،,:])\s*(?:(?:please|also|kindly)\s+)*(?:run|execute|write|edit|delete|install|deploy|open|read|create|save|move|copy|download|capture|navigate|click|submit|send|publish|commit|build|rename|upload|start|test(?!\s+(?:commands?|results?|counts?|scripts?|names?)\b))\b|(?:^|[\s،,:])(?:و|(?:أو|او)\s+)(?:(?:ايضا|أيضا)\s+|من\s+فضلك\s+)*ت?(?:شغل|نفذ|اكتب|عدل|احذف|ثبت|افتح|اقرأ|اقرا|انشئ|انسخ|انقل|التقط|صور|نزل|ارسل|انشر|اختبر)(?=$|[\s،:؛.!?؟])/iu.test(authority);
}

/** Only a complete finite negative list can carry OR's negation to another verb. */
function readConstraintAuthority(input: string): string | null {
    const authority = readAuthorityText(input).replace(/^[.!?؟;؛،,\s]+/u, '').trim();
    const englishOperation = '(?:(?:write|edit|modify|change|create|delete|move)\\s+(?:(?:any|the)\\s+)?(?:files?|anything)|run\\s+(?:(?:any|the)\\s+)?(?:commands?|programs?|tests?|scripts?)|install\\s+(?:(?:any|the)\\s+)?(?:packages?|dependencies)|start\\s+(?:(?:a|the)\\s+)?servers?)';
    const englishList = new RegExp(`^(?:do\\s+not|don't|never|without)\\s+${englishOperation}(?:\\s+or\\s+${englishOperation})+\\s*$`, 'iu');
    const arabicOperation = '(?:(?:تعدل|تكتب|تنشئ|تنشي|تحذف|تغير|تنشر)\\s+(?:(?:أي|اي)\\s+ملف|الملفات|ملفات|شيئا?)|(?:تشغل|تثبت)(?:\\s+(?:أو|او)\\s+(?:تشغل|تثبت))*\\s+(?:(?:أي|اي)\\s+برنامج|البرامج|برنامجا?|الحزم|حزما?|شيئا?))';
    const arabicList = new RegExp(`^(?:لا|ولا|دون|بدون)\\s+${arabicOperation}(?:\\s+(?:(?:أو|او)\\s+|ولا\\s+)${arabicOperation})*\\s*$`, 'u');
    const nounList = /^no\s+(?:file\s+)?(?:writes?|changes?|runs?|installs?)(?:\s*(?:,|\bor\b)\s*(?:writes?|changes?|runs?|installs?))*$/iu;
    if (!englishList.test(authority) && !arabicList.test(authority) && !nounList.test(authority)) {
        return /\bor\b|(?:^|[^\p{L}\p{N}_])(?:أو|او)(?=$|[^\p{L}\p{N}_])/iu.test(authority) ? null : authority;
    }
    return authority.replace(/\bor\s+(?:write|edit|modify|change|create|delete|move|run|install|start)\b|(?:أو|او)\s+(?:تعدل|تكتب|تنشئ|تنشي|تحذف|تشغل|تثبت|تغير|تنشر)(?=$|[\s،:؛.!?؟])/giu, ' ');
}

/** Reporting is an output operation. Unknown clauses never borrow read authority. */
function isBoundedReadReportTail(input: string): boolean {
    let tail = input.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').trim();
    if (!tail || tail.length > 1800) return false;
    // A complete denial of tools/file access outranks the requested read.
    if (globalReadDenial(tail)) return false;
    tail = tail.replace(/^\s*(?:from|in)\s+(?:the\s+)?(?:selected|current|active)\s+(?:project|workspace)\b/i, '')
        .replace(/^\s*من\s+(?:المشروع|مساحة\s+العمل)\s+(?:المحدد|الحالي|النشط)/u, '').trim();
    const report = tail.match(/^[،,;؛.\s]*(?:(?:and|then)\s+|و|ثم\s+)?(?:report|show|tell\s+me|summari[sz]e|describe|extract|أخبرني|اخبرني|أخبرنا|اخبرنا|اعرض|استخرج|لخص|اذكر)(?=$|[\s،,:؛.!?؟])[^.!?؟;؛\n]{1,1000}/iu);
    if (report) {
        // Separate imperative actions in the report cannot be silently dropped.
        if (hasAdditionalReadOperation(report[0])) return false;
        tail = tail.slice(report[0].length).trim();
    }
    // Only operation-specific prohibitions may follow a report or read.
    const constraint = /^(?:[.!?؟;؛،,\s]*)(?:(?:do\s+not|don't|never|without)\s+(?:write|edit|modify|change|create|delete|move|run|install|start|build|deploy|publish|commit)\b|no\s+(?:file\s+)?(?:writes?|changes?|runs?|installs?)\b|(?:لا|ولا|دون|بدون)\s+(?:تعدل|تكتب|تنشئ|تنشي|تحذف|تشغل|تثبت|تغير|تنشر))[^.!?؟;؛\n]*/iu;
    let remaining = tail;
    while (remaining && !/^[.!?؟;؛\s]*$/u.test(remaining)) {
        const denied = remaining.match(constraint);
        // OR inherits this already-validated prohibition; affirmative/sequential
        // clauses still pass through the ordinary additional-operation check.
        const denialAuthority = denied && readConstraintAuthority(denied[0]);
        if (!denied || denialAuthority === null || hasAdditionalReadOperation(denialAuthority!) || /\b(?:but|however)\b|(?:لكن|بل)(?=$|[\s،:؛])/iu.test(denied[0])) return false;
        remaining = remaining.slice(denied[0].length).trim();
    }
    return !!report || remaining !== tail;
}

export function parseExplicitReadFilesRequest(input: string): string[] | null {
    const raw = String(input || '').trim();
    if (!raw || !/\b(?:read|inspect|review|compare|report|list|summarize)\b|(?:اقرا|اقرأ|افحص|راجع|قارن|اعرض|لخص|استخرج)/i.test(raw)) return null;
    if (parseExplicitDirectoryInspectionRequest(raw)) return null;
    const mutationPattern = /\b(?:create|write|save|edit|delete|modify|change|build|install|deploy)\b/gi;
    let mutation: RegExpExecArray | null;
    while ((mutation = mutationPattern.exec(raw)) !== null) {
        const before = raw.slice(Math.max(0, mutation.index - 90), mutation.index);
        if (!/\b(?:do\s+not|don't|never|without|no)\b[^.!?\n]{0,90}$/i.test(before)) return null;
    }
    if (/(?:انشئ|أنشئ|اكتب|عدل|عدّل|احذف|غير|غيّر|ابن|ابني)/i.test(raw)) {
        const positiveArabic = /(?:^|[\s،؛:])(?:انشئ|أنشئ|اكتب|عدل|عدّل|احذف|غير|غيّر|ابن|ابني)(?=$|[\s،؛:.!?])/i;
        const negatedArabic = /(?:لا|بدون|عدم)\s+(?:أن\s+)?[^.!؟\n]{0,70}(?:انشئ|أنشئ|اكتب|عدل|عدّل|احذف|غير|غيّر|ابن|ابني)/i;
        if (positiveArabic.test(raw) && !negatedArabic.test(raw)) return null;
    }

    // URLs contain strings that look exactly like local files (127.0,
    // example.com, api/health). Remove complete web targets before extracting
    // workspace paths, while keeping any real file mentioned elsewhere.
    const fileOnlyText = raw.replace(/\bhttps?:\/\/[^\s<>'"`]+/gi, ' ');
    const candidates = [...fileOnlyText.matchAll(/\b(?:[A-Za-z0-9_\-\u0600-\u06FF]+\/)+[A-Za-z0-9_.\-\u0600-\u06FF]+\b|\b[A-Za-z0-9_\-\u0600-\u06FF]+\.[A-Za-z0-9]{1,16}\b/g)]
        .map(match => String(match[0] || '').replace(/[.,؛،:]+$/u, ''))
        .filter(candidate => candidate && candidate.toLowerCase() !== 'node.js')
        .filter(candidate => SAFE_READ_PATH.test(candidate) && !candidate.includes('..') && !candidate.startsWith('/') && !/^[A-Za-z]:/i.test(candidate));
    const files = [...new Set(candidates)];
    return files.length > 0 && files.length <= 8 ? files : null;
}

export function parseExpectedReadMarkers(input: string): Record<string, string> {
    const raw = String(input || '');
    const markers: Record<string, string> = {};
    const pathPattern = '(?:[A-Za-z0-9_\\-\\u0600-\\u06FF]+/)*[A-Za-z0-9_\\-\\u0600-\\u06FF]+\\.[A-Za-z0-9]{1,16}';
    const pattern = new RegExp(`\\b(${pathPattern})\\b[^.\\n]{0,80}?\\b(?:contains|includes|has)\\b[^\\"“”']{0,30}[\\"“”']([^\\"“”']{1,160})[\\"“”']`, 'gi');
    for (const match of raw.matchAll(pattern)) {
        const file = String(match[1] || '').replace(/\\/g, '/');
        const marker = String(match[2] || '').trim();
        if (file && marker && SAFE_READ_PATH.test(file) && !file.includes('..') && !file.startsWith('/') && !/^[A-Za-z]:/i.test(file)) {
            markers[file] = marker;
        }
    }
    return markers;
}
