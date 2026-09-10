import { compactApiSelectionArtifact, integrationProfile, type ApiIntegrationProfile, type IntegrationCapability } from './integration-profiles';
import type { ApiSelectionArtifact } from './types';

export interface ApiIntegrationPlan {
    capability: IntegrationCapability;
    selection: ApiSelectionArtifact;
    env: string[];
    clientSource: string;
    serverProxySource?: string;
    proxyPath?: string;
}

export function capabilityFromRequest(request: string): IntegrationCapability | null {
    const text = String(request || '');
    if (/\bweather\b|forecast|temperature|طقس|حرارة/iu.test(text)) return 'weather';
    if (/currency\s+(?:converter|conversion)|exchange\s+rate|forex|تحويل\s+عمل|سعر\s+الصرف/iu.test(text)) return 'currency';
    if (/\bip\s+(?:information|info|location|geolocation)|geolocation\s+by\s+ip|معلومات\s+.*ip|موقع\s+.*ip/iu.test(text)) return 'ip';
    return null;
}

export function integrationPlanFromSelection(value: unknown): ApiIntegrationPlan | null {
    const selection = compactApiSelectionArtifact(value);
    if (!selection || selection.health === 'UNAVAILABLE') return null;
    const profile = integrationProfile(selection.integrationProfileId);
    if (!profile) return null;
    return {
        capability: profile.capability,
        selection,
        env: [...profile.requiredEnvNames],
        clientSource: profile.transport === 'server-proxy'
            ? proxyClientSource(profile.capability, profile.proxyPath || '/api/joe-external')
            : browserClientSource(profile.capability, profile.requestBaseUrl),
        ...(profile.transport === 'server-proxy' ? {
            proxyPath: profile.proxyPath,
            serverProxySource: fixedServerProxySource(profile),
        } : {}),
    };
}

export function integrationArtifacts(plan: ApiIntegrationPlan): Record<string, string> {
    return {
        'src/integrations/externalApi.js': plan.clientSource,
        'src/integrations/externalApi.css': `.external-api-app{width:min(100% - 32px,720px);margin:0 auto;padding:clamp(40px,8vw,88px) 0}.external-api-app form{display:grid;gap:16px;margin:32px 0}.external-api-app label{display:grid;gap:8px;font-weight:650}.external-api-app input,.external-api-app select{width:100%;min-height:46px;padding:10px 12px;border:1px solid var(--line,#d7dce2);border-radius:6px;background:var(--surface,#fff);color:inherit;font:inherit}.external-api-app button{min-height:46px;padding:10px 16px;border:0;border-radius:6px;cursor:pointer;font:inherit;font-weight:700}.external-api-app button:disabled{cursor:wait;opacity:.65}.external-api-app .primary{background:var(--accent,#147d64);color:#fff}.external-api-app [role="alert"]{color:#b42318}.external-api-app [data-api-result]{margin-top:32px;padding-top:24px;border-top:1px solid var(--line,#d7dce2)}@media(min-width:640px){.external-api-app form{grid-template-columns:1.2fr 1fr 1fr auto;align-items:end}.external-api-app form>button{min-width:112px}}\n`,
        'src/styles/base.css': `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;min-width:320px;background:var(--bg,#f7f8fa);color:var(--text,#16202a);font-family:var(--font-body,system-ui,sans-serif);line-height:1.5}button,input,select{letter-spacing:0}h1,h2,p{margin-top:0}.muted{color:var(--text-muted,#5f6b76)}.eyebrow{color:var(--accent,#147d64);font-size:.78rem;font-weight:800;text-transform:uppercase}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid color-mix(in srgb,var(--accent,#147d64) 36%,transparent);outline-offset:2px}\n`,
        '.joe/external-api.json': JSON.stringify({
            capability: plan.capability,
            selected: plan.selection.providerName,
            apiId: plan.selection.apiId,
            integrationProfileId: plan.selection.integrationProfileId,
            source: plan.selection.source,
            auth: plan.selection.auth,
            pricing: plan.selection.pricing,
            health: plan.selection.health,
            reasons: plan.selection.reasons,
            warnings: plan.selection.warnings,
            requiredEnvironmentVariables: plan.env,
            selectedAt: new Date().toISOString(),
        }, null, 2) + '\n',
        ...(plan.env.length ? { '.env.example': plan.env.map(name => `${name}=`).join('\n') + '\n' } : {}),
        ...(plan.serverProxySource ? { 'server/joeExternalApiProxy.js': plan.serverProxySource } : {}),
    };
}

export function viteConfigWithExternalProxy(source: string, plan: ApiIntegrationPlan): string {
    if (!plan.serverProxySource) return source;
    return String(source)
        .replace("import react from '@vitejs/plugin-react';", "import react from '@vitejs/plugin-react';\nimport { joeExternalApiProxy } from './server/joeExternalApiProxy.js';")
        .replace('plugins: [react()]', 'plugins: [react(), joeExternalApiProxy()]');
}

