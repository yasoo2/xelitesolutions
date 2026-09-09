export type ApiAuth = 'none' | 'apiKey' | 'oauth' | 'unknown';
export type CorsSupport = 'yes' | 'no' | 'unknown';
export type ApiPricing = 'FREE' | 'FREEMIUM' | 'PAID' | 'UNKNOWN';
export type ApiHealth = 'HEALTHY' | 'UNKNOWN' | 'DEGRADED' | 'UNAVAILABLE';

export interface PublicApiRecord {
    id: string;
    name: string;
    description: string;
    category: string;
    auth: ApiAuth;
    https: boolean;
    cors: CorsSupport;
    docsUrl: string;
    source: string;
    capabilities: string[];
    pricing: ApiPricing;
    rateLimit?: string;
    responseFormat?: string;
    reputable?: boolean;
    lastCheckedAt?: string;
    health?: ApiHealth;
    healthDetail?: string;
    /** Locally assigned profile. Catalog input can never set this field. */
    integrationProfileId?: string;
}

export interface ApiSelectionArtifact {
    version: 1;
    apiId: string;
    integrationProfileId: string;
    providerName: string;
    source: string;
    auth: ApiAuth;
    cors: CorsSupport;
    pricing: ApiPricing;
    health: ApiHealth;
    reasons: string[];
    warnings: string[];
    requiredEnvNames: string[];
}

export interface ApiSearchQuery {
    query: string;
    category?: string;
    keywords?: string[];
    requiresNoAuth?: boolean;
    requiresHttps?: boolean;
    requiresCors?: boolean;
    provider?: string;
    browserSide?: boolean;
    limit?: number;
}

export interface RankedApiCandidate extends PublicApiRecord {
    score: number;
    reasons: string[];
    warnings: string[];
}

export interface CatalogLoadResult {
    entries: PublicApiRecord[];
    source: string;
    fetchedAt: string;
    stale?: boolean;
    warning?: string;
}

export interface ApiCatalogProvider {
    readonly id: string;
    load(options?: { refresh?: boolean }): Promise<CatalogLoadResult>;
}
