/**
 * WHAT A REPAIR MUST NOT TAKE AWAY, MEASURED BEFORE AND AFTER IT.
 *
 * Round 15 review (findings 16, 27, 28): the request-coverage repair asks the
 * local model to rewrite a whole server file. Two things then went unseen:
 *
 *   - a rewritten server that throws at startup was hidden by project_run's
 *     static fallback (ok:true, kind 'static-site' / 'static-build-fallback'),
 *     so live was recorded as passing and the broken file was kept;
 *   - a rewrite that dropped the auth middleware, or moved the records into
 *     memory, still started — and the report kept reprinting the builder's
 *     «writes without a login are refused with 401» and «data survives a
 *     restart» about a file that no longer did either.
 *
 * So the builder's own live claims are measured on the running server BEFORE
 * the repair and again on the restarted server AFTER it, with GET requests and
 * requests that must be refused — never a write that would succeed on a server
 * that protects its writes. A claim that held before and fails after is a
 * regression: the caller restores the file. A claim nobody could re-measure is
 * reported as not re-measured, never reprinted as proven.
 */
import * as http from 'http';

/** project_run answered with static files standing in for the project's own start. */
export function servedByStaticFallback(runResult: any): boolean {
    const output = runResult?.output || {};
    return runResult?.ok === true
        && (!!String(output.fallbackFrom || '').trim() || output.kind === 'static-site' || output.kind === 'static-build-fallback');
}

export interface BuilderProofs {
    /** /api/health answered ok:true. */
    health: boolean;
    /** The builder that wrote the server, from its own health answer («api_project»). */
    contract: string;
    /** Row counts per table, from the builder's health answer. */
    tables: Record<string, number>;
    /** An anonymous write to the primary resource: refused (401/403), rejected as invalid (400/422) or written. */
    anonymousWrite?: { resource: string; status: number; outcome: 'refused' | 'invalid' | 'written' | 'no-answer' };
    /** A login with a password nobody holds. */
    badPassword?: { status: number; refused: boolean };
}

interface Answer { status: number; json: any }

function loopbackBase(baseUrl: string): URL | null {
    try {
        const url = new URL(String(baseUrl || ''));
        if (url.protocol !== 'http:') return null;
        // A probe of the user's own running system only — never another host.
        if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return null;
        return url;
    } catch {
        return null;
    }
}

function ask(base: URL, method: string, route: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Answer> {
    return new Promise(resolve => {
        if (signal?.aborted) return resolve({ status: 0, json: null });
        const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        const req = http.request({
            host: base.hostname.replace(/^\[|\]$/g, ''),
            port: Number(base.port) || 80,
            path: route,
            method,
            headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {},
            timeout: timeoutMs,
        }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { if (text.length < 200_000) text += chunk; });
            res.on('end', () => {
                let json: any = null;
                try { json = JSON.parse(text); } catch { json = null; }
                resolve({ status: res.statusCode || 0, json });
            });
        });
        const abort = () => { req.destroy(); resolve({ status: 0, json: null }); };
        signal?.addEventListener('abort', abort, { once: true });
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null }); });
        req.on('error', () => resolve({ status: 0, json: null }));
        req.on('close', () => signal?.removeEventListener('abort', abort));
        if (payload) req.write(payload);
        req.end();
    });
}

function countsFrom(health: any): Record<string, number> {
    const tables: Record<string, number> = {};
    if (health?.tables && typeof health.tables === 'object') {
        for (const [key, value] of Object.entries(health.tables)) {
            const n = Number(value);
            if (Number.isFinite(n)) tables[key] = n;
        }
    } else if (typeof health?.resource === 'string' && Number.isFinite(Number(health?.count))) {
        tables[health.resource] = Number(health.count);
    }
    return tables;
}

const idOf = (json: any) => json?.id ?? json?.data?.id ?? json?.row?.id ?? json?.item?.id;

/**
 * The builder's live claims on the server answering at baseUrl. Writes are
 * attempted only against a server that declares the api_project contract,
 * whose writes require an account; a write that succeeds anyway (the
 * regression this exists to catch) is deleted again when the server says how.
 */
