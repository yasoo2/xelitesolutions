import { capabilityFamilyFromRequest, capabilityProfilesFor, compactCapabilityDecisionReceiptForRuntime, decideCapabilityRoute, type CapabilityCandidate } from '../core/capabilities/decision-profiles';

const candidate = (id: string, family: string, overrides: Partial<CapabilityCandidate> = {}): CapabilityCandidate => ({
    id, family, route: 'local', setup: 'ZERO_SETUP', reliability: 'PROVEN', privacy: 'LOCAL',
    supportsOffline: true, supportsDeployment: true, recurringCost: 'NONE', maintenance: 'LOW',
    evidenceCheckedAt: '2026-09-22T00:00:00.000Z', ...overrides,
});

describe('capability decision profiles', () => {
    it('selects the lowest-burden viable route across generic capability families', () => {
        const fixtures = [
            candidate('offline-ocr', 'ocr'),
            candidate('public-geocode', 'geocoding', { route: 'public_api', privacy: 'EXTERNAL', supportsOffline: false }),
            candidate('drive-connect', 'storage', { route: 'account_connection', setup: 'CONNECT_ACCOUNT', privacy: 'EXTERNAL', supportsOffline: false }),
            candidate('speech-key', 'speech', { route: 'api_key', setup: 'KEY_REQUIRED', privacy: 'EXTERNAL', supportsOffline: false }),
            candidate('paid-routing', 'routing', { route: 'paid_service', setup: 'PAID_REQUIRED', privacy: 'EXTERNAL', supportsOffline: false, recurringCost: 'PAID' }),
        ];
        for (const item of fixtures) {
            const result = decideCapabilityRoute({ family: item.family, allowPaid: true }, fixtures);
            expect(result.selected?.id).toBe(item.id);
        }
    });

    it('does not select a lower-setup route that violates safety, privacy, or reliability', () => {
        const result = decideCapabilityRoute({ family: 'translation', privacy: 'LOCAL_ONLY', requireProvenReliability: true }, [
            candidate('unproven-public', 'translation', { route: 'public_api', privacy: 'EXTERNAL', supportsOffline: false, reliability: 'UNKNOWN' }),
            candidate('local-proven', 'translation'),
        ]);
        expect(result.selected?.id).toBe('local-proven');
        expect(result.rejected[0].reasons).toEqual(expect.arrayContaining(['does not satisfy local-only privacy', 'reliability is unknown, not proven']));
    });

    it('downgrades stale or missing evidence and makes the reason inspectable', () => {
        const result = decideCapabilityRoute({ family: 'search' }, [
            candidate('stale-zero-setup', 'search', { reliability: 'STALE' }),
            candidate('proven-connect', 'search', { route: 'account_connection', setup: 'CONNECT_ACCOUNT', privacy: 'EXTERNAL', supportsOffline: false }),
        ]);
        expect(result.selected?.id).toBe('proven-connect');
        expect(result.evidenceFreshness).toBe('fresh');
        expect(result.rankedAlternatives.map(item => item.candidate.id)).toEqual(['proven-connect', 'stale-zero-setup']);
    });

    it('returns one required user action and never invents an account action for local work', () => {
        expect(decideCapabilityRoute({ family: 'ocr', offline: true }, [candidate('local', 'ocr')]).requiredUserAction).toBeNull();
        expect(decideCapabilityRoute({ family: 'storage' }, [candidate('connect', 'storage', { route: 'account_connection', setup: 'CONNECT_ACCOUNT', privacy: 'EXTERNAL', supportsOffline: false })]).requiredUserAction)
            .toBe('CONNECT_ACCOUNT');
    });

    it('evaluates rate limits, licensing, and maintenance as decision constraints', () => {
        const result = decideCapabilityRoute({ family: 'routing', requiresUnlimitedRate: true, allowedLicenses: ['PROVIDER_TERMS'], maxMaintenance: 'LOW' }, capabilityProfilesFor('routing'));
        expect(result.selected?.id).toBe('routing-paid');
        expect(result.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'routing-public', reasons: expect.arrayContaining(['has a declared rate limit', 'license is not allowed by the request']) })]));
    });

    it('classifies broad request language without binding it to a provider', () => {
        expect(capabilityFamilyFromRequest('Build an offline OCR document scanner.')).toBe('ocr');
        expect(capabilityFamilyFromRequest('ابني خدمة لتخطيط مسار الرحلة')).toBe('routing');
        expect(capabilityFamilyFromRequest('Build an invoice editor.')).toBeNull();
    });

    it('keeps selected, viable, and rejected evidence shallow for bounded runtime memory', () => {
        const compact = compactCapabilityDecisionReceiptForRuntime(decideCapabilityRoute({ family: 'storage', deployment: true }, capabilityProfilesFor('storage')));
        expect(compact).toMatchObject({ selected: { route: 'account_connection', setup: 'CONNECT_ACCOUNT' } });
        expect(compact?.viableAlternatives).toEqual([]);
        expect(compact?.rejectedAlternatives).toEqual(expect.arrayContaining(['storage-local: does not support the deployment target']));
    });
});
