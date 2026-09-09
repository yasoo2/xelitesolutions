import type { ApiCatalogProvider, ApiSearchQuery, PublicApiRecord, RankedApiCandidate } from './types';
import { PublicApisCatalogProvider } from './public-apis-provider';
import { ApiCatalogIndex } from './catalog-index';
import { SafeApiValidator } from './network-policy';
import { integrationProfile } from './integration-profiles';

const log = (event: string, fields: Record<string, unknown>) => console.info(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));

export class ApiDiscoveryService {
    readonly index = new ApiCatalogIndex();
    private loaded = false;
    private healthCache = new Map<string, { expiresAt: number; record: PublicApiRecord }>();

    constructor(
        private readonly providers: ApiCatalogProvider[] = [new PublicApisCatalogProvider()],
        private readonly validator = new SafeApiValidator(),
    ) { }

    async ensureLoaded(refresh = false): Promise<void> {
        if (this.loaded && !refresh) return;
        // A cold registry gets one bounded remote refresh. Each provider owns
        // its cache/bootstrap fallback, so failure never removes discovery.
        const shouldRefresh = refresh || !this.loaded;
        const settled = await Promise.allSettled(this.providers.map(provider => provider.load({ refresh: shouldRefresh })));
        const entries: PublicApiRecord[] = [];
        settled.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                entries.push(...result.value.entries);
                if (result.value.warning) log('API_FALLBACK', { provider: this.providers[index]?.id, status: 'stale_catalog', errorCategory: result.value.warning });
                return;
            }
            log('API_FALLBACK', { provider: this.providers[index]?.id, status: 'provider_failed', errorCategory: String(result.reason?.message || result.reason || 'unknown').slice(0, 120) });
        });
        if (!entries.length) throw new Error('api_catalog_unavailable');
        this.index.replace(entries);
        this.loaded = true;
    }

    async search(query: ApiSearchQuery): Promise<RankedApiCandidate[]> {
        await this.ensureLoaded(false);
        const candidates = this.index.findApis(query);
        log('API_SEARCH', { provider: query.provider || 'all', query: query.query, count: candidates.length });
        if (candidates[0]) log('API_SELECTED', { provider: candidates[0].source, endpointHost: new URL(candidates[0].docsUrl).hostname, apiId: candidates[0].id, score: candidates[0].score });
        return candidates;
    }

    async inspect(apiId: string): Promise<PublicApiRecord | undefined> {
        await this.ensureLoaded(false);
        return this.index.get(apiId);
    }

    async validate(apiId: string, force = false): Promise<PublicApiRecord> {
        await this.ensureLoaded(false);
        const entry = this.index.get(apiId);
        if (!entry) throw new Error('api_not_found');
        const cached = this.healthCache.get(apiId);
        if (!force && cached && cached.expiresAt > Date.now()) return { ...cached.record };
        const profile = entry.integrationProfileId ? integrationProfile(entry.integrationProfileId) : undefined;
        if (!profile) {
            const updated = { ...entry, health: 'UNKNOWN' as const, lastCheckedAt: new Date().toISOString(), healthDetail: 'no_trusted_probe' };
            this.index.upsert(updated);
            this.healthCache.set(apiId, { expiresAt: Date.now() + 30 * 60_000, record: updated });
            log('API_VALIDATION', { provider: entry.source, endpointHost: new URL(entry.docsUrl).hostname, duration: 0, status: 'UNKNOWN', errorCategory: 'no_trusted_probe' });
            return updated;
        }
        if (profile.requiredEnvNames.some(name => !process.env[name])) {
            const updated = { ...entry, health: 'UNKNOWN' as const, lastCheckedAt: new Date().toISOString(), healthDetail: 'credentials_required_for_probe' };
            this.index.upsert(updated);
            this.healthCache.set(apiId, { expiresAt: Date.now() + 30 * 60_000, record: updated });
            log('API_VALIDATION', { provider: entry.source, endpointHost: new URL(profile.probeUrl).hostname, duration: 0, status: 'UNKNOWN', errorCategory: 'credentials_required_for_probe' });
            return updated;
        }
        log('API_REQUEST', { provider: entry.source, endpointHost: new URL(profile.probeUrl).hostname, method: 'HEAD', purpose: 'validation' });
        const result = await this.validator.validate(profile.probeUrl);
        const updated = { ...entry, health: result.health, lastCheckedAt: result.checkedAt, healthDetail: result.errorCategory || String(result.status || '') };
        this.index.upsert(updated);
        this.healthCache.set(apiId, { expiresAt: Date.now() + 30 * 60_000, record: updated });
        log('API_VALIDATION', { provider: entry.source, endpointHost: new URL(profile.probeUrl).hostname, duration: result.durationMs, status: result.health, errorCategory: result.errorCategory });
        if (result.health !== 'HEALTHY') log('API_REQUEST_FAILED', { provider: entry.source, endpointHost: new URL(profile.probeUrl).hostname, duration: result.durationMs, status: result.health, errorCategory: result.errorCategory || String(result.status || 'unknown') });
        return updated;
    }
}

let singleton: ApiDiscoveryService | null = null;
export function apiDiscoveryService(): ApiDiscoveryService {
    if (!singleton) singleton = new ApiDiscoveryService();
    return singleton;
}
