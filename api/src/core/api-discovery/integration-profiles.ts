import type { ApiAuth, ApiPricing, ApiSelectionArtifact, CorsSupport, PublicApiRecord, RankedApiCandidate } from './types';

export type IntegrationCapability = 'weather' | 'currency' | 'ip';
export type IntegrationTransport = 'browser' | 'server-proxy';

export interface ApiIntegrationProfile {
    id: string;
    capability: IntegrationCapability;
    providerName: string;
    catalogNames: string[];
    categoryIncludes: string[];
    auth: ApiAuth;
    cors: CorsSupport;
    pricing: ApiPricing;
    requestBaseUrl: string;
    probeUrl: string;
    transport: IntegrationTransport;
    proxyPath?: string;
    requiredEnvNames: string[];
}

const PROFILES: ApiIntegrationProfile[] = [
    {
        id: 'open-meteo-weather-v1', capability: 'weather', providerName: 'Open-Meteo',
        catalogNames: ['open-meteo'], categoryIncludes: ['weather'], auth: 'none', cors: 'yes', pricing: 'FREEMIUM',
        requestBaseUrl: 'https://api.open-meteo.com/v1',
        probeUrl: 'https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.97&current_weather=true',
        transport: 'browser', requiredEnvNames: [],
    },
    {
        id: 'frankfurter-currency-v2', capability: 'currency', providerName: 'Frankfurter',
        catalogNames: ['frankfurter'], categoryIncludes: ['currency'], auth: 'none', cors: 'yes', pricing: 'UNKNOWN',
        requestBaseUrl: 'https://api.frankfurter.dev',
        probeUrl: 'https://api.frankfurter.dev/v2/rate/EUR/USD',
        transport: 'server-proxy', proxyPath: '/api/joe-external/currency', requiredEnvNames: [],
    },
    {
        id: 'ipapi-co-v1', capability: 'ip', providerName: 'ipapi.co',
        catalogNames: ['ipapi.co'], categoryIncludes: ['geocoding'], auth: 'none', cors: 'yes', pricing: 'UNKNOWN',
        requestBaseUrl: 'https://ipapi.co', probeUrl: 'https://ipapi.co/json/',
        transport: 'browser', requiredEnvNames: [],
    },
    {
        id: 'weatherapi-key-v1', capability: 'weather', providerName: 'WeatherAPI',
        catalogNames: ['weatherapi'], categoryIncludes: ['weather'], auth: 'apiKey', cors: 'unknown', pricing: 'FREEMIUM',
        requestBaseUrl: 'https://api.weatherapi.com/v1',
        probeUrl: 'https://api.weatherapi.com/v1/current.json',
        transport: 'server-proxy', proxyPath: '/api/joe-external/weather', requiredEnvNames: ['WEATHERAPI_KEY'],
    },
];

const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max);
const cleanList = (value: unknown, maxItems = 8) => Array.isArray(value)
    ? value.map(item => clean(item, 180)).filter(Boolean).slice(0, maxItems)
    : [];

export function integrationProfile(profileId: string): ApiIntegrationProfile | undefined {
    return PROFILES.find(profile => profile.id === profileId);
}

export function profileForCatalogRecord(record: Pick<PublicApiRecord, 'name' | 'category' | 'auth'>): ApiIntegrationProfile | undefined {
    const name = clean(record.name).toLowerCase();
    const category = clean(record.category).toLowerCase();
    return PROFILES.find(profile => profile.auth === record.auth
        && profile.catalogNames.includes(name)
        && profile.categoryIncludes.some(part => category.includes(part)));
}

export function selectionArtifact(candidate: RankedApiCandidate): ApiSelectionArtifact | null {
    const profile = candidate.integrationProfileId ? integrationProfile(candidate.integrationProfileId) : undefined;
    if (!profile) return null;
    return {
        version: 1,
        apiId: clean(candidate.id),
        integrationProfileId: profile.id,
        providerName: profile.providerName,
        source: clean(candidate.source),
        auth: profile.auth,
        cors: profile.cors,
        pricing: profile.pricing,
        health: candidate.health || 'UNKNOWN',
        reasons: cleanList(candidate.reasons),
        warnings: cleanList(candidate.warnings),
        requiredEnvNames: [...profile.requiredEnvNames],
    };
}

/** Rebuild the artifact from Joe-maintained data; never trust executable fields from a tool/model payload. */
export function compactApiSelectionArtifact(value: unknown): ApiSelectionArtifact | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (raw.version !== 1) return null;
    const profile = integrationProfile(clean(raw.integrationProfileId));
    const apiId = clean(raw.apiId);
    if (!profile || !apiId) return null;
    return {
        version: 1,
        apiId,
        integrationProfileId: profile.id,
        providerName: profile.providerName,
        source: clean(raw.source),
        auth: profile.auth,
        cors: profile.cors,
        pricing: profile.pricing,
        health: ['HEALTHY', 'UNKNOWN', 'DEGRADED', 'UNAVAILABLE'].includes(String(raw.health)) ? raw.health as any : 'UNKNOWN',
        reasons: cleanList(raw.reasons),
        warnings: cleanList(raw.warnings),
        requiredEnvNames: [...profile.requiredEnvNames],
    };
}
