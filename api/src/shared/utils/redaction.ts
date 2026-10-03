// JWT-shaped Bearer [REDACTED]: eyJ header plus three dot-separated
// segments. Same shape contract as web/src/utils/redactUrl.ts. No leading
// word boundary on purpose: a JWT embedded in a longer run must still be
// caught (fail closed), never missed because of a missing boundary.
const JWT_SHAPED_CREDENTIAL = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

export function redactSecretsFromString(input: string): string {
    if (!input) return input;
    return redactTier2Assignment(redactTier1Assignment(input
        .replace(JWT_SHAPED_CREDENTIAL, '[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
        .replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]')
        .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]')
        .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
        .replace(QUERY_CREDENTIAL_PARAM, '$1[REDACTED]')
        .replace(URI_USERINFO_PASSWORD, '$1[REDACTED]$3')
        .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
        .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET|OPENAI_API_KEY)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]')));
}

// Credential-cue names by MEANING, not by vendor. Tier-1 names are
// unambiguous (a field CALLED password holding a value IS a credential), so
// any non-trivial value redacts. Tier-2 names are ambiguous in free text
// (`key` is also a keyboard/object key, `token` a parser token), so the value
// must additionally look secret-shaped (digit-bearing or long). Both tiers
// share the word-boundary guards: the cue must not be the tail of a longer
// word (monkey, donkey) nor the head of one (tokenizer, author,
// authentication); camelCase humps (accessToken, apiKey) and snake/kebab
// prefixes (access_token, _csrf) count as compounds.
const SECRET_NAME_TIER1 =
    'client[_-]?secret|private[_-]?key|api[_-]?key|password|passwd|secret';
const SECRET_NAME_TIER2 = 'token|auth|bearer|credential|csrf|key';
const SECRET_NAME_END = '(?:s(?:[_-][A-Za-z0-9_-]*)?|[_-][A-Za-z0-9_-]*|[0-9]+)?';
// URL query/matrix parameters: same cue meanings; the parameter position is
// itself a strong cue, so every non-empty value redacts.
const QUERY_CREDENTIAL_PARAM = new RegExp(
    `([?&;](?:${SECRET_NAME_TIER1}|${SECRET_NAME_TIER2})${SECRET_NAME_END}=)([^&\\s]+)`, 'gi');
// A password in URI userinfo position (scheme://user:PASS@host). Ports never
// match: the pattern requires a literal `@` after the value.
const URI_USERINFO_PASSWORD = /(:\/\/[^/\s:@]+:)([^@/\s]+)(@)/g;

const NULL_LITERALS = /^(?:true|false|null|none|nil|undefined|nan)$/i;
const PURELY_NUMERIC = /^-?[0-9]+(?:\.[0-9]+)?$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function insideMustachePlaceholder(text: string, offset: number): boolean {
    return text.lastIndexOf('{{', offset) > text.lastIndexOf('}}', offset);
}

function splitTrailingPunctuation(value: string): [string, string] {
    const m = value.match(/^(.*?)([)\].,;:!?]+)$/);
    if (!m || !m[1]) return [value, ''];
    return [m[1], m[2]];
}

function assignmentPattern(cues: string): RegExp {
    return new RegExp(
        `(^|[^A-Za-z]|(?<=[a-z])(?=[A-Z]))((?:${cues})${SECRET_NAME_END})(["']?)(\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,&"']+)`,
        'gi');
}

function redactTier1Assignment(text: string): string {
    return text.replace(
        assignmentPattern(SECRET_NAME_TIER1),
        (match, boundary: string, name: string, quote: string, sep: string, value: string, offset: number, whole: string) => {
            if (insideMustachePlaceholder(whole, offset)) return match;
            if (value === '[REDACTED]') return match; // idempotent on prior passes
            const cleanSep = sep.includes(':') ? ':' : '=';
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                if (value.length <= 2) return match; // password: "" means unset, keep it
                return `${boundary}${name}${quote}${cleanSep}[REDACTED]`;
            }
            const [core, punct] = splitTrailingPunctuation(value);
            if (core === '[REDACTED]') return match;
            if (!core || PURELY_NUMERIC.test(core) || NULL_LITERALS.test(core)) return match;
            return `${boundary}${name}${quote}${cleanSep}[REDACTED]${punct}`;
        });
}

function redactTier2Assignment(text: string): string {
    return text.replace(
        assignmentPattern(SECRET_NAME_TIER2),
        (match, boundary: string, name: string, quote: string, sep: string, value: string, offset: number, whole: string) => {
            if (insideMustachePlaceholder(whole, offset)) return match;
            let core = value;
            let trailing = '';
            if ((core.startsWith('"') && core.endsWith('"') && core.length > 2) ||
                (core.startsWith("'") && core.endsWith("'") && core.length > 2)) {
                core = core.slice(1, -1);
            } else {
                [core, trailing] = splitTrailingPunctuation(core);
            }
            if (core === '[REDACTED]') return match; // idempotent on prior passes
            if (!core || PURELY_NUMERIC.test(core) || NULL_LITERALS.test(core) || UUID_SHAPE.test(core)) return match;
            if (!/[0-9]/.test(core) && core.length < 16) return match;
            const cleanSep = sep.includes(':') ? ':' : '=';
            return `${boundary}${name}${quote}${cleanSep}[REDACTED]${trailing}`;
        });
}

/**
 * A sensitive argument name inside a planner-produced shell command: the name
 * itself must be an explicit secret word (optionally prefixed, suffixed by a
 * plural, a separator continuation, or digits). Benign lookalikes such as
 * `--author` or `--tokenizer` must not match, so any other trailing letter
 * continuation disqualifies.
 */