function browserClientSource(capability: IntegrationCapability, baseUrl: string): string {
    const request = capability === 'currency'
        ? `const url = new URL(BASE_URL + '/latest'); ['amount','from','to'].forEach(key => params[key] !== undefined && url.searchParams.set(key, String(params[key])));`
        : capability === 'ip'
            ? `const address = String(params.ip || '').trim(); const url = new URL(BASE_URL + '/' + (address ? encodeURIComponent(address) + '/' : '') + 'json/');`
            : `const url = new URL(BASE_URL + '/forecast'); ['latitude','longitude'].forEach(key => url.searchParams.set(key, String(params[key]))); url.searchParams.set('current_weather', 'true');`;
    const normalize = capability === 'currency'
        ? `if (!body || typeof body !== 'object' || !body.rates) throw new Error('Unexpected currency response'); return body;`
        : capability === 'ip'
            ? `if (!body || typeof body !== 'object' || body.error) throw new Error(body?.reason || 'Unexpected IP response'); return body;`
            : `if (!body?.current_weather || typeof body.current_weather.temperature !== 'number') throw new Error('Unexpected weather response'); return { temperature: body.current_weather.temperature, windspeed: body.current_weather.windspeed, label: 'Current weather' };`;
    return `const BASE_URL = ${JSON.stringify(baseUrl)};

export const externalApi = {
  async load(params = {}, timeoutMs = 8000) {
    ${request}
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('External API returned ' + response.status);
      const body = await response.json();
      ${normalize}
    } finally { clearTimeout(timer); }
  }
};
`;
}

function proxyClientSource(capability: IntegrationCapability, proxyPath: string): string {
    const query = capability === 'weather'
        ? "if (params.q) url.searchParams.set('q', String(params.q));"
        : capability === 'currency'
            ? "['amount','from','to'].forEach(key => params[key] !== undefined && url.searchParams.set(key, String(params[key])));"
            : "if (params.ip) url.searchParams.set('ip', String(params.ip));";
    const normalize = capability === 'currency'
        ? "if (!body || typeof body !== 'object' || !body.rates) throw new Error('Unexpected currency response'); return body;"
        : capability === 'ip'
            ? "if (!body || typeof body !== 'object' || body.error) throw new Error(body?.reason || 'Unexpected IP response'); return body;"
            : "if (typeof body.temperature !== 'number') throw new Error('Unexpected weather response'); return body;";
    return `const PROXY_PATH = ${JSON.stringify(proxyPath.replace(/^\/+/, ''))};

function externalApiUrl() {
  const previewRoot = window.location.pathname.match(/^\\/project-preview\\/[^/]+\\//)?.[0] || '/';
  return new URL(PROXY_PATH, new URL(previewRoot, window.location.origin));
}

export const externalApi = {
  async load(params = {}, timeoutMs = 8000) {
    const url = externalApiUrl();
    ${query}
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'External API request failed');
      ${normalize}
    } finally { clearTimeout(timer); }
  }
};
`;
}

