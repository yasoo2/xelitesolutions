// JWT-shaped bearer credential: eyJ header plus three dot-separated
// segments. Same shape contract as web/src/utils/redactUrl.ts. No leading
// word boundary on purpose: a JWT embedded in a longer run must still be
// caught (fail closed), never missed because of a missing boundary.
const JWT_SHAPED_CREDENTIAL = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

export function redactSecretsFromString(input: string): string {
    if (!input) return input;
    return input
        .replace(JWT_SHAPED_CREDENTIAL, '[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
        .replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]')
        .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]')
        .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
        .replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/([?&]password=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
        .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET|OPENAI_API_KEY)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
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