export async function measureBuilderProofs(baseUrl: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<BuilderProofs> {
    const empty: BuilderProofs = { health: false, contract: '', tables: {} };
    const base = loopbackBase(baseUrl);
    if (!base) return empty;
    const timeoutMs = Math.max(500, Number(opts.timeoutMs) || 2500);
    const health = await ask(base, 'GET', '/api/health', undefined, timeoutMs, opts.signal);
    if (!(health.status >= 200 && health.status < 300 && health.json?.ok === true)) return empty;
    const proofs: BuilderProofs = { health: true, contract: String(health.json?.joe || ''), tables: countsFrom(health.json) };
    if (proofs.contract !== 'api_project') return proofs;
    const resource = typeof health.json?.resource === 'string' ? health.json.resource.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    if (resource) {
        const write = await ask(base, 'POST', `/api/${resource}`, {}, timeoutMs, opts.signal);
        const outcome = write.status === 401 || write.status === 403 ? 'refused'
            : write.status === 400 || write.status === 422 ? 'invalid'
                : write.status >= 200 && write.status < 300 ? 'written'
                    : 'no-answer';
        if (outcome === 'written') {
            const id = idOf(write.json);
            if (id !== undefined && id !== null && /^[a-zA-Z0-9_-]{1,64}$/.test(String(id))) {
                await ask(base, 'DELETE', `/api/${resource}/${encodeURIComponent(String(id))}`, undefined, timeoutMs, opts.signal);
            }
        }
        proofs.anonymousWrite = { resource, status: write.status, outcome };
    }
    const nonce = Math.random().toString(36).slice(2, 10);
    const login = await ask(base, 'POST', '/api/auth/login', { email: `joe-reproof-${nonce}@invalid.local`, password: `wrong-${nonce}` }, timeoutMs, opts.signal);
    if (login.status !== 404 && login.status !== 0) {
        proofs.badPassword = { status: login.status, refused: [400, 401, 403, 429].includes(login.status) };
    }
    return proofs;
}

/** Every claim that held before the repair and does not hold after it. */
export function regressedBuilderProofs(before: BuilderProofs, after: BuilderProofs): string[] {
    const lost: string[] = [];
    if (!before.health) return lost;
    if (!after.health) return ['the server no longer answers /api/health'];
    for (const [table, count] of Object.entries(before.tables)) {
        if (count <= 0) continue;
        const now = after.tables[table];
        if (now === undefined) lost.push(`table «${table}» is no longer reported`);
        else if (now < count) lost.push(`table «${table}» had ${count} row(s) and now has ${now} after the restart`);
    }
    if (before.anonymousWrite?.outcome === 'refused' && after.anonymousWrite?.outcome !== 'refused') {
        lost.push(`an anonymous write to /api/${before.anonymousWrite.resource} was refused before the repair and now answers ${after.anonymousWrite?.status ?? 'nothing'}`);
    }
    if (before.badPassword?.refused && !after.badPassword?.refused) {
        lost.push(`a wrong password was refused before the repair and now answers ${after.badPassword?.status ?? 'nothing'}`);
    }
    return lost;
}

/** Did both measurements read the same builder contract, so its live claims were measured again? */
export function builderClaimsRemeasured(before: BuilderProofs, after: BuilderProofs): boolean {
    return before.health && after.health && before.contract === 'api_project' && after.contract === 'api_project';
}

const LIVE_CLAIM = /الإثبات الحي|تحقّقتُ حيّاً|تحققت حيا|محفوظة على القرص|تنجو من إعادة التشغيل|live proof:|verified live|proven live|survives? (?:a )?restart/iu;

/**
 * A builder message about a server file that a later repair rewrote, when its
 * live claims could not be measured again: every live-proof line becomes one
 * note saying so. Everything else the builder said stays.
 */
export function markUnremeasuredBuilderClaims(message: string, isAr: boolean, file: string): string {
    const lines = String(message || '').split('\n');
    if (!lines.some(line => LIVE_CLAIM.test(line))) return message;
    const note = isAr
        ? `⚠️ عُدّل ${file} بعد إثباته الحي (إصلاح السجلات المطلوبة)، فلم يُعَد قياس ادعاءاته الحية بعد التعديل.`
        : `⚠️ ${file} was rewritten after its live proof (requested-records repair), so its live claims were not measured again.`;
    let noted = false;
    const out: string[] = [];
    for (const line of lines) {
        if (!LIVE_CLAIM.test(line)) { out.push(line); continue; }
        if (!noted) { out.push(note); noted = true; }
    }
    return out.join('\n');
}