export function resolveProxyClientUrl(proxyPath: string, locationHref: string): URL {
    const location = new URL(locationHref);
    const previewRoot = location.pathname.match(/^\/project-preview\/[^/]+\//)?.[0] || '/';
    return new URL(String(proxyPath || '').replace(/^\/+/, ''), new URL(previewRoot, location.origin));
}

function fixedServerProxySource(profile: ApiIntegrationProfile): string {
    if (profile.capability === 'currency') return fixedCurrencyProxySource(profile);
    const envName = profile.requiredEnvNames[0];
    const proxyPath = profile.proxyPath || '/api/joe-external';
    return `const PROXY_PATH = ${JSON.stringify(proxyPath)};
const UPSTREAM = ${JSON.stringify(profile.requestBaseUrl + '/current.json')};
const MAX_RESPONSE_BYTES = 512 * 1024;

async function handler(req, res, next) {
  if (new URL(req.url || '/', 'http://joe.local').pathname !== PROXY_PATH) return next();
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  const apiKey = process.env.${envName};
  if (!apiKey) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: '${envName} is required on the server' })); }
  const incoming = new URL(req.url, 'http://joe.local');
  const target = new URL(UPSTREAM);
  target.searchParams.set('key', apiKey);
  target.searchParams.set('q', String(incoming.searchParams.get('q') || 'Istanbul').slice(0, 120));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('External API response too large');
    const body = JSON.parse(text);
    if (!response.ok) { res.statusCode = response.status; return res.end(JSON.stringify({ error: body?.error?.message || 'External API request failed' })); }
    const temperature = Number(body?.current?.temp_c);
    if (!Number.isFinite(temperature)) throw new Error('Unexpected weather response');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ temperature, windspeed: Number(body?.current?.wind_kph || 0), label: body?.location?.name || 'Current weather' }));
  } catch (error) { res.statusCode = 502; return res.end(JSON.stringify({ error: error?.name === 'AbortError' ? 'External API timed out' : String(error?.message || 'External API failed') })); }
  finally { clearTimeout(timer); }
}

export function joeExternalApiProxy() {
  return { name: 'joe-fixed-external-api-proxy', configureServer(server) { server.middlewares.use(handler); }, configurePreviewServer(server) { server.middlewares.use(handler); } };
}
`;
}

function fixedCurrencyProxySource(profile: ApiIntegrationProfile): string {
    const proxyPath = profile.proxyPath || '/api/joe-external/currency';
    return `const PROXY_PATH = ${JSON.stringify(proxyPath)};
const UPSTREAM = ${JSON.stringify(profile.requestBaseUrl)};
const MAX_RESPONSE_BYTES = 512 * 1024;

async function handler(req, res, next) {
  if (new URL(req.url || '/', 'http://joe.local').pathname !== PROXY_PATH) return next();
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  const incoming = new URL(req.url, 'http://joe.local');
  const amount = Number(incoming.searchParams.get('amount') || '1');
  const from = String(incoming.searchParams.get('from') || 'EUR').toUpperCase();
  const to = String(incoming.searchParams.get('to') || 'USD').toUpperCase();
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000 || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    res.statusCode = 400; return res.end(JSON.stringify({ error: 'Valid amount, from, and to values are required' }));
  }
  const target = new URL('/v2/rate/' + from + '/' + to, UPSTREAM);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('External API response too large');
    const body = JSON.parse(text);
    const rate = Number(body?.rate);
    if (!response.ok || !Number.isFinite(rate)) { res.statusCode = response.ok ? 502 : response.status; return res.end(JSON.stringify({ error: 'External API request failed' })); }
    return res.end(JSON.stringify({ amount, base: String(body.base || from), date: String(body.date || ''), rates: { [to]: Number((amount * rate).toFixed(6)) } }));
  } catch (error) { res.statusCode = 502; return res.end(JSON.stringify({ error: error?.name === 'AbortError' ? 'External API timed out' : String(error?.message || 'External API failed') })); }
  finally { clearTimeout(timer); }
}

export function joeExternalApiProxy() {
  return { name: 'joe-fixed-external-api-proxy', configureServer(server) { server.middlewares.use(handler); }, configurePreviewServer(server) { server.middlewares.use(handler); } };
}
`;
}

export function externalDataAppSource(plan: ApiIntegrationPlan): string {
    if (plan.capability === 'currency') return currencyApp(plan.selection.providerName);
    if (plan.capability === 'ip') return ipApp(plan.selection.providerName);
    return weatherApp(plan.selection.providerName, plan.selection.auth === 'apiKey');
}

const shell = (capability: IntegrationCapability, title: string, provider: string, body: string, showRetry = true) => `import React, { useEffect, useState } from 'react';
import { externalApi } from './integrations/externalApi.js';
import './styles/tokens.css'; import './integrations/externalApi.css';
export default function App(){ const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [data,setData]=useState(null);
${body}
return <main className="external-api-app" data-external-api-capability="${capability}"><p className="eyebrow">Live public data</p><h1>${title}</h1><p className="muted">External API: ${provider}</p>{renderForm()}{loading&&<p role="status" data-api-loading="true">Loading…</p>}{error&&<p role="alert" data-api-error="true">{error}${showRetry ? ' <button type="button" onClick={run} data-api-retry="true">Retry</button>' : ''}</p>}{data&&renderResult()}</main> }
`;

const weatherApp = (provider: string, keyed: boolean) => shell('weather', 'Weather dashboard', provider, `const [city,setCity]=useState('Istanbul'); const [lastUpdated,setLastUpdated]=useState(''); const [refreshCount,setRefreshCount]=useState(0);
async function run(e){e?.preventDefault();setRefreshCount(count=>count+1);setLoading(true);setError('');setData(null);try{setData(await externalApi.load(${keyed ? '{q:city}' : '{latitude:41.01,longitude:28.97}'}));setLastUpdated(new Date().toISOString())}catch(err){setError(err.message||'Could not load weather')}finally{setLoading(false)}}
useEffect(()=>{run()},[]);
function renderForm(){return <form onSubmit={run} className="grid-form" data-api-form="true">${keyed ? '<label>City<input value={city} onChange={e=>setCity(e.target.value)} required/></label>' : ''}<button className="primary" disabled={loading} data-api-submit="true">Load weather</button></form>}
function renderResult(){return <section aria-live="polite" data-api-result="true"><p>Live data · Last updated: {lastUpdated}</p><p>Updates checked: {refreshCount}</p><h2>{data.temperature}°C</h2><p>{data.label} · Wind {data.windspeed}</p></section>}`);

const currencyApp = (provider: string) => shell('currency', 'Currency converter', provider, `const CURRENCIES=['EUR','USD','TRY','GBP','JPY','CAD','AUD','CHF']; const [amount,setAmount]=useState('100'); const [amountError,setAmountError]=useState(''); const [from,setFrom]=useState('EUR'); const [to,setTo]=useState('USD'); const [lastUpdated,setLastUpdated]=useState(''); const [conversionCount,setConversionCount]=useState(0);
const asciiDecimal=value=>{const normalized=String(value).replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-1632)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-1776)).replace(/[^0-9.]/g,'');const parts=normalized.split('.');return parts[0]+(parts.length>1?'.'+parts.slice(1).join(''):'')};
function updateAmount(value){setData(null);const translated=String(value).replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-1632)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-1776));if(!/^[0-9]*([.][0-9]*)?$/.test(translated)){setAmountError('Use digits and one decimal point only');return}setAmountError('');setAmount(asciiDecimal(translated))}
async function run(e){e?.preventDefault();if(!amount||amountError){setAmountError('Enter a valid amount');return}setLoading(true);setError('');setData(null);try{setData(await externalApi.load({amount,from,to}));setLastUpdated(new Date().toISOString());setConversionCount(count=>count+1)}catch(err){setError(err.message||'Could not load rates')}finally{setLoading(false)}}
useEffect(()=>{run()},[]);
function renderForm(){return <form onSubmit={run} className="grid-form" data-api-form="true"><label>Amount<input type="text" lang="en-US" dir="ltr" inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" title="Enter an amount using digits and an optional decimal point" aria-invalid={amountError?'true':'false'} aria-describedby="amount-error" value={amount} onInput={e=>updateAmount(e.currentTarget.value)} onChange={e=>updateAmount(e.target.value)} data-api-amount="true" required/>{amountError&&<span id="amount-error" role="alert">{amountError}</span>}</label><label>From<select value={from} onChange={e=>{setFrom(e.target.value);setData(null);setError('')}} data-api-from="true">{CURRENCIES.map(code=><option key={code}>{code}</option>)}</select></label><label>To<select value={to} onChange={e=>{setTo(e.target.value);setData(null);setError('')}} data-api-to="true">{CURRENCIES.map(code=><option key={code}>{code}</option>)}</select></label><button className="primary" disabled={loading} data-api-submit="true">Convert</button></form>}
function renderResult(){const value=data.rates?.[to];return <section aria-live="polite" data-api-result="true"><h2>{amount} {from} = {value} {to}</h2><p>Date: {data.date}</p><p>Last updated: {lastUpdated}</p><p>Conversions checked: {conversionCount}</p></section>}`);

const ipApp = (provider: string) => shell('ip', 'IP information', provider, `const [ip,setIp]=useState(''); const [ipError,setIpError]=useState('');
const validIp=value=>{if(!value)return true;const parts=String(value).split('.');return parts.length===4&&parts.every(part=>/^[0-9]{1,3}$/.test(part)&&Number(part)<=255)};
async function run(e){e?.preventDefault();if(!validIp(ip)){setIpError('Enter a valid IPv4 address, for example 8.8.8.8');return}setIpError('');setLoading(true);setError('');try{setData(await externalApi.load({ip}))}catch(err){setError(err.message||'Could not load IP information')}finally{setLoading(false)}}
function renderForm(){return <form onSubmit={run} noValidate className="grid-form" data-optional-submit="true"><label>IP address (optional)<input value={ip} onChange={e=>{setIp(e.target.value);setIpError('')}} inputMode="decimal" pattern="(?:[0-9]{1,3}[.]){3}[0-9]{1,3}" title="Enter an IPv4 address such as 8.8.8.8, or leave it empty to detect yours" aria-invalid={ipError?'true':'false'} aria-describedby="ip-error" placeholder="8.8.8.8"/>{ipError&&<span id="ip-error" role="alert">{ipError}</span>}</label><button className="primary" disabled={loading}>Look up</button></form>}
function renderResult(){return <section aria-live="polite" data-api-result="true"><h2>{data.ip}</h2><dl><dt>City</dt><dd>{data.city||'Unknown'}</dd><dt>Region</dt><dd>{data.region||'Unknown'}</dd><dt>Country</dt><dd>{data.country_name||'Unknown'}</dd><dt>Network</dt><dd>{data.org||'Unknown'}</dd></dl></section>}`, false);
