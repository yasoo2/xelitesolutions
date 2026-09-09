import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { integrationProfile } from './integration-profiles';

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

function json(res: ServerResponse, status: number, body: Record<string, unknown>): true {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return true;
}

function selectedProfile(projectRoot: string) {
    const metadataPath = path.join(path.resolve(projectRoot), '.joe', 'external-api.json');
    if (!fs.existsSync(metadataPath) || fs.statSync(metadataPath).size > MAX_METADATA_BYTES) return undefined;
    try {
        const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
        const profile = integrationProfile(String(parsed.integrationProfileId || ''));
        return profile?.transport === 'server-proxy' ? profile : undefined;
    } catch {
        return undefined;
    }
}

/** Serve only Joe-maintained API profiles while the browser audit owns its temporary preview server. */
export async function handleMaintainedPreviewApiRequest(
    projectRoot: string,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const rawUrl = String(req.url || '/');
    if (!rawUrl.startsWith('/api/joe-external/')) return false;
    let incoming: URL;
    try {
        incoming = new URL(rawUrl, 'http://joe.local');
    } catch {
        return json(res, 400, { error: 'Malformed preview API request URL' });
    }
    if (!incoming.pathname.startsWith('/api/joe-external/')) return false;

    const profile = selectedProfile(projectRoot);
    if (!profile || incoming.pathname !== profile.proxyPath) {
        return json(res, 404, { error: 'No maintained API integration is configured for this preview route' });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

    const target = new URL(profile.requestBaseUrl);
    if (profile.capability === 'currency') {
        const amount = Number(incoming.searchParams.get('amount') || '1');
        const from = String(incoming.searchParams.get('from') || 'EUR').toUpperCase();
        const to = String(incoming.searchParams.get('to') || 'USD').toUpperCase();
        if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000
            || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
            return json(res, 400, { error: 'Valid amount, from, and to values are required' });
        }
        target.pathname = `${target.pathname.replace(/\/$/, '')}/v2/rate/${from}/${to}`;
    } else if (profile.capability === 'weather') {
        const envName = profile.requiredEnvNames[0];
        const apiKey = envName ? process.env[envName] : '';
        if (!envName || !apiKey) return json(res, 503, { error: `${envName || 'API key'} is required on the server` });
        target.pathname = `${target.pathname.replace(/\/$/, '')}/current.json`;
        target.searchParams.set('key', apiKey);
        target.searchParams.set('q', String(incoming.searchParams.get('q') || 'Istanbul').slice(0, 120));
    } else {
        return json(res, 501, { error: 'This maintained integration does not use a preview proxy' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(target, {
            signal: controller.signal,
            redirect: 'error',
            headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('External API response too large');
        const body = JSON.parse(text);
        if (profile.capability === 'currency') {
            const amount = Number(incoming.searchParams.get('amount') || '1');
            const to = String(incoming.searchParams.get('to') || 'USD').toUpperCase();
            const rate = Number(body?.rate);
            if (!response.ok || !Number.isFinite(rate)) {
                return json(res, response.ok ? 502 : response.status, { error: 'External API request failed' });
            }
            return json(res, 200, {
                amount,
                base: String(body.base || incoming.searchParams.get('from') || 'EUR'),
                date: String(body.date || ''),
                rates: { [to]: Number((amount * rate).toFixed(6)) },
            });
        }
        const temperature = Number(body?.current?.temp_c);
        if (!response.ok || !Number.isFinite(temperature)) {
            return json(res, response.ok ? 502 : response.status, { error: body?.error?.message || 'External API request failed' });
        }
        return json(res, 200, {
            temperature,
            windspeed: Number(body?.current?.wind_kph || 0),
            label: String(body?.location?.name || 'Current weather'),
        });
    } catch (error: any) {
        return json(res, 502, {
            error: error?.name === 'AbortError' ? 'External API timed out' : String(error?.message || 'External API failed'),
        });
    } finally {
        clearTimeout(timer);
    }
}
