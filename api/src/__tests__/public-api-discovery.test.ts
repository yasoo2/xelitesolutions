import fs from 'fs';
import os from 'os';
import path from 'path';
import dns from 'dns/promises';
import { ApiCatalogIndex } from '../core/api-discovery/catalog-index';
import { PublicApisCatalogProvider, parsePublicApisReadme } from '../core/api-discovery/public-apis-provider';
import { ApiDiscoveryService } from '../core/api-discovery/service';
import { SafeApiValidator, assertSafePublicUrl, isPrivateAddress } from '../core/api-discovery/network-policy';
import type { ApiCatalogProvider, PublicApiRecord } from '../core/api-discovery/types';
import { PLANNER_TOOL_CATALOGUE } from '../core/orchestrator/plan-tools';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { selectValidatedCandidate } from '../modules/tools/definitions/PublicApiDiscoveryTools';

const rows: PublicApiRecord[] = [
    { id: 'weather-keyed', name: 'WeatherAPI', description: 'weather forecast', category: 'Weather', auth: 'apiKey', https: true, cors: 'unknown', docsUrl: 'https://weather.example/docs', source: 'test', capabilities: ['weather', 'forecast'], pricing: 'FREEMIUM', health: 'HEALTHY' },
    { id: 'open-weather', name: 'Open-Meteo', description: 'temperature and forecast', category: 'Weather', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://docs.example/weather', source: 'test', capabilities: ['weather', 'temperature'], pricing: 'FREE', reputable: true, health: 'HEALTHY' },
    { id: 'currency', name: 'Frankfurter', description: 'foreign exchange conversion', category: 'Currency Exchange', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://docs.example/currency', source: 'test', capabilities: ['currency', 'forex', 'exchange'], pricing: 'UNKNOWN', health: 'UNKNOWN' },
    { id: 'dead-weather', name: 'Old Weather', description: 'weather', category: 'Weather', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://dead.example/docs', source: 'test', capabilities: ['weather'], pricing: 'FREE', health: 'UNAVAILABLE' },
];

const markdown = (count = 101) => {
    const records = [
        '| [Open-Meteo](https://open-meteo.com/en/docs) | Forecast and temperature | No | Yes | Yes |',
        '| [Frankfurter](https://www.frankfurter.app/docs) | Currency exchange rates | No | Yes | Yes |',
        ...Array.from({ length: count - 2 }, (_, index) => `| [Fixture ${index}](https://example.com/${index}) | Fixture data ${index} | No | Yes | Unknown |`),
    ];
    return `### Weather\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n${records[0]}\n${records.slice(2).join('\n')}\n### Currency Exchange\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n${records[1]}`;
};

describe('public API discovery', () => {
    afterEach(() => jest.restoreAllMocks());

    it('finds weather and currency APIs with deterministic ranking and filters', () => {
        const registry = new ApiCatalogIndex(); registry.replace([...rows, { ...rows[1], id: 'http-weather', name: 'HTTP Weather', https: false }]);
        const weather = registry.findApis({ query: 'weather forecast', requiresNoAuth: true, requiresHttps: true, requiresCors: true });
        expect(weather[0].id).toBe('open-weather');
        expect(weather.map(item => item.id)).not.toContain('weather-keyed');
        expect(weather.map(item => item.id)).not.toContain('http-weather');
        expect(registry.findApis({ query: 'currency conversion' })[0].id).toBe('currency');
        expect(registry.findApis({ query: 'weather forecast', requiresNoAuth: true })).toEqual(registry.findApis({ query: 'weather forecast', requiresNoAuth: true }));
    });

    it('penalizes unavailable candidates and ignores malformed records', () => {
        const registry = new ApiCatalogIndex();
        expect(() => registry.replace([null, {}, { id: 'bad', name: 'Bad', docsUrl: 'file:///etc/passwd' }, ...rows])).not.toThrow();
        expect(registry.findApis({ query: 'weather' })[0].id).toBe('open-weather');
        expect(registry.findApis({ query: 'weather' }).map(item => item.id)).not.toContain('dead-weather');
    });

    it('strips executable fields from untrusted catalog records', () => {
        const registry = new ApiCatalogIndex();
        registry.replace([{ ...rows[1], baseUrl: 'http://127.0.0.1:5000/private', integrationProfileId: 'forged-profile' } as any]);
        const stored: any = registry.get('open-weather');
        expect(stored.baseUrl).toBeUndefined();
        expect(stored.integrationProfileId).toBe('open-meteo-weather-v1');
    });

    it('performs one fresh remote load and maps refreshed records to maintained profiles', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-remote-'));
        const fetchCatalog = jest.fn(async () => markdown());
        const provider = new PublicApisCatalogProvider(dir, fetchCatalog);
        const service = new ApiDiscoveryService([provider], { validate: jest.fn() } as any);
        const weather = await service.search({ query: 'weather', requiresNoAuth: true });
        const currency = await service.search({ query: 'currency' });
        expect(fetchCatalog).toHaveBeenCalledTimes(1);
        expect(weather.find(item => item.name === 'Open-Meteo')?.integrationProfileId).toBe('open-meteo-weather-v1');
        expect(currency.find(item => item.name === 'Frankfurter')?.integrationProfileId).toBe('frankfurter-currency-v2');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('falls back to cache when refresh fails', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-cache-'));
        await new PublicApisCatalogProvider(dir, async () => markdown()).load({ refresh: true });
        const result = await new PublicApisCatalogProvider(dir, async () => { throw new Error('offline'); }).load({ refresh: true });
        expect(result.entries.length).toBeGreaterThan(100);
        expect(result.warning).toContain('fallback=cache');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('falls back to the vetted bootstrap when refresh and cache fail', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-bootstrap-'));
        const result = await new PublicApisCatalogProvider(dir, async () => { throw new Error('offline'); }).load({ refresh: true });
        expect(result.entries.some(entry => entry.name === 'Open-Meteo')).toBe(true);
        expect(result.warning).toContain('fallback=vetted_bootstrap');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('continues with another catalog provider when one provider crashes', async () => {
        const broken: ApiCatalogProvider = { id: 'broken', load: async () => { throw new Error('provider offline'); } };
        const healthy: ApiCatalogProvider = { id: 'healthy', load: async () => ({ entries: rows, source: 'healthy', fetchedAt: new Date().toISOString() }) };
        const service = new ApiDiscoveryService([broken, healthy], { validate: jest.fn() } as any);
        await expect(service.search({ query: 'currency' })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'currency' })]));
    });

    it('uses only a maintained API probe, never the docs URL', async () => {
        const provider: ApiCatalogProvider = { id: 'test', load: async () => ({ entries: [rows[1]], source: 'test', fetchedAt: new Date().toISOString() }) };
        const validate = jest.fn(async () => ({ health: 'UNAVAILABLE', checkedAt: new Date().toISOString(), durationMs: 4, errorCategory: 'NETWORK' }));
        const service = new ApiDiscoveryService([provider], { validate } as any);
        const candidate = (await service.search({ query: 'weather' }))[0];
        const checked = await service.validate(candidate.id);
        expect(validate).toHaveBeenCalledWith('https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.97&current_weather=true');
        expect(validate).not.toHaveBeenCalledWith(rows[1].docsUrl);
        expect(checked.health).toBe('UNAVAILABLE');
        const reranked = (await service.search({ query: 'weather' })).find(item => item.id === candidate.id)!;
        expect(reranked.score).toBeLessThan(candidate.score);
        expect(reranked.warnings).toContain('Recent validation failed');
    });

    it('leaves discovery-only records UNKNOWN without probing their docs host', async () => {
        const record = { ...rows[1], id: 'unknown-provider', name: 'Unknown Provider' };
        const provider: ApiCatalogProvider = { id: 'test', load: async () => ({ entries: [record], source: 'test', fetchedAt: new Date().toISOString() }) };
        const validate = jest.fn();
        const service = new ApiDiscoveryService([provider], { validate } as any);
        expect(await service.validate(record.id)).toMatchObject({ health: 'UNKNOWN', healthDetail: 'no_trusted_probe' });
        expect(validate).not.toHaveBeenCalled();
    });

    it('validates the next maintained candidate after the first is unavailable', async () => {
        const candidates: any[] = [
            { ...rows[1], id: 'candidate-a', integrationProfileId: 'open-meteo-weather-v1', score: 99, reasons: [], warnings: [] },
            { ...rows[0], id: 'candidate-b', integrationProfileId: 'weatherapi-key-v1', score: 88, health: 'UNKNOWN', reasons: [], warnings: [] },
        ];
        const validate = jest.fn()
            .mockResolvedValueOnce({ ...candidates[0], health: 'UNAVAILABLE' })
            .mockResolvedValueOnce({ ...candidates[1], health: 'UNKNOWN' });
        const search = jest.fn().mockResolvedValue(candidates);

        const result = await selectValidatedCandidate(
            { search, validate } as any,
            { query: 'weather', integrationRequired: true },
            candidates,
        );

        expect(result.selected?.id).toBe('candidate-b');
        expect(result.attempted).toEqual(['candidate-a', 'candidate-b']);
        expect(validate).toHaveBeenCalledTimes(2);
        expect(result.allUnavailable).toBe(false);
    });

    it('returns an honest blocker when every bounded maintained candidate is unavailable', async () => {
        const candidates: any[] = [
            { ...rows[1], id: 'candidate-a', integrationProfileId: 'open-meteo-weather-v1', score: 99, reasons: [], warnings: [] },
            { ...rows[0], id: 'candidate-b', integrationProfileId: 'weatherapi-key-v1', score: 88, reasons: [], warnings: [] },
        ];
        const validate = jest.fn(async (id: string) => ({ ...candidates.find(item => item.id === id), health: 'UNAVAILABLE' }));
        const result = await selectValidatedCandidate(
            { search: jest.fn().mockResolvedValue(candidates), validate } as any,
            { query: 'weather', integrationRequired: true },
            candidates,
        );

        expect(result.selected).toBeUndefined();
        expect(result.allUnavailable).toBe(true);
        expect(result.attempted).toEqual(['candidate-a', 'candidate-b']);
    });

    it('rejects local/private destinations and classifies timeout safely', async () => {
        expect(isPrivateAddress('10.0.0.1')).toBe(true);
        expect(isPrivateAddress('192.168.1.2')).toBe(true);
        expect(isPrivateAddress('172.20.0.1')).toBe(true);
        expect(isPrivateAddress('169.254.169.254')).toBe(true);
        expect(isPrivateAddress('::1')).toBe(true);
        await expect(assertSafePublicUrl('http://localhost:5000/private')).rejects.toThrow('blocked');
        await expect(assertSafePublicUrl('http://127.0.0.1/private')).rejects.toThrow('blocked');
        jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);
        const request = jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
        await expect(new SafeApiValidator(request as any).validate('https://example.com/probe', { timeoutMs: 250 }))
            .resolves.toMatchObject({ health: 'DEGRADED', errorCategory: 'TIMEOUT' });
    });

    it('parses catalog metadata and keeps one canonical planner-facing search', () => {
        const parsed = parsePublicApisReadme('### Weather\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n| [Open-Meteo](https://example.com/docs) | Forecast data | No | Yes | Yes |');
        expect(parsed[0]).toMatchObject({ name: 'Open-Meteo', category: 'Weather', auth: 'none', https: true, cors: 'yes' });
        expect(PLANNER_TOOL_CATALOGUE.filter(item => item.tool === 'search_public_apis')).toHaveLength(1);
        const plan = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Build a simple weather dashboard using a free public API.');
        expect(plan.phases[0].tasks.map((task: any) => task.tool)).toEqual(['search_public_apis', 'react_project']);
        expect(plan.phases[0].tasks[0].args).toMatchObject({ validateTop: true, integrationRequired: true, requiresHttps: true, requiresNoAuth: true });
        const naturalWeather = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Build me an Istanbul weather dashboard.');
        const naturalCurrency = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Build me a currency converter.');
        expect(naturalWeather.phases[0].tasks.map((task: any) => task.tool)).toEqual(['search_public_apis', 'react_project']);
        expect(naturalCurrency.phases[0].tasks.map((task: any) => task.tool)).toEqual(['search_public_apis', 'react_project']);
        expect((new ProjectPlannerTool() as any).constrainedFrontendPlan('Build me a local todo app.').phases[0].tasks.map((task: any) => task.tool))
            .toEqual(['react_project']);
    });
});
