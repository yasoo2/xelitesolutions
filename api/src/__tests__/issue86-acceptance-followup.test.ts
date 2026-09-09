import {
    capabilityFromRequest,
    externalDataAppSource,
    integrationPlanFromSelection,
    resolveProxyClientUrl,
} from '../core/api-discovery/integration';
import type { ApiSelectionArtifact, RankedApiCandidate } from '../core/api-discovery/types';
import { selectValidatedCandidate } from '../modules/tools/definitions/PublicApiDiscoveryTools';

const selected = (capability: 'currency' | 'ip', profile: string): ApiSelectionArtifact => ({
    version: 1,
    apiId: `test-${capability}`,
    integrationProfileId: profile,
    providerName: capability === 'currency' ? 'Frankfurter' : 'ipapi.co',
    source: 'public-apis/public-apis',
    auth: 'none',
    cors: 'yes',
    pricing: 'UNKNOWN',
    health: 'HEALTHY',
    reasons: ['Exact capability match'],
    warnings: [],
    requiredEnvNames: [],
});

describe('issue #86 live acceptance follow-up', () => {
    it('recognises external-data intent without requiring the user to say API', () => {
        expect(capabilityFromRequest('Build a simple weather dashboard.')).toBe('weather');
        expect(capabilityFromRequest('Create a currency converter.')).toBe('currency');
        expect(capabilityFromRequest('Build an IP information page.')).toBe('ip');
    });

    it('keeps proxy requests under the durable preview project key', () => {
        expect(resolveProxyClientUrl(
            '/api/joe-external/currency',
            'http://localhost:5002/project-preview/session-1/index.html?v=1',
        ).toString()).toBe('http://localhost:5002/project-preview/session-1/api/joe-external/currency');
    });

    it('normalises Arabic digits and rejects mixed text in the English currency UI', () => {
        const plan = integrationPlanFromSelection(selected('currency', 'frankfurter-currency-v2'))!;
        const source = externalDataAppSource(plan);
        expect(source).toContain('charCodeAt(0)-1632');
        expect(source).toContain("setAmountError('Use digits and one decimal point only')");
        expect(source).toContain('lang="en-US"');
        expect(source).toContain('aria-invalid={amountError');
    });

    it('keeps optional IP lookup keyboard-submit semantics with explicit English validation', () => {
        const plan = integrationPlanFromSelection(selected('ip', 'ipapi-co-v1'))!;
        const source = externalDataAppSource(plan);
        expect(source).toContain('<form onSubmit={run} noValidate');
        expect(source).toContain('data-optional-submit="true"');
        expect(source).toContain('Enter a valid IPv4 address, for example 8.8.8.8');
        expect(source).toContain("Number(part)<=255");
    });

    it('skips an unavailable first candidate and selects the next maintained candidate', async () => {
        const candidates = [
            { id: 'dead', integrationProfileId: 'ipapi-co-v1', health: 'UNKNOWN' },
            { id: 'healthy', integrationProfileId: 'ipapi-co-v1', health: 'UNKNOWN' },
        ] as RankedApiCandidate[];
        const service = {
            search: jest.fn(async () => candidates),
            validate: jest.fn(async (id: string) => ({
                ...candidates.find(candidate => candidate.id === id)!,
                health: id === 'dead' ? 'UNAVAILABLE' : 'HEALTHY',
            })),
        };
        const result = await selectValidatedCandidate(service as any, {
            query: 'IP information',
            integrationRequired: true,
        }, candidates);
        expect(result.selected?.id).toBe('healthy');
        expect(result.attempted).toEqual(['dead', 'healthy']);
    });
});
