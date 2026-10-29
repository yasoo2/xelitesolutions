/**
 * IS THIS ADDRESS THIS MACHINE? — asked of the address, not of its spelling.
 *
 * A host that reaches this machine without a lookup: any loopback spelling
 * (URL parsing folds 127.1, 2130706433 and 0x7f000001 into 127.0.0.1), the
 * unspecified address 0.0.0.0 / [::] (a connection to it reaches this
 * machine — Ollama's own Linux server value), localhost and *.localhost, an
 * address of one of this machine's own interfaces, or its own host name.
 *
 * Its own module with no imports beyond node's: the resource admission
 * (local-model-call) and the inference transport (loopback-fetch) both ask it,
 * and the transport must not load the resource manager to know an address.
 */
import * as net from 'node:net';
import * as os from 'node:os';

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
export function isThisMachineEndpoint(endpoint: unknown): boolean {
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
