import dns from 'dns/promises';
import net from 'net';
import http from 'http';
import https from 'https';
import axios, { AxiosRequestConfig } from 'axios';
import type { ApiHealth } from './types';

const INTERNAL_HOST = /^(?:localhost|localhost\.|host\.docker\.internal|metadata\.google\.internal|instance-data)(?:$|\.)/i;

export function isPrivateAddress(address: string): boolean {
    const value = String(address || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (net.isIPv4(value)) {
        const [a, b] = value.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
            || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    if (net.isIPv6(value)) {
        return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
            || /^fe[89ab]/i.test(value) || value.startsWith('ff')
            || value.startsWith('::ffff:');
    }
    return true;
}

async function lookupWithTimeout(hostname: string, timeoutMs = 3_000) {
    return new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('dns_timeout')), timeoutMs);
        dns.lookup(hostname, { all: true, verbatim: true }).then(
            answers => { clearTimeout(timer); resolve(answers); },
            error => { clearTimeout(timer); reject(error); },
        );
    });
}

export async function assertSafePublicUrl(raw: string): Promise<URL> {
    let url: URL;
    try { url = new URL(String(raw || '')); }
    catch { throw new Error('unsafe_url: malformed URL'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe_url: only http/https are allowed');
    if (url.username || url.password) throw new Error('unsafe_url: embedded credentials are forbidden');
    if (INTERNAL_HOST.test(url.hostname)) throw new Error('unsafe_url: internal host is blocked');
    if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new Error('unsafe_url: private address is blocked');
    const answers = await lookupWithTimeout(url.hostname);
    if (!answers.length || answers.some(answer => isPrivateAddress(answer.address))) {
        throw new Error('unsafe_url: DNS resolved to a private or unavailable address');
    }
    return url;
}

export interface ValidationResult {
    health: ApiHealth;
    checkedAt: string;
    status?: number;
    durationMs: number;
    finalUrl?: string;
    errorCategory?: string;
}

export class SafeApiValidator {
    constructor(private readonly request: (config: AxiosRequestConfig) => Promise<any> = axios.request) { }

    async validate(rawUrl: string, options?: { timeoutMs?: number; maxRedirects?: number }): Promise<ValidationResult> {
        const started = Date.now();
        const checkedAt = new Date().toISOString();
        const timeout = Math.max(250, Math.min(10_000, Number(options?.timeoutMs) || 4_000));
        const redirectLimit = Math.max(0, Math.min(3, Number(options?.maxRedirects) || 2));
        let current = rawUrl;
        try {
            for (let redirect = 0; redirect <= redirectLimit; redirect++) {
                const safe = await assertSafePublicUrl(current);
                const guardedLookup = (hostname: string, _options: any, callback: (error: Error | null, address?: string, family?: number) => void) => {
                    dns.lookup(hostname, { all: true, verbatim: true }).then(answers => {
                        if (!answers.length || answers.some(answer => isPrivateAddress(answer.address))) return callback(new Error('unsafe_url: DNS rebinding blocked'));
                        callback(null, answers[0].address, answers[0].family);
                    }).catch(error => callback(error));
                };
                const agent = safe.protocol === 'https:' ? new https.Agent({ lookup: guardedLookup as any }) : new http.Agent({ lookup: guardedLookup as any });
                const config: AxiosRequestConfig & { httpAgent?: http.Agent; httpsAgent?: https.Agent } = {
                    url: safe.toString(), method: 'HEAD', timeout, maxRedirects: 0,
                    maxContentLength: 256 * 1024, maxBodyLength: 256 * 1024,
                    validateStatus: () => true,
                    headers: { 'User-Agent': 'Joe-API-Discovery/1.0', Accept: 'application/json,text/plain,*/*' },
                    ...(safe.protocol === 'https:' ? { httpsAgent: agent as https.Agent } : { httpAgent: agent as http.Agent }),
                };
                const response = await this.request(config);
                const status = Number(response.status || 0);
                if (status >= 300 && status < 400 && response.headers?.location) {
                    if (redirect === redirectLimit) throw new Error('redirect_limit');
                    current = new URL(String(response.headers.location), safe).toString();
                    continue;
                }
                return {
                    health: status >= 200 && status < 400 ? 'HEALTHY' : status >= 400 && status < 500 ? 'DEGRADED' : 'UNAVAILABLE',
                    checkedAt, status, durationMs: Date.now() - started, finalUrl: safe.toString(),
                };
            }
            throw new Error('redirect_limit');
        } catch (error: any) {
            const code = String(error?.code || error?.message || 'unknown');
            const category = /timeout|ECONNABORTED/i.test(code) ? 'TIMEOUT'
                : /unsafe_url/i.test(code) ? 'NETWORK_POLICY'
                    : /ENOTFOUND|EAI_AGAIN/i.test(code) ? 'DNS' : 'NETWORK';
            const health: ApiHealth = category === 'TIMEOUT' ? 'DEGRADED'
                : category === 'NETWORK_POLICY' ? 'UNAVAILABLE'
                    : 'UNKNOWN';
            return { health, checkedAt, durationMs: Date.now() - started, errorCategory: category };
        }
    }
}
