import type { ApiSearchQuery, PublicApiRecord, RankedApiCandidate } from './types';
import { profileForCatalogRecord } from './integration-profiles';

const ALIASES: Record<string, string[]> = {
    weather: ['forecast', 'temperature', 'climate', 'meteorology'],
    currency: ['exchange', 'rates', 'conversion', 'forex'],
    ip: ['geolocation', 'location', 'country', 'address'],
    crypto: ['cryptocurrency', 'bitcoin', 'ethereum', 'price'],
    stocks: ['stock', 'market', 'equity', 'finance'],
    news: ['headlines', 'articles', 'media'],
    phone: ['telephone', 'number', 'validation'],
};

const words = (value: unknown) => String(value || '').toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/u).filter(Boolean);
const unique = <T>(items: T[]) => [...new Set(items)];

/** Search index for catalog records. This is not a tool registry. */
export class ApiCatalogIndex {
    private records = new Map<string, PublicApiRecord>();

    replace(entries: unknown[]): void {
        this.records.clear();
        for (const raw of entries || []) {
            if (!raw || typeof raw !== 'object') continue;
            const entry = raw as PublicApiRecord;
            if (!entry.id || !entry.name || !entry.docsUrl || !/^https?:\/\//i.test(entry.docsUrl)) continue;
            const safe: PublicApiRecord = {
                id: String(entry.id).slice(0, 180), name: String(entry.name).slice(0, 160),
                description: String(entry.description || '').slice(0, 800), category: String(entry.category || '').slice(0, 120),
                auth: ['none', 'apiKey', 'oauth', 'unknown'].includes(entry.auth) ? entry.auth : 'unknown',
                https: entry.https === true, cors: ['yes', 'no', 'unknown'].includes(entry.cors) ? entry.cors : 'unknown',
                docsUrl: String(entry.docsUrl).slice(0, 1000), source: String(entry.source || '').slice(0, 160),
                capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.map(String).slice(0, 32) : [],
                pricing: ['FREE', 'FREEMIUM', 'PAID', 'UNKNOWN'].includes(entry.pricing) ? entry.pricing : 'UNKNOWN',
                ...(entry.rateLimit ? { rateLimit: String(entry.rateLimit).slice(0, 160) } : {}),
                ...(entry.responseFormat ? { responseFormat: String(entry.responseFormat).slice(0, 40) } : {}),
                ...(entry.reputable === true ? { reputable: true } : {}),
                ...(entry.lastCheckedAt ? { lastCheckedAt: String(entry.lastCheckedAt).slice(0, 40) } : {}),
                health: ['HEALTHY', 'UNKNOWN', 'DEGRADED', 'UNAVAILABLE'].includes(String(entry.health)) ? entry.health : 'UNKNOWN',
                ...(entry.healthDetail ? { healthDetail: String(entry.healthDetail).slice(0, 180) } : {}),
            };
            const profile = profileForCatalogRecord(safe);
            if (profile) safe.integrationProfileId = profile.id;
            this.records.set(safe.id, safe);
        }
    }

    upsert(entry: PublicApiRecord): void { this.records.set(entry.id, { ...entry }); }
    get(id: string): PublicApiRecord | undefined { const value = this.records.get(id); return value ? { ...value, capabilities: [...value.capabilities] } : undefined; }
    size(): number { return this.records.size; }

    findApis(query: ApiSearchQuery): RankedApiCandidate[] {
        const rawTerms = unique([...words(query.query), ...(query.keywords || []).flatMap(words)]);
        const terms = unique(rawTerms.flatMap(term => [term, ...(ALIASES[term] || [])]));
        const requestedCapabilities = Object.entries(ALIASES)
            .filter(([capability, aliases]) => rawTerms.some(term => term === capability || aliases.includes(term)))
            .map(([capability, aliases]) => [capability, ...aliases]);
        const category = String(query.category || '').toLowerCase();
        const source = String(query.provider || '').toLowerCase();
        const limit = Math.max(1, Math.min(25, Number(query.limit) || 5));
        return [...this.records.values()]
            .filter(entry => !requestedCapabilities.length || requestedCapabilities.some(capabilityTerms => {
                const entryTerms = words(`${entry.name} ${entry.description} ${entry.category} ${entry.capabilities.join(' ')}`);
                return capabilityTerms.some(term => entryTerms.includes(term));
            }))
            .filter(entry => !category || entry.category.toLowerCase().includes(category))
            .filter(entry => !source || entry.source.toLowerCase() === source)
            .filter(entry => !query.requiresNoAuth || entry.auth === 'none')
            .filter(entry => !query.requiresHttps || entry.https)
            .filter(entry => !query.requiresCors || entry.cors === 'yes')
            .map(entry => this.rank(entry, terms, query))
            .filter(candidate => candidate.score > 0)
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
            .slice(0, limit);
    }

    private rank(entry: PublicApiRecord, terms: string[], query: ApiSearchQuery): RankedApiCandidate {
        const haystack = words(`${entry.name} ${entry.description} ${entry.category} ${entry.capabilities.join(' ')}`);
        const reasons: string[] = [];
        const warnings: string[] = [];
        let score = 0;
        const exact = terms.filter(term => haystack.includes(term)).length;
        const fuzzy = terms.filter(term => !haystack.includes(term) && haystack.some(word => word.includes(term) || term.includes(word))).length;
        score += Math.min(54, exact * 14 + fuzzy * 5);
        if (exact) reasons.push(`${exact} exact capability/keyword match${exact === 1 ? '' : 'es'}`);
        if (entry.https) { score += 12; reasons.push('HTTPS supported'); } else { score -= 35; warnings.push('HTTP only'); }
        if (entry.auth === 'none') { score += 10; reasons.push('No authentication required'); }
        else if (entry.auth === 'apiKey') { score -= 5; warnings.push('API key required'); }
        if (entry.cors === 'yes') { score += query.browserSide ? 12 : 5; reasons.push('CORS supported'); }
        else if (query.browserSide) { score -= entry.cors === 'no' ? 25 : 8; warnings.push(entry.cors === 'no' ? 'CORS unavailable for browser calls' : 'CORS support unknown'); }
        if (entry.pricing === 'FREE') { score += 9; reasons.push('Catalog describes a free offering'); }
        else if (entry.pricing === 'FREEMIUM') { score += 5; reasons.push('Free tier is described'); }
        else if (entry.pricing === 'UNKNOWN') warnings.push('Pricing is unknown');
        if (entry.reputable) { score += 5; reasons.push('Known provider or public institution'); }
        if (entry.responseFormat === 'json') score += 3;
        if (entry.integrationProfileId) { score += 8; reasons.push('Maintained integration profile available'); }
        if (entry.health === 'HEALTHY') { score += 15; reasons.push('Recent validation succeeded'); }
        if (entry.health === 'DEGRADED') { score -= 20; warnings.push('Recent validation was degraded'); }
        if (entry.health === 'UNAVAILABLE') { score -= 70; warnings.push('Recent validation failed'); }
        if (entry.health === 'UNKNOWN' && entry.lastCheckedAt) warnings.push('Validation was inconclusive in the current network environment');
        if (!entry.lastCheckedAt) warnings.push('Endpoint health has not been checked recently');
        return { ...entry, score: Math.max(0, Math.min(100, score)), reasons, warnings };
    }
}
