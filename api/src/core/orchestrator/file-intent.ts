export interface ExplicitFileRequest {
    path: string;
    content: string;
    readBack: boolean;
}

const SAFE_RELATIVE_PATH = /^[A-Za-z0-9_\-.\/\\\u0600-\u06FF]+$/;

/**
 * Extract only an explicit, bounded file contract. This is deliberately not a
 * general language parser: vague requests still go through the normal planner.
 * A named path plus declared content is enough evidence to avoid an LLM making
 * up an unrelated project scaffold.
 */
export function parseExplicitFileRequest(input: string): ExplicitFileRequest | null {
    const raw = String(input || '').trim();
    if (!raw) return null;

    const mutation = /\b(?:create|write|save|make)\b|(?:أنشئ|انشئ|أنشأ|انشا|اكتب|احفظ|حفظ)\s+(?:ملف|الملف)/i.test(raw);
    const fileMention = /\bfile\b|ملف|الملف/i.test(raw);
    if (!mutation || !fileMention) return null;

    const pathMatch = raw.match(/(?:file\s+(?:named|called)|ملف\s+(?:باسم|اسمه)|اسم\s+الملف)\s*[`'"“”]?([^\s`'"“”،؛:]+)[`'"“”]?/i)
        || raw.match(/(?:create|write|save)\s+[`'"“”]?([A-Za-z0-9_\-.\/\\]+\.[A-Za-z0-9]{1,16})[`'"“”]?/i);
    let filePath = String(pathMatch?.[1] || '').trim().replace(/[.,؛،:]+$/, '');
    const folderMatch = raw.match(/(?:folder|directory)\s+(?:named|called)\s*[`'"“”]?([A-Za-z0-9_\-.\/\\]+)[`'"“”]?/i)
        || raw.match(/(?:مجلد|دليل)\s+(?:باسم|اسمه)\s*[`'"“”]?([A-Za-z0-9_\-.\/\\\u0600-\u06FF]+)[`'"“”]?/i);
    const isNested = !!folderMatch && /(?:inside\s+(?:it|the\s+folder)|داخل(?:ه|ها|ه\s+ثم)|فيه|بداخله)/i.test(raw);
    if (isNested && folderMatch?.[1] && filePath && !filePath.includes('/')) {
        filePath = `${folderMatch[1]}/${filePath}`;
    }
    if (!filePath || filePath.includes('..') || filePath.startsWith('/') || /^[A-Za-z]:/i.test(filePath) || !SAFE_RELATIVE_PATH.test(filePath)) return null;

    const contentMatch = raw.match(/(?:containing|with\s+content|contents?)\s+(?:(?:exactly\s+)?(?:\d+|one|two|three|four|five)\s+lines?\s*:\s*)?([\s\S]*?)(?=\.\s*(?:then|after\s+that|finally)\b|\s+(?:then|after\s+that)\b|$)/i)
        || raw.match(/(?:يحتوي\s+على|بمحتوى)\s+(?:(?:بالضبط\s+)?(?:\d+|سطر|سطرين|ثلاثة\s+أسطر|ثلاثة\s+سطور)\s*[:：]\s*)?([\s\S]*?)(?=\.\s*(?:ثم|بعد\s+ذلك|اخيرا)\b|\s+(?:ثم|بعد\s+ذلك)\b|$)/i);
    if (!contentMatch?.[1]) return null;

    let content = contentMatch[1].trim().replace(/^[`'"“”]|[`'"“”]$/g, '').trim();
    const declaredLines = raw.match(/(?:exactly|بالضبط)\s+(\d+|one|two|three|four|five)\s+(?:lines?|أسطر|سطور)/i);
    const lineCountWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const lineCount = declaredLines ? (Number(declaredLines[1]) || lineCountWords[declaredLines[1].toLowerCase()]) : 0;
    if (lineCount > 1 && !content.includes('\n') && content.split(';').length === lineCount) {
        content = content.split(';').map(line => line.trim()).join('\n');
    }

    return {
        path: filePath,
        content,
        readBack: /(?:then|after\s+that|finally)[\s\S]{0,100}\b(?:read|report|verify)|read\s+(?:the\s+)?file\s+back|اقرأ\s+(?:ال)?ملف|قراءة\s+(?:ال)?ملف/i.test(raw),
    };
}
