/**
 * A MODEL CALL TO A SERVER ON THIS MACHINE IS ADMITTED, WHATEVER IT IS CALLED.
 *
 * Second review of round 21: the managed Ollama transport and LocalProvider
 * admit their calls (withInference / withLocalModelCall), but the same model
 * reached by another spelling was not — structured.ts's /api/generate for
 * OLLAMA_HOST=http://0.0.0.0:11434 (Ollama's own Linux server value), the
 * router's custom OpenAI-compatible route at a local URL that is not the
 * canonical one, vision's compatible fetch, a compatible gateway configured as
 * OPENAI_API_BASE or LLM7_BASE_URL, an image or speech server on this machine.
 * Those calls ran beside admitted ones, and an install could unload the very
 * model they were using: the idle-model unload is safe only because every
 * model call holds the heavy lane for its whole run.
 *
 * So the question is asked of the address, not of its spelling: a host that
 * resolves to this machine without a lookup — any loopback spelling (URL
 * parsing folds 127.1, 2130706433 and 0x7f000001 into 127.0.0.1), the
 * unspecified address 0.0.0.0 / [::] (a connection to it reaches this
 * machine), localhost and *.localhost, an address of one of this machine's own
 * interfaces, or this machine's own host name. A remote server's memory is not
 * this machine's: its calls are not admitted here.
 */
import * as net from 'node:net';
import * as os from 'node:os';
import { requestResourceManager, type HeavyOptions } from './RequestResourceManager';

function ownAddresses(): Set<string> {
    const own = new Set<string>();
    try {
        for (const list of Object.values(os.networkInterfaces())) {
            for (const entry of list || []) own.add(String(entry.address || '').toLowerCase().replace(/%.*$/, ''));
        }
    } catch { /* no interface list: only the spellings above are known */ }
    return own;
}

/** An IPv4 address that reaches this machine: 127.0.0.0/8 or the unspecified 0.0.0.0. */
function isThisMachineV4(address: string): boolean {
    return address.startsWith('127.') || address === '0.0.0.0';
}

/** The IPv4 address an IPv4-mapped IPv6 address carries (URL parsing writes it as two hex groups), or null. */
function mappedV4(address: string): string | null {
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
    if (dotted) return dotted[1];
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (!hex) return null;
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** True when `endpoint` (a URL, or a bare host[:port] as OLLAMA_HOST allows) names a server on this machine. */
export function isLocalModelEndpoint(endpoint: unknown): boolean {
    const text = String(endpoint ?? '').trim();
    if (!text) return false;
    let url: URL;
    try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`); } catch { return false; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (net.isIPv4(host)) return isThisMachineV4(host) || ownAddresses().has(host);
    if (net.isIPv6(host)) {
        if (host === '::1' || host === '::') return true;
        const v4 = mappedV4(host);
        if (v4) return isThisMachineV4(v4) || ownAddresses().has(v4);
        return ownAddresses().has(host);
    }
    try { return host === os.hostname().toLowerCase().replace(/\.$/, ''); } catch { return false; }
}

/**
 * Run a model call to `endpoint`: admitted as a local model call when the
 * server is on this machine (it holds the heavy lane for its whole run, its
 * own resident model is credited to it and never unloaded for it), run as it
 * is otherwise. The caller passes its cancellation as `signal` and its
 * deadline as `queueTimeoutMs`, so a wait that outlives the deadline is a
 * RESOURCE_QUEUE_TIMEOUT refusal, not a call that ran.
 */
export function admitLocalModelCall<T>(endpoint: unknown, work: (admission?: AbortSignal) => Promise<T>,
    options: HeavyOptions = {}): Promise<T> {
    if (!isLocalModelEndpoint(endpoint)) return work();
    // `admission` is the lease's own cancellation (his request closing): the call stops with it.
    return requestResourceManager.withLocalModelCall(() => work(requestResourceManager.currentSignal()),
        { kind: 'local-model-call', ...options });
}
