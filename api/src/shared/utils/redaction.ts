export function redactSecretsFromString(input: string): string {
    if (!input) return input;
    return input
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
