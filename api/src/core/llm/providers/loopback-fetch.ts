import http from 'http';
import { Readable } from 'stream';
import { isThisMachineEndpoint } from '../../../shared/this-machine-host';

/**
 * fetch() for the machine's own inference server, without the timer Node's
 * built-in fetch (undici) arms on every request: 300 s to receive the
 * response headers.
 *
 * Eval round 6, 2026-10-23: local plans armed for 30 minutes kept failing at
 * 311-414 s. Instrumented, the rejection read
 * `TypeError / HeadersTimeoutError / UND_ERR_HEADERS_TIMEOUT afterMs 312433`,
 * while llama-server had spent 253 s reading a 1264-token prompt and was
 * cancelled 75 tokens into the answer (Ollama then logged `500 POST /api/chat`).
 * A non-streamed answer sends no headers until its last token, so on a CPU
 * every call longer than five minutes was cut by the transport, whatever
 * deadline its caller set. Callers own their deadlines (AbortSignal); this
 * transport adds none.
 *
 * ⛔ ANY SERVER ON THIS MACHINE, AND EVERY CALLER (round 22). It served only
 * the three canonical loopback spellings, and only the callers that asked for
 * it: Ollama at OLLAMA_HOST=http://0.0.0.0:11434 (its own Linux server value),
 * a vLLM or LM Studio server reached through the OpenAI library — the
 * compatible path a GPU server runs — all went through undici and its 300 s
 * header timer, the round-6 failure. A server on this machine is decided by
 * its address, not its spelling (shared/this-machine-host), and the OpenAI
 * library is handed this transport as its fetch. Its headers arrive as a
 * Headers object, so every HeadersInit form is read.
 */
let installed = false;

interface LoopbackInit {
    method?: string;
    headers?: unknown;
    body?: string | Uint8Array;
    signal?: AbortSignal | null;
    redirect?: string;
}

/** Every header of any HeadersInit form (a Headers object, pairs, a record) as a plain record. */
function plainHeaders(headers: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;
    try {
        new Headers(headers as any).forEach((value, key) => { out[key] = value; });
    } catch {
        for (const [key, value] of Object.entries(headers as Record<string, unknown>)) out[key] = String(value);
    }
    return out;
}

/** A body this transport writes as it is: none, text or bytes. A stream or form goes to the global fetch. */
function servableBody(body: unknown): boolean {
    return body === undefined || body === null || typeof body === 'string' || body instanceof Uint8Array;
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
}

export function loopbackFetch(input: string, init: LoopbackInit = {}): Promise<Response> {
    const url = new URL(input);
    if (url.protocol !== 'http:' || !isThisMachineEndpoint(url.href)) {
        return Promise.reject(new TypeError('loopbackFetch only serves plain http to a server on this machine.'));
    }
    const signal = init.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<Response>((resolve, reject) => {
        const headers: Record<string, string | number> = plainHeaders(init.headers);
        if (init.body !== undefined && init.body !== null) headers['Content-Length'] = typeof init.body === 'string' ? Buffer.byteLength(init.body, 'utf8') : init.body.byteLength;
        const request = http.request(url, { method: init.method ?? 'GET', headers }, response => {
            const status = response.statusCode ?? 0;
            if (init.redirect === 'error' && status >= 300 && status < 400) {
                response.destroy();
                reject(new TypeError('Unexpected redirect from the loopback inference server.'));
                return;
            }
            const responseHeaders = new Headers();
            for (let i = 0; i + 1 < response.rawHeaders.length; i += 2) responseHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
            const empty = status === 204 || status === 304 || (init.method ?? 'GET').toUpperCase() === 'HEAD';
            if (empty) response.resume();
            response.once('close', () => signal?.removeEventListener('abort', onAbort));
            resolve(new Response(empty ? null : Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>,
                { status, statusText: response.statusMessage, headers: responseHeaders }));
        });
        const onAbort = (): void => {
            const reason = abortReason(signal!);
            request.destroy(reason instanceof Error ? reason : new Error(String(reason)));
            reject(reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        request.once('error', error => {
            signal?.removeEventListener('abort', onAbort);
            reject(error);
        });
        request.end(init.body);
    });
}

function isLoopbackHttp(input: string): boolean {
    try {
        const url = new URL(input);
        return url.protocol === 'http:' && isThisMachineEndpoint(url.href);
    } catch { return false; }
}

/**
 * Joe's server installs this transport at startup (api/index.ts); until then —
 * in unit tests, scripts and any embedding — the global fetch is used as is,
 * so a fetch double or the network guard keeps working unchanged.
 */
export function installLoopbackInferenceTransport(): void { installed = true; }

/** The transport for a local inference call: the loopback transport for a loopback host once installed, else the global fetch. */
export function localInferenceFetch(): typeof fetch {
    const current = globalThis.fetch;
    if (!installed) return current;
    return ((input: any, init?: any) => isLoopbackHttp(String(input)) && servableBody(init?.body)
        ? loopbackFetch(String(input), init)
        : current(input, init)) as typeof fetch;
}
