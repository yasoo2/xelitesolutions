import fs from 'fs';
import path from 'path';
import axios from 'axios';
import type { ApiAuth, ApiCatalogProvider, ApiPricing, CatalogLoadResult, CorsSupport, PublicApiRecord } from './types';

export const PUBLIC_APIS_README = 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md';
const SOURCE = 'public-apis/public-apis';

const BOOTSTRAP: PublicApiRecord[] = [
    { id: 'public-apis:open-meteo', name: 'Open-Meteo', description: 'Global weather forecast API with non-commercial open access and commercial plans', category: 'Weather', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://open-meteo.com/en/docs', baseUrl: 'https://api.open-meteo.com/v1', source: SOURCE, capabilities: ['weather', 'forecast', 'temperature', 'geocoding'], pricing: 'FREEMIUM', responseFormat: 'json', reputable: true, health: 'UNKNOWN' },
    { id: 'public-apis:frankfurter', name: 'Frankfurter', description: 'Exchange rates, currency conversion and time series', category: 'Currency Exchange', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://www.frankfurter.app/docs', baseUrl: 'https://api.frankfurter.app', source: SOURCE, capabilities: ['currency', 'exchange rates', 'conversion', 'forex'], pricing: 'UNKNOWN', responseFormat: 'json', reputable: true, health: 'UNKNOWN' },
    { id: 'public-apis:ipapi-co', name: 'ipapi.co', description: 'IP address location information', category: 'Geocoding', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://ipapi.co/api/#introduction', baseUrl: 'https://ipapi.co', source: SOURCE, capabilities: ['ip', 'ip information', 'geolocation', 'country'], pricing: 'UNKNOWN', responseFormat: 'json', health: 'UNKNOWN' },
    { id: 'public-apis:rest-countries', name: 'REST Countries', description: 'Country names, codes, currencies, languages and flags', category: 'Open Data', auth: 'none', https: true, cors: 'yes', docsUrl: 'https://restcountries.com/', source: SOURCE, capabilities: ['country', 'countries', 'currency', 'language', 'flag'], pricing: 'UNKNOWN', responseFormat: 'json', reputable: true, health: 'UNKNOWN' },
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const authOf = (value: string): ApiAuth => /^no$/i.test(value.trim()) ? 'none' : /oauth/i.test(value) ? 'oauth' : /key|token/i.test(value) ? 'apiKey' : 'unknown';
const corsOf = (value: string): CorsSupport => /^yes$/i.test(value.trim()) ? 'yes' : /^no$/i.test(value.trim()) ? 'no' : 'unknown';
const pricingOf = (description: string): ApiPricing => /free\s+tier|free\s+plan/i.test(description) ? 'FREEMIUM' : /(?:completely|entirely)\s+free|free\s+for\s+(?:commercial|all)\s+use/i.test(description) ? 'FREE' : 'UNKNOWN';
const capabilitiesOf = (name: string, description: string, category: string) => [...new Set(`${name} ${description} ${category}`.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2))].slice(0, 24);

export function parsePublicApisReadme(markdown: string): PublicApiRecord[] {
    const entries: PublicApiRecord[] = [];
    let category = '';
    for (const raw of String(markdown || '').split(/\r?\n/)) {
        const heading = raw.match(/^###\s+(.+?)\s*$/);
        if (heading) { category = heading[1].replace(/<.*?>/g, '').trim(); continue; }
        const cells = raw.split('|').slice(1, -1).map(cell => cell.trim());
        if (!category || cells.length < 5 || /^:?-{3}/.test(cells[0]) || /^API$/i.test(cells[0])) continue;
        const link = cells[0].match(/^\[([^\]]+)]\((https?:\/\/[^)\s]+)[^)]*\)/i);
        if (!link) continue;
        const name = link[1].trim();
        const docsUrl = link[2].trim();
        const description = cells[1].replace(/`/g, '').trim();
        const auth = authOf(cells[2].replace(/`/g, ''));
        const https = /^yes$/i.test(cells[3]);
        const cors = corsOf(cells[4]);
        entries.push({ id: `${SOURCE}:${slug(category)}:${slug(name)}`, name, description, category, auth, https, cors, docsUrl, source: SOURCE, capabilities: capabilitiesOf(name, description, category), pricing: pricingOf(description), health: 'UNKNOWN' });
    }
    return entries;
}

export class PublicApisCatalogProvider implements ApiCatalogProvider {
    readonly id = SOURCE;
    private readonly cacheFile: string;
    constructor(cacheDir = path.join(process.cwd(), 'data', 'cache', 'api-catalogs')) {
        this.cacheFile = path.join(cacheDir, 'public-apis.json');
    }

    async load(options?: { refresh?: boolean }): Promise<CatalogLoadResult> {
        if (!options?.refresh) {
            try {
                const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                if (Array.isArray(cached.entries) && cached.entries.length) return { ...cached, stale: true };
            } catch { /* bootstrap remains available */ }
        }
        if (options?.refresh) {
            try {
                // The source is fixed by Joe, and redirects are disabled so an
                // upstream catalog cannot turn refresh into an SSRF redirect.
                const response = await axios.get(PUBLIC_APIS_README, { timeout: 8_000, maxRedirects: 0, maxContentLength: 2_500_000, maxBodyLength: 2_500_000, responseType: 'text' });
                const entries = parsePublicApisReadme(String(response.data || ''));
                if (entries.length < 100) throw new Error(`catalog_too_small:${entries.length}`);
                const result = { entries, source: this.id, fetchedAt: new Date().toISOString() };
                fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
                const tmp = `${this.cacheFile}.${process.pid}.tmp`;
                fs.writeFileSync(tmp, JSON.stringify(result), 'utf8');
                fs.renameSync(tmp, this.cacheFile);
                return result;
            } catch (error: any) {
                return { entries: this.readCacheOrBootstrap(), source: this.id, fetchedAt: new Date().toISOString(), stale: true, warning: `catalog_refresh_failed:${String(error?.message || error).slice(0, 120)}` };
            }
        }
        return { entries: this.readCacheOrBootstrap(), source: this.id, fetchedAt: new Date().toISOString(), stale: true, warning: 'using_vetted_bootstrap_until_catalog_refresh' };
    }

    private readCacheOrBootstrap(): PublicApiRecord[] {
        try {
            const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            if (Array.isArray(cached.entries) && cached.entries.length) return cached.entries;
        } catch { /* use small vetted bootstrap */ }
        return BOOTSTRAP.map(entry => ({ ...entry, capabilities: [...entry.capabilities] }));
    }
}
