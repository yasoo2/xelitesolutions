import fs from 'fs';
import os from 'os';
import path from 'path';
import { capabilityFromRequest, externalDataAppSource, integrationArtifacts, integrationPlanFromSelection, viteConfigWithExternalProxy } from '../core/api-discovery/integration';
import type { ApiSelectionArtifact } from '../core/api-discovery/types';
import { isExternalIntegrationArtifact } from '../modules/tools/definitions/ReactProjectTool';
import { guardUnverifiedBuilderClaims } from '../core/api-discovery/reporting';
import { handleMaintainedPreviewApiRequest } from '../core/api-discovery/preview-proxy';

const selection = (overrides: Partial<ApiSelectionArtifact> = {}): ApiSelectionArtifact => ({
    version: 1, apiId: 'remote-frankfurter', integrationProfileId: 'frankfurter-currency-v2',
    providerName: 'Frankfurter', source: 'public-apis/public-apis', auth: 'none', cors: 'yes',
    pricing: 'UNKNOWN', health: 'HEALTHY', reasons: ['Exact capability match'], warnings: [], requiredEnvNames: [],
    ...overrides,
});

describe('external API generation contract', () => {
    it('detects only supported external-data capabilities', () => {
        expect(capabilityFromRequest('Build a simple weather dashboard using a free public API.')).toBe('weather');
        expect(capabilityFromRequest('Create a currency converter using a public API')).toBe('currency');
        expect(capabilityFromRequest('Build an IP information page')).toBe('ip');
        expect(capabilityFromRequest('Build a todo list')).toBeNull();
    });

    it('uses candidate B from the handoff in both manifest and adapter', () => {
        const plan = integrationPlanFromSelection(selection())!;
        const files = integrationArtifacts(plan);
        expect(JSON.parse(files['.joe/external-api.json'])).toMatchObject({ selected: 'Frankfurter', apiId: 'remote-frankfurter', integrationProfileId: 'frankfurter-currency-v2' });
        expect(files['src/integrations/externalApi.js']).toContain('const PROXY_PATH = "api/joe-external/currency"');
        expect(files['src/integrations/externalApi.js']).toContain("window.location.pathname.match(/^\\/project-preview\\/[^/]+\\//)");
        expect(files['src/integrations/externalApi.js']).toContain('new URL(previewRoot, window.location.origin)');
        expect(files['src/integrations/externalApi.js']).not.toContain('api.frankfurter.app');
        expect(files['server/joeExternalApiProxy.js']).toContain('https://api.frankfurter.dev');
        expect(files['server/joeExternalApiProxy.js']).toContain("'/v2/rate/' + from + '/' + to");
        expect(files['server/joeExternalApiProxy.js']).toContain("req.method !== 'GET'");
        expect(files['server/joeExternalApiProxy.js']).toContain('MAX_RESPONSE_BYTES');
        expect(files['src/integrations/externalApi.css']).toContain('.external-api-app');
        const app = externalDataAppSource(plan);
        expect(app).toContain('Loading');
        expect(app).toContain('role="alert"');
        expect(app).toContain('Retry');
        expect(app).toContain('<select value={from}');
        expect(app).toContain('type="text" lang="en-US" dir="ltr" inputMode="decimal"');
        expect(app).toContain('pattern="[0-9]+([.][0-9]+)?"');
        expect(app).toContain('inputMode="decimal"');
        expect(app).toContain('const asciiDecimal=value=>');
        expect(app).toContain('charCodeAt(0)-1632');
        expect(app).toContain('charCodeAt(0)-1776');
        expect(app).toContain("const parts=normalized.split('.')");
        expect(app).not.toContain("replace(/(..*)./g,'$1')");
        expect(app).toContain("setAmountError('Use digits and one decimal point only')");
        expect(app).toContain("aria-invalid={amountError?'true':'false'}");
        expect(app).toContain('onInput={e=>updateAmount(e.currentTarget.value)}');
        expect(app).toContain('onChange={e=>updateAmount(e.target.value)}');
        expect(app).not.toContain('type="number"');
        expect(app).toContain('useEffect(()=>{run()},[])');
        expect(app).toContain('setConversionCount(count=>count+1)');
        expect(app).toContain('Last updated: {lastUpdated}');
        expect(app).toContain("import './integrations/externalApi.css'");
        expect(app).not.toContain("import './styles/app.css'");
        expect(app).not.toContain("import './styles/base.css'");
    });

    it('auto-loads weather and renders observable live-data freshness for browser QA', () => {
        const plan = integrationPlanFromSelection(selection({
            apiId: 'remote-open-meteo', integrationProfileId: 'open-meteo-weather-v1',
            providerName: 'Open-Meteo',
        }))!;
        const app = externalDataAppSource(plan);
        expect(app).toContain('useEffect(()=>{run()},[])');
        expect(app).toContain('Live data · Last updated: {lastUpdated}');
        expect(app).toContain('setRefreshCount(count=>count+1)');
        expect(app).toContain('Updates checked: {refreshCount}');
    });

    it('keeps semantic form and keyboard submission for an explicitly optional IP lookup', () => {
        const plan = integrationPlanFromSelection(selection({
            apiId: 'remote-ipapi', integrationProfileId: 'ipapi-co-v1', providerName: 'ipapi.co',
        }))!;
        const app = externalDataAppSource(plan);
        expect(app).toContain('<form onSubmit={run} noValidate className="grid-form" data-optional-submit="true">');
        expect(app).toContain('pattern="(?:[0-9]{1,3}[.]){3}[0-9]{1,3}"');
        expect(app).toContain("Number(part)<=255");
        expect(app).toContain("Enter a valid IPv4 address, for example 8.8.8.8");
        expect(app).toContain('<button className="primary" disabled={loading}>Look up</button>');
        expect(app).not.toContain('<button onClick={run}>Retry</button>');
    });

    it('generates a real keyed path with a fixed server proxy and a clear missing-env response', async () => {
        const plan = integrationPlanFromSelection(selection({
            apiId: 'remote-weatherapi', integrationProfileId: 'weatherapi-key-v1', providerName: 'forged name',
            auth: 'none', cors: 'yes', pricing: 'FREE', requiredEnvNames: ['EVIL_SECRET'],
        }))!;
        const files = integrationArtifacts(plan);
        expect(plan.selection).toMatchObject({ providerName: 'WeatherAPI', auth: 'apiKey', requiredEnvNames: ['WEATHERAPI_KEY'] });
        expect(files['.env.example']).toBe('WEATHERAPI_KEY=\n');
        expect(files['src/integrations/externalApi.js']).toContain('"api/joe-external/weather"');
        expect(files['src/integrations/externalApi.js']).not.toMatch(/WEATHERAPI_KEY|api\.weatherapi\.com|process\.env/);
        expect(files['server/joeExternalApiProxy.js']).toContain('process.env.WEATHERAPI_KEY');
        expect(files['server/joeExternalApiProxy.js']).toContain('WEATHERAPI_KEY is required on the server');
        expect(files['server/joeExternalApiProxy.js']).toContain("req.method !== 'GET'");
        expect(files['server/joeExternalApiProxy.js']).toContain("redirect: 'error'");
        expect(viteConfigWithExternalProxy("import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };", plan)).toContain('joeExternalApiProxy()');

        const loadPlugin = new Function('process', 'fetch', 'Buffer', `${files['server/joeExternalApiProxy.js'].replace('export function joeExternalApiProxy', 'function joeExternalApiProxy')}\nreturn joeExternalApiProxy;`);
        const plugin = loadPlugin({ env: {} }, jest.fn(), Buffer)();
        let handler: any;
        plugin.configureServer({ middlewares: { use: (value: any) => { handler = value; } } });
        const response = { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
        await handler({ method: 'GET', url: '/api/joe-external/weather?q=Istanbul' }, response, jest.fn());
        expect(response.statusCode).toBe(503);
        expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'WEATHERAPI_KEY is required on the server' }));
    });

    it('executes the fixed currency proxy with validated input and a normalized response', async () => {
        const files = integrationArtifacts(integrationPlanFromSelection(selection())!);
        const upstreamFetch = jest.fn().mockResolvedValue({
            ok: true, status: 200,
            text: async () => JSON.stringify({ date: '2026-09-08', base: 'EUR', quote: 'TRY', rate: 56.28 }),
        });
        const loadPlugin = new Function('process', 'fetch', 'Buffer', `${files['server/joeExternalApiProxy.js'].replace('export function joeExternalApiProxy', 'function joeExternalApiProxy')}\nreturn joeExternalApiProxy;`);
        const plugin = loadPlugin({ env: {} }, upstreamFetch, Buffer)();
        let handler: any;
        plugin.configureServer({ middlewares: { use: (value: any) => { handler = value; } } });

        const invalid = { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
        await handler({ method: 'GET', url: '/api/joe-external/currency?amount=abc&from=EUR&to=TRY' }, invalid, jest.fn());
        expect(invalid.statusCode).toBe(400);
        expect(upstreamFetch).not.toHaveBeenCalled();

        const response = { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
        await handler({ method: 'GET', url: '/api/joe-external/currency?amount=125&from=EUR&to=TRY' }, response, jest.fn());
        expect(upstreamFetch).toHaveBeenCalledTimes(1);
        expect(String(upstreamFetch.mock.calls[0][0])).toBe('https://api.frankfurter.dev/v2/rate/EUR/TRY');
        expect(response.end).toHaveBeenCalledWith(JSON.stringify({ amount: 125, base: 'EUR', date: '2026-09-08', rates: { TRY: 7035 } }));
    });

    it('serves the same maintained currency proxy from the browser audit preview server', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-preview-api-'));
        fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(root, '.joe', 'external-api.json'), JSON.stringify({
            integrationProfileId: 'frankfurter-currency-v2',
            requestBaseUrl: 'http://127.0.0.1:9999/never-trust-this',
        }));
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ date: '2026-09-08', base: 'EUR', quote: 'TRY', rate: 56.28 }),
        } as any);
        let status = 0;
        let body = '';
        const res = {
            set statusCode(value: number) { status = value; },
            get statusCode() { return status; },
            setHeader: jest.fn(),
            end: (value: string) => { body = value; },
        } as any;
        try {
            await expect(handleMaintainedPreviewApiRequest(root, {
                method: 'GET', url: '/api/joe-external/currency?amount=125&from=EUR&to=TRY',
            } as any, res)).resolves.toBe(true);
            expect(status).toBe(200);
            expect(JSON.parse(body)).toEqual({ amount: 125, base: 'EUR', date: '2026-09-08', rates: { TRY: 7035 } });
            expect(fetchSpy).toHaveBeenCalledWith(
                new URL('https://api.frankfurter.dev/v2/rate/EUR/TRY'),
                expect.objectContaining({ redirect: 'error' }),
            );
        } finally {
            fetchSpy.mockRestore();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('ignores malformed non-integration URLs without throwing', async () => {
        await expect(handleMaintainedPreviewApiRequest(os.tmpdir(), {
            method: 'GET', url: 'http://[',
        } as any, {} as any)).resolves.toBe(false);
    });

    it('keeps discovery out of the React builder and preserves integration artifacts', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        const integration = fs.readFileSync(path.join(__dirname, '..', 'core', 'api-discovery', 'integration.ts'), 'utf8');
        const webSearch = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SearchApiTool.ts'), 'utf8');
        expect(source).toContain('integrationPlanFromSelection(input?.apiSelection)');
        expect(source).not.toContain('discoverIntegrationForRequest');
        expect(integration).not.toContain('apiDiscoveryService');
        expect(webSearch).not.toContain('public-api');
        expect(['src/integrations/externalApi.js', 'src/integrations/externalApi.css', '.joe/external-api.json', '.env.example', 'server/joeExternalApiProxy.js'].every(isExternalIntegrationArtifact)).toBe(true);
    });

    it('does not preserve a source-level acceptance claim after live verification fails', () => {
        const report = guardUnverifiedBuilderClaims('Build succeeded.\n✅ Acceptance accepted: all 1/1 requested criteria were proven.\nFiles exist.', false, false);
        expect(report).not.toContain('Acceptance accepted');
        expect(report).toContain('live acceptance has not been proven');
    });
});
