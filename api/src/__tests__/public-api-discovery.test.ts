import dns from 'dns/promises';
import { ApiCatalogIndex } from '../core/api-discovery/catalog-index';
import { ApiDiscoveryService } from '../core/api-discovery/service';
import { assertSafePublicUrl, isPrivateAddress, SafeApiValidator } from '../core/api-discovery/network-policy';
import { parsePublicApisReadme, PublicApisCatalogProvider } from '../core/api-discovery/public-apis-provider';
import type { ApiCatalogProvider, PublicApiRecord } from '../core/api-discovery/types';
import { credentialScaffold } from '../core/api-discovery/integration';
import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { PLANNER_TOOL_CATALOGUE } from '../core/orchestrator/plan-tools';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

const rows: PublicApiRecord[] = [
    { id: 'weather-keyed', name: 'Keyed Weather', description: 'weather forecast', category: 'Weather', auth: 'apiKey', https: true, cors: 'yes', docsUrl: 'https://weather.example/docs', source: 'test', capabilities: ['weather', 'forecast'], pricing: 'FREEMIUM', health: 'HEALTHY' },
    { id: 'open-weather', name: 'Open Weather Data', description: 'temperature and forecast', category: 'Weather', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://open.example/docs', source: 'test', capabilities: ['weather', 'temperature'], pricing: 'FREE', reputable: true, health: 'HEALTHY' },
    { id: 'currency', name: 'Currency Data', description: 'foreign exchange conversion', category: 'Currency Exchange', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://currency.example/docs', source: 'test', capabilities: ['currency', 'forex', 'exchange'], pricing: 'UNKNOWN', health: 'UNKNOWN' },
    { id: 'dead-weather', name: 'Old Weather', description: 'weather', category: 'Weather', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://dead.example/docs', source: 'test', capabilities: ['weather'], pricing: 'FREE', health: 'UNAVAILABLE' },
];

describe('public API discovery', () => {
    it('finds weather and currency APIs with deterministic ranking', () => {
        const registry = new ApiCatalogIndex(); registry.replace(rows);
        const weather = registry.findApis({ query: 'weather forecast', requiresNoAuth: true, requiresHttps: true, requiresCors: true });
        expect(weather[0].id).toBe('open-weather');
        expect(weather.map(item => item.id)).not.toContain('weather-keyed');
        expect(registry.findApis({ query: 'currency conversion' })[0].id).toBe('currency');
        expect(registry.findApis({ query: 'weather forecast', requiresNoAuth: true })).toEqual(registry.findApis({ query: 'weather forecast', requiresNoAuth: true }));
    });

    it('filters HTTPS/auth and penalizes unavailable candidates', () => {
        const registry = new ApiCatalogIndex();
        registry.replace([...rows, { ...rows[1], id: 'http-weather', name: 'HTTP Weather', https: false }]);
        expect(registry.findApis({ query: 'weather', requiresHttps: true }).map(item => item.id)).not.toContain('http-weather');
        const ranked = registry.findApis({ query: 'weather' });
        expect(ranked[0].id).toBe('open-weather');
        expect(ranked.map(item => item.id)).not.toContain('dead-weather');
    });

    it('never replaces an unavailable weather API with a cross-capability currency API', () => {
        const registry = new ApiCatalogIndex();
        registry.replace([
            { ...rows[1], health: 'UNAVAILABLE' },
            rows[2],
        ]);
        const ranked = registry.findApis({ query: 'Build a weather dashboard with a free public API', requiresHttps: true, requiresNoAuth: true, requiresCors: true, browserSide: true });
        expect(ranked.map(item => item.id)).not.toContain('currency');
        expect(ranked[0]?.category).not.toBe('Currency Exchange');
    });

    it('ignores malformed records instead of crashing', () => {
        const registry = new ApiCatalogIndex();
        expect(() => registry.replace([null, {}, { id: 'bad', name: 'Bad', docsUrl: 'file:///etc/passwd' }, rows[0]])).not.toThrow();
        expect(registry.size()).toBe(1);
    });

    it('rejects localhost, private, link-local, and metadata destinations', async () => {
        expect(isPrivateAddress('10.0.0.1')).toBe(true);
        expect(isPrivateAddress('192.168.1.2')).toBe(true);
        expect(isPrivateAddress('169.254.169.254')).toBe(true);
        expect(isPrivateAddress('::1')).toBe(true);
        expect(isPrivateAddress('::ffff:172.16.0.1')).toBe(true);
        await expect(assertSafePublicUrl('http://localhost:5000/private')).rejects.toThrow('blocked');
        await expect(assertSafePublicUrl('http://127.0.0.1/private')).rejects.toThrow('blocked');
        await expect(assertSafePublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('blocked');
        await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow('http/https');
    });

    it('classifies request timeouts without throwing', async () => {
        jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);
        const request = jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        const result = await new SafeApiValidator(request as any).validate('https://example.com/docs', { timeoutMs: 250 });
        expect(result).toMatchObject({ health: 'DEGRADED', errorCategory: 'TIMEOUT' });
    });

    it('does not call an API unavailable when Joe local networking is inconclusive', async () => {
        jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);
        const request = jest.fn().mockRejectedValue(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
        const result = await new SafeApiValidator(request as any).validate('https://example.com/docs');
        expect(result).toMatchObject({ health: 'UNKNOWN', errorCategory: 'NETWORK' });
    });

    it('falls back to another catalog provider when one fails', async () => {
        const broken: ApiCatalogProvider = { id: 'broken', load: async () => { throw new Error('offline'); } };
        const healthy: ApiCatalogProvider = { id: 'healthy', load: async () => ({ entries: rows, source: 'healthy', fetchedAt: new Date().toISOString() }) };
        const service = new ApiDiscoveryService([broken, healthy]);
        const results = await service.search({ query: 'weather' });
        expect(results.map(item => item.id)).toEqual(['open-weather', 'weather-keyed']);
    });

    it('parses the provider format and preserves catalog metadata', () => {
        const parsed = parsePublicApisReadme('### Weather\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n| [Open Sky](https://example.com/docs) | Free forecast data | No | Yes | Yes |');
        expect(parsed[0]).toMatchObject({ name: 'Open Sky', category: 'Weather', auth: 'none', https: true, cors: 'yes', pricing: 'UNKNOWN', source: 'public-apis/public-apis' });
    });

    it('keeps a vetted fallback when remote catalog refresh fails', async () => {
        const provider = new PublicApisCatalogProvider('Z:\\a-directory-that-does-not-exist\\cache');
        const result = await provider.load();
        expect(result.entries.some(entry => entry.name === 'Open-Meteo')).toBe(true);
        expect(result.warning).toContain('bootstrap');
    });

    it('keeps API credentials server-side and fails clearly when missing', () => {
        const files = credentialScaffold('WEATHER_API_KEY', '/api/weather');
        expect(files.envExample).toBe('WEATHER_API_KEY=\n');
        expect(files.serverSource).toContain('process.env.WEATHER_API_KEY');
        expect(files.serverSource).toContain('WEATHER_API_KEY is required');
        expect(files.frontendSource).toBe('export const externalEndpoint = "/api/weather";\n');
        expect(files.frontendSource).not.toContain('WEATHER_API_KEY');
        expect(files.frontendSource).not.toMatch(/apiKey|secret/i);
    });

    it('travels through the existing planner vocabulary and ToolService gateway', async () => {
        expect(PLANNER_TOOL_CATALOGUE.map(item => item.tool)).toEqual(expect.arrayContaining(['search_public_apis', 'inspect_api', 'validate_api']));
        const result: any = await executionFirewall.runAsSystem(() => executeTool('search_public_apis', {
            query: 'weather forecast', requiresNoAuth: true, requiresHttps: true, requiresCors: true,
        }, { sessionId: 'api-discovery-test', workspaceId: 'api-discovery-test', userId: 'system' } as any));
        expect(result.ok).toBe(true);
        expect(result.output.candidates[0]).toMatchObject({ name: 'Open-Meteo', auth: 'none', https: true, cors: 'yes' });
    });

    it('plans public-data discovery before the existing React builder', () => {
        const plan = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Build a simple weather dashboard using a free public API.');
        expect(plan.phases[0].tasks.map((task: any) => task.tool)).toEqual(['search_public_apis', 'react_project']);
        expect(plan.phases[0].tasks[0].args).toMatchObject({ validateTop: true, requiresHttps: true, requiresNoAuth: true });

        const currencyPlan = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Create a currency converter using a public API that does not require authentication if possible.');
        expect(currencyPlan.phases[0].tasks.map((task: any) => task.tool)).toEqual(['search_public_apis', 'react_project']);
        expect(currencyPlan.phases[0].tasks[1].args.request).toContain('currency converter');
    });
});
