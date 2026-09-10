import fs from 'fs';
import os from 'os';
import path from 'path';
import { capabilityFromRequest, externalDataAppSource, integrationArtifacts, integrationPlanFromSelection, resolveProxyClientUrl, viteConfigWithExternalProxy } from '../core/api-discovery/integration';
import type { ApiSelectionArtifact } from '../core/api-discovery/types';
import { isExternalIntegrationArtifact } from '../modules/tools/definitions/ReactProjectTool';
import { guardUnverifiedBuilderClaims } from '../core/api-discovery/reporting';
import { handleMaintainedPreviewApiRequest } from '../core/api-discovery/preview-proxy';
import { scaffoldSubstitutionFor } from '../core/design/scaffold-substitution';
import { resolvePreviewApiRequest } from '../api/routes/projectPreview';
import { verifyNamed } from '../core/quality/named-requirements';
import { buildExternalApiAcceptanceEvidence, externalApiSourceVerdict } from '../core/api-discovery/acceptance-evidence';
import { acceptanceFor } from '../core/quality/acceptance';

const selection = (overrides: Partial<ApiSelectionArtifact> = {}): ApiSelectionArtifact => ({
    version: 1, apiId: 'remote-frankfurter', integrationProfileId: 'frankfurter-currency-v2',
    providerName: 'Frankfurter', source: 'public-apis/public-apis', auth: 'none', cors: 'yes',
    pricing: 'UNKNOWN', health: 'HEALTHY', reasons: ['Exact capability match'], warnings: [], requiredEnvNames: [],
    ...overrides,
});

const acceptanceEvidence = (
    selected = selection(),
    runtime: 'passed' | 'failed' | 'unverified' = 'passed',
) => {
    const plan = integrationPlanFromSelection(selected)!;
    const files = integrationArtifacts(plan);
    return buildExternalApiAcceptanceEvidence({
        capability: plan.capability,
        selection: plan.selection,
        clientSource: files['src/integrations/externalApi.js'],
        appSource: externalDataAppSource(plan),
        proxySource: files['server/joeExternalApiProxy.js'],
        audit: runtime === 'unverified' ? null : {
            findings: runtime === 'failed' ? [{ id: 'failed_requests', severity: 'high' }] : [],
            passes: [{ id: 'runtime', status: runtime }],
            externalApiRuntime: {
                capability: plan.capability,
                integrationProfileId: plan.selection.integrationProfileId,
                successfulRequests: 1,
                renderedLiveResult: true,
            },
        },
    });
};

