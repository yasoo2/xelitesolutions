import { normalise } from '../language/arabic';

/** Request data only. Never infer execution authority from a tool schema. */
export const isContextOption = (key: string): boolean => /^(?:__)?(?:userId|workspaceId|sessionId|runId|traceId|signal|cancellation|isCancelled|auth|credentials|password|secret|token|apiKey|modelConfig|autoApproveAll|autoApproveSafe|bypass)$/i.test(key);

export interface RequestedOptions { values: Record<string, unknown>; invalid: boolean }

/** Shared by discovery and invocation so requested options cannot vanish between them. */
export function requestedPrimitiveOptions(goal: string, props: Record<string, any>): RequestedOptions {
    const values: Record<string, unknown> = {};
    let invalid = false;
    for (const [key, schema] of Object.entries(props)) {
        if (isContextOption(key) || !['string', 'boolean', 'number', 'integer'].includes(schema?.type)) continue;
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = goal.match(new RegExp(String.raw`(?:^|[\s,{])"?${escaped}"?\s*[:=]\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|true|false)(?=$|[\s,}.])`, 'iu'));
        if (!match) continue;
        let value: unknown;
        try { value = JSON.parse(match[1]); } catch { invalid = true; continue; }
        values[key] = value;
        if (schema.type === 'string' && typeof value !== 'string'
            || schema.type === 'boolean' && typeof value !== 'boolean'
            || schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))
            || schema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) invalid = true;
    }
    const keys = Object.keys(props);
    const filename = keys.find(k => k.toLowerCase() === 'filename' && props[k]?.type === 'string');
    if (filename && values[filename] === undefined) {
        const named = goal.match(/(?:\b(?:save|store|write)\b[^\n]{0,80}?\b(?:as|to|named|with\s+(?:the\s+)?(?:exact\s+)?(?:file\s*name|filename)|under\s+(?:the\s+)?(?:name|filename))\s*[:=]?\s+|(?:احفظ|احفظها|حفظ)[^\n]{0,80}?(?:باسم|كملف)\s+)("[^"]+"|'[^']+'|[^\s,;]+\.[a-z\d]{1,10})/iu);
        if (named) values[filename] = named[1].replace(/^("|')(.*)\1$/u, '$2');
        if (values[filename] === undefined) {
            const standalone = goal.match(/(?:\bunder\s+(?:the\s+)?(?:exact\s+)?(?:filename|file\s*name|name)|\bwith\s+(?:the\s+)?(?:exact\s+)?(?:filename|file\s*name))\s*[:=]?\s+("[^"]+"|'[^']+'|[^\s,;]+\.[a-z\d]{1,10})/iu);
            if (standalone) values[filename] = standalone[1].replace(/^("|')(.*)\1$/u, '$2');
        }
    }
    const width = keys.find(k => k.toLowerCase() === 'width' && ['number', 'integer'].includes(props[k]?.type));
    const height = keys.find(k => k.toLowerCase() === 'height' && ['number', 'integer'].includes(props[k]?.type));
    if (width && height) {
        const pair = '(\\d+)\\s*(?:by|x|×)\\s*(\\d+)';
        const before = goal.match(new RegExp('(?:\\bat\\b|\\bsize\\b|\\bviewport\\b|\\bdimensions\\b|بحجم|بمقاس)\\s*[:=]?\\s*'+pair+'(?:\\s*(?:pixels?|px|بكسل))?', 'iu'));
        const after = goal.match(new RegExp('\\b'+pair+'\\s*(?:pixels?|px)\\s+(?:viewport|dimensions|size)\\b', 'iu'));
        const size = before || after;
        if (size) {
            if (values[width] === undefined) values[width] = Number(size[1]);
            if (values[height] === undefined) values[height] = Number(size[2]);
        }
    }
    // Fold label words through the shared Arabic reader, never filenames,
    // URLs or numeric tokens: NFKD would turn superscripts into digits.
    const prose = goal.replace(/https?:\/\/[^\s]+|"[^"]*"|'[^']*'/giu, m => ' '.repeat(m.length));
    const labels: Record<string, string | undefined> = {
        width, عرض: width, بعرض: width, العرض: width, والعرض: width,
        height, ارتفاع: height, بارتفاع: height, وارتفاع: height, الارتفاع: height, والارتفاع: height,
    };
    const named: Record<string, number> = {};
    for (const segment of new Intl.Segmenter('ar', { granularity: 'word' }).segment(prose)) {
        if (!segment.isWordLike) continue;
        const label = normalise(segment.segment);
        if (!Object.prototype.hasOwnProperty.call(labels, label)) continue;
        const key = labels[label];
        if (!key || isContextOption(key) || values[key] !== undefined) continue;
        const rest = prose.slice(segment.index + segment.segment.length);
        const match = rest.match(/^\s*(?:[:=]\s*|of\s+)?(-?[0-9\u0660-\u0669\u06f0-\u06f9]+(?:[.\u066b][0-9\u0660-\u0669\u06f0-\u06f9]+)?)(?![\p{L}\p{N}\p{M}_.])/iu);
        if (!match) {
            if (/^\s*(?:[:=]\s*|of\s+)?-?[\p{N}]/iu.test(rest)) invalid = true;
            continue;
        }
        const token = match[1].replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, c =>
            String(c.charCodeAt(0) - (c >= '\u06f0' ? 0x06f0 : 0x0660))).replace('\u066b', '.');
        const number = Number(token);
        if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) { invalid = true; continue; }
        if (named[key] !== undefined && named[key] !== number) invalid = true;
        named[key] = number;
    }
    for (const [key, number] of Object.entries(named)) values[key] = number;
    const fullPage = keys.find(k => k.toLowerCase() === 'fullpage' && props[k]?.type === 'boolean');
    if (fullPage && values[fullPage] === undefined && /full[ -]+page|entire[ -]+page|الصفحة\s+كاملة|صفحة\s+كاملة/iu.test(goal)) {
        values[fullPage] = !/(?:do\s+not|don't|dont|not|no|without)\s+(?:(?:capture|take|save|include|use)\s+)?(?:(?:an?|the)\s+)?(?:full[ -]+page|entire[ -]+page)|(?:لا|بدون)[^\n]{0,15}صفحة\s+كاملة/iu.test(goal);
    }
    return { values, invalid };
}