const SENSITIVE_COMMAND_NAME = '(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|auth|bearer|credential)(?:s(?:[_-][A-Za-z0-9_-]*)?|[_-][A-Za-z0-9_-]*|[0-9]+)?';

/**
 * Bounded diagnostic rendering of a planner-produced shell command.
 *
 * Rejected verification commands are named in plan notes and phase logs so a
 * contract mismatch is diagnosable without a run-evidence dig — but the
 * command text itself is model-produced and may embed credentials
 * (`--password=...`, `TOKEN=...`, pasted API keys). Redact sensitive argument
 * values while preserving the command shape that explains the rejection.
 */
export function redactCommandForLog(command: unknown, maxLen = 160): string {
    const collapsed = String(command ?? '').trim().replace(/\s+/g, ' ');
    if (!collapsed) return '';
    const value = '"[^"]*"|\'[^\']*\'|[^\\s,;]+';
    const redacted = redactSecretsFromString(collapsed)
        // --flag=value with a sensitive flag name.
        .replace(new RegExp(`(--[A-Za-z0-9_-]*${SENSITIVE_COMMAND_NAME})=(${value})`, 'gi'), '$1=[REDACTED]')
        // --flag value with a sensitive flag name (the value must not be another flag).
        .replace(new RegExp(`(--[A-Za-z0-9_-]*${SENSITIVE_COMMAND_NAME}\\s+)(?!-)(${value})`, 'gi'), '$1[REDACTED]')
        // Bare NAME=value (env-style prefix or key=value pair).
        .replace(new RegExp(`\\b([A-Za-z0-9_-]*${SENSITIVE_COMMAND_NAME})=(${value})`, 'gi'), '$1=[REDACTED]')
        // NAME: value pairs.
        .replace(new RegExp(`\\b(${SENSITIVE_COMMAND_NAME})\\s*:\\s*(${value})`, 'gi'), '$1:[REDACTED]');
    return redacted.slice(0, Math.max(0, maxLen));
}

export function safeErrorMessage(err: any): string {
    const raw = typeof err?.message === 'string' ? err.message : String(err);
    return redactSecretsFromString(raw);
}

export function redactToolInputForStorage(name: string, input: any) {
    if (!input || typeof input !== 'object') return input;

    // Redact Scaffold Structure
    if (name === 'scaffold_project' && input.structure) {
        const s = input.structure;
        const keys = Object.keys(s);
        const redactedStructure: Record<string, string> = {};
        for (const k of keys) {
            redactedStructure[k] = '[Content Redacted]';
        }
        return { ...input, structure: redactedStructure, _fileCount: keys.length };
    }

    // Redact Shell Commands
    if (name === 'shell_execute') {
        const cmd = typeof (input as any).command === 'string' ? (input as any).command : '';
        const cwd = typeof (input as any).cwd === 'string' ? (input as any).cwd : undefined;
        const timeout = typeof (input as any).timeout === 'number' ? (input as any).timeout : undefined;
        return { ...(input as any), command: redactSecretsFromString(cmd), ...(cwd ? { cwd } : {}), ...(timeout ? { timeout } : {}) };
    }

    // Redact HTTP Headers
    if (name === 'http_fetch') {
        const url = typeof (input as any).url === 'string' ? redactSecretsFromString((input as any).url) : (input as any).url;
        const headersRaw = (input as any).headers;
        if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
            const headers: any = { ...headersRaw };
            for (const k of Object.keys(headers)) {
                if (/^authorization$/i.test(k)) headers[k] = '[REDACTED]';
            }
            return { ...(input as any), url, headers };
        }
        return { ...(input as any), url };
    }

    // Redact Browser Actions
    if (name === 'browser_run') {
        const sessionId = typeof (input as any).sessionId === 'string' ? (input as any).sessionId : undefined;
        const instructionText =
            typeof (input as any).instructionText === 'string' ? redactSecretsFromString((input as any).instructionText) : undefined;
        const actions = Array.isArray((input as any).actions) ? (input as any).actions : [];
        const redactedActions = actions.map((a: any) => {
            const t = String(a?.type || '').toLowerCase();
            // Redact type text
            if (t === 'type') {
                const text = typeof a?.text === 'string' ? a.text : typeof a?.value === 'string' ? a.value : '';
                return { ...a, text: `[redacted:${String(text || '').length}]`, value: undefined };
            }
            // Redact form fields
            if (t === 'fillform') {
                const fields = Array.isArray(a?.fields) ? a.fields : [];
                const nextFields = fields.map((f: any) => {
                    const label = String(f?.label || '').toLowerCase();
                    const selector = String(f?.selector || '').toLowerCase();
                    const combined = `${label} ${selector}`;
                    const v = f?.value == null ? '' : String(f.value);
                    const shouldRedact =
                        Boolean(a?.sensitive) ||
                        Boolean(f?.sensitive) ||
                        /(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(combined);
                    if (!shouldRedact) return f;
                    return { ...f, value: `[redacted:${v.length}]` };
                });
                return { ...a, fields: nextFields };
            }
            // Redact specific fields
            const next: any = { ...a };
            if (typeof next.url === 'string') next.url = redactSecretsFromString(next.url);
            if (typeof next.text === 'string') next.text = redactSecretsFromString(next.text);
            if (typeof next.script === 'string' && next.sensitive) next.script = '[redacted]';
            return next;
        });
        const out: any = { ...(input as any), ...(sessionId ? { sessionId } : {}), ...(instructionText ? { instructionText } : {}) };
        if (Array.isArray(actions)) out.actions = redactedActions;
        return out;
    }

    return input;
}