describe('external API generation contract', () => {
    it('does not announce a generic-page substitution for supported live-data apps', () => {
        expect(scaffoldSubstitutionFor('Create a currency converter using a public API.', true).substituted).toBe(false);
        expect(scaffoldSubstitutionFor('Build a simple weather dashboard.', true).substituted).toBe(false);
        expect(scaffoldSubstitutionFor('Build an IP information page.', true).substituted).toBe(false);
    });

    it('detects only supported external-data capabilities', () => {
        expect(capabilityFromRequest('Build a simple weather dashboard using a free public API.')).toBe('weather');
        expect(capabilityFromRequest('Create a currency converter using a public API')).toBe('currency');
        expect(capabilityFromRequest('Build an IP information page')).toBe('ip');
        expect(capabilityFromRequest('Build a todo list')).toBeNull();
    });

    it('proves the catalogue structural rule for the exact currency request from executable evidence', () => {
        const request = 'Create a currency converter using a public API that does not require authentication if possible.';
        const rule = acceptanceFor(request)[0]?.expectedRule?.text || '';
        const plan = integrationPlanFromSelection(selection())!;
        const files = integrationArtifacts(plan);
        const source = [
            files['.joe/external-api.json'],
            files['server/joeExternalApiProxy.js'],
            files['src/integrations/externalApi.js'],
            externalDataAppSource(plan),
        ].join('\n');
        expect(source).toContain('Frankfurter');
        expect(externalApiSourceVerdict({ id: 'rule:1', text: rule, quote: rule }, acceptanceEvidence()))
            .toMatchObject({ verdict: 'met' });
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

    it('resolves the API client within durable previews and at the root Vite server', () => {
        const endpoint = '/api/joe-external/currency';
        expect(resolveProxyClientUrl(endpoint, 'http://127.0.0.1:60390/').pathname).toBe(endpoint);
        for (const href of [
            'http://127.0.0.1:5002/project-preview/project-a/',
            'http://127.0.0.1:5002/project-preview/project-a/index.html?v=1',
            'http://127.0.0.1:5002/project-preview/project-a/nested/page.html',
        ]) {
            expect(resolveProxyClientUrl(endpoint, href).pathname).toBe('/project-preview/project-a/api/joe-external/currency');
        }
    });

    it('proves the requested no-auth currency integration from generated artifacts without an LLM judge', async () => {
        const plan = integrationPlanFromSelection(selection())!;
        const files = integrationArtifacts(plan);
        const source = [
            ...Object.values(files),
            externalDataAppSource(plan),
        ].join('\n');
        let modelCalls = 0;
        const [verdict] = await verifyNamed([{
            id: 'req-currency',
            text: 'Create a currency converter using a public API that does not require authentication if possible',
            quote: 'Create a currency converter using a public API that does not require authentication if possible',
        }], source, false, async () => {
            modelCalls += 1;
            throw new Error('the deterministic integration contract should decide this');
        }, acceptanceEvidence());

        expect(modelCalls).toBe(0);
        expect(verdict.verdict).toBe('met');
        expect(verdict.why).toContain('no-auth provider');
    });

    it('proves the two atomic clauses produced by the real request reader', async () => {
        const plan = integrationPlanFromSelection(selection())!;
        const source = [...Object.values(integrationArtifacts(plan)), externalDataAppSource(plan)].join('\n');
        let modelCalls = 0;
        const verdicts = await verifyNamed([
            { id: 'req-api', text: 'using a public API', quote: 'using a public API' },
            { id: 'req-auth', text: 'that does not require authentication if possible', quote: 'that does not require authentication if possible' },
        ], source, false, async () => {
            modelCalls += 1;
            throw new Error('both atomic contracts are source-backed');
        }, acceptanceEvidence());

        expect(modelCalls).toBe(0);
        expect(verdicts.map(item => item.verdict)).toEqual(['met', 'met']);
    });

    it('proves the combined atomic API and no-auth clause emitted by the request reader', async () => {
        const plan = integrationPlanFromSelection(selection())!;
        const source = [...Object.values(integrationArtifacts(plan)), externalDataAppSource(plan)].join('\n');
        const clause = 'Use a public API that does not require authentication if possible';
        const [verdict] = await verifyNamed([{ id: 'req-combined', text: clause, quote: clause }], source, false, async () => {
            throw new Error('the combined atomic contract is source-backed');
        }, acceptanceEvidence());
        expect(verdict.verdict).toBe('met');
        expect(verdict.why).toContain('no-auth provider');
    });

    it('does not certify extra capabilities that the maintained currency profile does not implement', async () => {
        const plan = integrationPlanFromSelection(selection())!;
        const source = [...Object.values(integrationArtifacts(plan)), externalDataAppSource(plan)].join('\n');
        let modelCalls = 0;
        const [verdict] = await verifyNamed([{
            id: 'req-composite',
            text: 'Create a currency converter using a public API with a 30-day historical chart and offline conversion',
            quote: 'Create a currency converter using a public API with a 30-day historical chart and offline conversion',
        }], source, false, async () => {
            modelCalls += 1;
            return JSON.stringify({ verdict: 'unmet', why: 'The requested chart and offline behavior are absent.' });
        }, acceptanceEvidence());

        expect(modelCalls).toBe(1);
        expect(verdict.verdict).toBe('unmet');
    });

    it.each([
        ['Create a currency converter using a public API', 'Create a currency converter using a public API with a 30-day historical chart and offline conversion'],
        ['Create a currency converter using a public API with a 30-day historical chart and offline conversion', 'Create a currency converter using a public API'],
    ])('does not let a simple summary hide obligations in the other requirement representation', async (text, quote) => {
        const plan = integrationPlanFromSelection(selection())!;
        const source = [...Object.values(integrationArtifacts(plan)), externalDataAppSource(plan)].join('\n');
        let modelCalls = 0;
        const [verdict] = await verifyNamed([{ id: 'req-mixed', text, quote }], source, false, async () => {
            modelCalls += 1;
            return JSON.stringify({ verdict: 'unmet', why: 'The extra chart and offline behavior are absent.' });
        }, acceptanceEvidence());

        expect(modelCalls).toBe(1);
        expect(verdict.verdict).toBe('unmet');
    });

    it('ignores comment-only external integration markers', async () => {
        const spoofed = `/*
          "capability": "currency", "apiId": "fake", "integrationProfileId": "frankfurter-currency-v2",
          "auth": "none", "requiredEnvironmentVariables": [], export const externalApi = { async load() {} },
          AbortController response.ok function joeExternalApiProxy() redirect: 'error' MAX_RESPONSE_BYTES
          className="external-api-app" role="status" role="alert"
        */`;
        let modelCalls = 0;
        const [verdict] = await verifyNamed([{
            id: 'req-spoof', text: 'Create a currency converter using a public API', quote: 'Create a currency converter using a public API',
        }], spoofed, false, async () => {
            modelCalls += 1;
            throw new Error('no source-backed integration exists');
        });

        expect(modelCalls).toBe(1);
        expect(verdict.verdict).toBe('unprovable');
    });

    it('proves the maintained direct Open-Meteo weather transport without requiring a proxy', async () => {
        const plan = integrationPlanFromSelection(selection({
            apiId: 'remote-open-meteo', integrationProfileId: 'open-meteo-weather-v1', providerName: 'Open-Meteo',
        }))!;
        const source = [...Object.values(integrationArtifacts(plan)), externalDataAppSource(plan)].join('\n');
        let modelCalls = 0;
        const [verdict] = await verifyNamed([{
            id: 'req-weather', text: 'Build a simple weather dashboard using a free public API.', quote: 'Build a simple weather dashboard using a free public API.',
        }], source, false, async () => {
            modelCalls += 1;
            throw new Error('the maintained direct transport should decide this');
        }, acceptanceEvidence(selection({
            apiId: 'remote-open-meteo', integrationProfileId: 'open-meteo-weather-v1',
            providerName: 'Open-Meteo', pricing: 'FREEMIUM',
        })));

        expect(modelCalls).toBe(0);
        expect(verdict.verdict).toBe('met');
        expect(source).not.toContain('joeExternalApiProxy');
    });

    it('lets a serious browser or API failure override complete generated artifacts', () => {
        const evidence = acceptanceEvidence(selection(), 'failed');
        const requirement = {
            id: 'req-runtime', text: 'Create a currency converter using a public API',
            quote: 'Create a currency converter using a public API',
        };
        const verdict = externalApiSourceVerdict(requirement, evidence);
        expect(verdict).toMatchObject({ verdict: 'unmet' });
        expect(verdict?.why).toContain('failed_requests');
    });

    it('does not accept structured generation without browser runtime evidence', () => {
        const verdict = externalApiSourceVerdict({
            id: 'req-unverified', text: 'using a public API', quote: 'using a public API',
        }, acceptanceEvidence(selection(), 'unverified'));
        expect(verdict).toMatchObject({ verdict: 'unmet' });
        expect(verdict?.why).toContain('runtime browser evidence');
    });

    it('does not treat a clean generic runtime pass as proof that live API data rendered', () => {
        const plan = integrationPlanFromSelection(selection())!;
        const files = integrationArtifacts(plan);
        const evidence = buildExternalApiAcceptanceEvidence({
            capability: plan.capability,
            selection: plan.selection,
            clientSource: files['src/integrations/externalApi.js'],
            appSource: externalDataAppSource(plan),
            proxySource: files['server/joeExternalApiProxy.js'],
            audit: { findings: [], passes: [{ id: 'runtime', status: 'passed' }] },
        });
        expect(evidence.runtime.status).toBe('unverified');
        expect(externalApiSourceVerdict({
            id: 'req-no-live-result', text: 'using a public API', quote: 'using a public API',
        }, evidence)).toMatchObject({ verdict: 'unmet' });
    });

    it('requires positive evidence to match the selected maintained profile', () => {
        const plan = integrationPlanFromSelection(selection())!;
        const files = integrationArtifacts(plan);
        const evidence = buildExternalApiAcceptanceEvidence({
            capability: plan.capability,
            selection: plan.selection,
            clientSource: files['src/integrations/externalApi.js'],
            appSource: externalDataAppSource(plan),
            proxySource: files['server/joeExternalApiProxy.js'],
            audit: {
                findings: [], passes: [{ id: 'runtime', status: 'passed' }],
                externalApiRuntime: {
                    capability: plan.capability,
                    integrationProfileId: 'open-meteo-weather-v1',
                    successfulRequests: 1,
                    renderedLiveResult: true,
                },
            },
        });
        expect(evidence.runtime.status).toBe('unverified');
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
            (global as any).joeProjects = { ...(global as any).joeProjects, 'currency-preview': { dir: root } };
            const routed = resolvePreviewApiRequest(
                'currency-preview',
                'api/joe-external/currency',
                '/currency-preview/api/joe-external/currency?amount=125&from=EUR&to=TRY',
            );
            expect(routed?.root).toBe(root);
            await expect(handleMaintainedPreviewApiRequest(routed!.root, {
                method: 'GET', url: routed!.url,
            } as any, res)).resolves.toBe(true);
            expect(status).toBe(200);
            expect(JSON.parse(body)).toEqual({ amount: 125, base: 'EUR', date: '2026-09-08', rates: { TRY: 7035 } });
            expect(fetchSpy).toHaveBeenCalledWith(
                new URL('https://api.frankfurter.dev/v2/rate/EUR/TRY'),
                expect.objectContaining({ redirect: 'error' }),
            );
        } finally {
            delete (global as any).joeProjects?.['currency-preview'];
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
        const browserQa = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf8');
        const webSearch = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SearchApiTool.ts'), 'utf8');
        expect(source).toContain('integrationPlanFromSelection(input?.apiSelection)');
        expect(source).toContain('if (!appBp && !externalIntegration && !input?.skipInstall');
        expect(source).not.toContain('discoverIntegrationForRequest');
        expect(integration).not.toContain('apiDiscoveryService');
        expect(browserQa).toContain("['numeric', 'decimal'].includes(input.inputMode)");
        expect(browserQa).toContain('declared === expected || constrainedNumericText');
        expect(webSearch).not.toContain('public-api');
        expect(['src/integrations/externalApi.js', 'src/integrations/externalApi.css', '.joe/external-api.json', '.env.example', 'server/joeExternalApiProxy.js'].every(isExternalIntegrationArtifact)).toBe(true);
    });

    it('keeps maintained API runtime evidence enabled during every improvement-loop measurement', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        expect(source).toContain('const externalApiAuditContext = externalIntegration ?');
        expect(source.match(/\.\.\.externalApiAuditContext/g)).toHaveLength(2);
        expect(source.indexOf('const externalApiAuditContext = externalIntegration ?'))
            .toBeLessThan(source.indexOf('const measureNow = async () =>'));
    });

    it('does not preserve a source-level acceptance claim after live verification fails', () => {
        const report = guardUnverifiedBuilderClaims('Build succeeded.\n✅ Acceptance accepted: all 1/1 requested criteria were proven.\nFiles exist.', false, false);
        expect(report).not.toContain('Acceptance accepted');
        expect(report).toContain('live acceptance has not been proven');
    });
});
