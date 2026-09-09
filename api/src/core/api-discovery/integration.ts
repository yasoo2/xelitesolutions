import { apiDiscoveryService } from './service';
import type { RankedApiCandidate } from './types';

export type IntegrationCapability = 'weather' | 'currency' | 'ip';

export interface ApiIntegrationPlan {
    capability: IntegrationCapability;
    candidate: RankedApiCandidate;
    env: string[];
    clientSource: string;
}

export function credentialScaffold(envName: string, proxyPath: string) {
    const name = String(envName || '').trim().replace(/[^A-Z0-9_]/g, '');
    if (!name) throw new Error('invalid_environment_variable');
    const route = String(proxyPath || '/api/external').replace(/[^a-zA-Z0-9_\-/]/g, '');
    return {
        envExample: `${name}=\n`,
        serverSource: `const apiKey = process.env.${name};\nif (!apiKey) throw new Error('${name} is required');\n`,
        frontendSource: `export const externalEndpoint = ${JSON.stringify(route)};\n`,
    };
}

export function capabilityFromRequest(request: string): IntegrationCapability | null {
    const text = String(request || '');
    if (/\bweather\b|forecast|temperature|طقس|حرارة/iu.test(text)) return 'weather';
    if (/currency\s+(?:converter|conversion)|exchange\s+rate|forex|تحويل\s+عمل|سعر\s+الصرف/iu.test(text)) return 'currency';
    if (/\bip\s+(?:information|info|location|geolocation)|geolocation\s+by\s+ip|معلومات\s+.*ip|موقع\s+.*ip/iu.test(text)) return 'ip';
    return null;
}

const PROFILE_IDS: Record<IntegrationCapability, string> = {
    weather: 'public-apis:open-meteo', currency: 'public-apis:frankfurter', ip: 'public-apis:ipapi-co',
};

export async function discoverIntegrationForRequest(request: string, options?: { validate?: boolean }): Promise<ApiIntegrationPlan | null> {
    const capability = capabilityFromRequest(request);
    if (!capability) return null;
    const service = apiDiscoveryService();
    let candidates = await service.search({ query: capability, requiresNoAuth: true, requiresHttps: true, requiresCors: true, browserSide: true, limit: 8 });
    const preferred = candidates.find(item => item.id === PROFILE_IDS[capability]);
    if (preferred && options?.validate !== false) {
        await service.validate(preferred.id).catch(() => undefined);
        candidates = await service.search({ query: capability, requiresNoAuth: true, requiresHttps: true, requiresCors: true, browserSide: true, limit: 8 });
    }
    const candidate = candidates.find(item => item.id === PROFILE_IDS[capability] && item.health !== 'UNAVAILABLE');
    if (!candidate?.baseUrl) return null;
    return { capability, candidate, env: [], clientSource: adapterSource(capability, candidate.baseUrl) };
}

function adapterSource(capability: IntegrationCapability, baseUrl: string): string {
    const normalizer = capability === 'currency'
        ? `if (!body || typeof body !== 'object' || !body.rates) throw new Error('Unexpected currency response'); return body;`
        : capability === 'ip'
            ? `if (!body || typeof body !== 'object' || body.error) throw new Error(body?.reason || 'Unexpected IP response'); return body;`
            : `if (!body || typeof body !== 'object' || !body.current_weather) throw new Error('Unexpected weather response'); return body;`;
    return `const BASE_URL = ${JSON.stringify(baseUrl)};

export const externalApi = {
  name: ${JSON.stringify(capability)},
  async request(path, params = {}, timeoutMs = 8000) {
    const url = new URL(BASE_URL.replace(/\\/$/, '') + '/' + String(path || '').replace(/^\\//, ''));
    Object.entries(params).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('External API returned ' + response.status);
      const body = await response.json();
      ${normalizer}
    } finally { clearTimeout(timer); }
  },
  async healthCheck() { try { return !!(await this.request(${JSON.stringify(capability === 'currency' ? 'latest' : capability === 'ip' ? 'json/' : 'forecast')}, ${capability === 'currency' ? `{ from: 'EUR', to: 'USD' }` : capability === 'ip' ? '{}' : `{ latitude: 41.01, longitude: 28.97, current_weather: true }`})); } catch { return false; } }
};
`;
}

export function externalDataAppSource(plan: ApiIntegrationPlan): string {
    if (plan.capability === 'currency') return currencyApp();
    if (plan.capability === 'ip') return ipApp();
    return '';
}

const shell = (title: string, body: string) => `import React, { useState } from 'react';
import { externalApi } from './integrations/externalApi.js';
import './styles/tokens.css'; import './styles/base.css'; import './styles/app.css';
export default function App(){ const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [data,setData]=useState(null);
${body}
return <main className="wrap" style={{paddingBlock:'64px'}}><p className="eyebrow">Live public data</p><h1>${title}</h1><p className="muted">External API: ${title === 'Currency converter' ? 'Frankfurter' : 'ipapi.co'} · Auth: none</p>{renderForm()}{loading&&<p role="status">Loading…</p>}{error&&<p role="alert">{error} <button onClick={run}>Retry</button></p>}{data&&renderResult()}</main> }
`;

const currencyApp = () => shell('Currency converter', `const [amount,setAmount]=useState('100'); const [from,setFrom]=useState('EUR'); const [to,setTo]=useState('USD');
async function run(e){e?.preventDefault();setLoading(true);setError('');try{setData(await externalApi.request('latest',{amount,from,to}))}catch(err){setError(err.message||'Could not load rates')}finally{setLoading(false)}}
function renderForm(){return <form onSubmit={run} className="grid-form"><label>Amount<input type="number" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>From<input value={from} pattern="[A-Za-z]{3}" maxLength="3" onChange={e=>setFrom(e.target.value.toUpperCase())} required/></label><label>To<input value={to} pattern="[A-Za-z]{3}" maxLength="3" onChange={e=>setTo(e.target.value.toUpperCase())} required/></label><button className="primary">Convert</button></form>}
function renderResult(){const value=data.rates?.[to];return <section aria-live="polite"><h2>{amount} {from} = {value} {to}</h2><p>Date: {data.date}</p></section>}`);

const ipApp = () => shell('IP information', `const [ip,setIp]=useState('');
async function run(e){e?.preventDefault();setLoading(true);setError('');try{setData(await externalApi.request((ip.trim()?ip.trim()+'/':'')+'json/'))}catch(err){setError(err.message||'Could not load IP information')}finally{setLoading(false)}}
function renderForm(){return <form onSubmit={run} className="grid-form"><label>IP address (optional)<input value={ip} onChange={e=>setIp(e.target.value)} placeholder="8.8.8.8"/></label><button className="primary">Look up</button></form>}
function renderResult(){return <section aria-live="polite"><h2>{data.ip}</h2><dl><dt>City</dt><dd>{data.city||'Unknown'}</dd><dt>Region</dt><dd>{data.region||'Unknown'}</dd><dt>Country</dt><dd>{data.country_name||'Unknown'}</dd><dt>Network</dt><dd>{data.org||'Unknown'}</dd></dl></section>}`);
