import http from 'http';
import { Readable } from 'stream';

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
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
let installed = false;

interface LoopbackInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal | null;
    redirect?: string;
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
}

export function loopbackFetch(input: string, init: LoopbackInit = {}): Promise<Response> {
    const url = new URL(input);
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
        return Promise.reject(new TypeError('loopbackFetch only serves plain http on a loopback host.'));
    }
    const signal = init.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<Response>((resolve, reject) => {
        const headers: Record<string, string | number> = { ...(init.headers ?? {}) };
        if (init.body !== undefined) headers['Content-Length'] = Buffer.byteLength(init.body, 'utf8');
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
        return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
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
    return ((input: any, init?: any) => isLoopbackHttp(String(input))
        ? loopbackFetch(String(input), init)
        : current(input, init)) as typeof fetch;
}
