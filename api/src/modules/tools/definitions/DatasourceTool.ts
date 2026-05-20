import { ToolDefinition } from '../types';

/**
 * DatasourceTool — Unified authoritative data API client.
 *
 * Provides quick, structured access to common free APIs (weather, exchange
 * rates, IP geolocation, etc.) without requiring the agent to write raw
 * HTTP fetch code each time.
 *
 * Inspired by the Manus `ApiClient` pattern.
 */
export class DatasourceTool implements ToolDefinition {
    name = 'query_datasource';
    description =
        'Query authoritative data sources using a unified interface. ' +
        'Supports weather, exchange rates, IP geolocation, random facts, and more. ' +
        'Use this instead of writing raw HTTP fetch code for common data needs. ' +
        'Returns structured JSON data.';
    version = '1.0.0';
    tags = ['data', 'api', 'weather', 'exchange', 'geolocation', 'datasource'];
    permissions: any = ['internet'];
    sideEffects: any = [];
    rateLimitPerMinute = 20;
    auditFields = ['source', 'query'];
    mockSupported = false;
    outputSchema = {
        type: 'object',
        properties: {
            data: { type: 'object', description: 'The structured result from the API' },
            source: { type: 'string', description: 'The datasource that was queried' },
        },
    };
    inputSchema = {
        type: 'object',
        properties: {
            source: {
                type: 'string',
                enum: [
                    'weather',
                    'exchange_rate',
                    'ip_geolocation',
                    'random_fact',
                    'country_info',
                    'github_user',
                    'npm_package',
                    'dns_lookup',
                ],
                description: 'The data source to query.',
            },
            query: {
                type: 'object',
                description:
                    'Query parameters. Depends on the source:\n' +
                    '- weather: { location: "city name" }\n' +
                    '- exchange_rate: { from: "USD", to: "EUR" }\n' +
                    '- ip_geolocation: { ip: "8.8.8.8" } (empty for own IP)\n' +
                    '- random_fact: {} (no params needed)\n' +
                    '- country_info: { name: "Japan" }\n' +
                    '- github_user: { username: "torvalds" }\n' +
                    '- npm_package: { name: "express" }\n' +
                    '- dns_lookup: { domain: "google.com" }',
            },
        },
        required: ['source'],
    };

    async execute(input: any) {
        const source = String(input.source || '').toLowerCase();
        const query = input.query || {};
        const logs: string[] = [];

        try {
            let data: any;

            switch (source) {
                case 'weather': {
                    const location = encodeURIComponent(query.location || 'London');
                    const res = await fetch(`https://wttr.in/${location}?format=j1`);
                    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
                    const raw = await res.json();
                    const current = raw.current_condition?.[0] || {};
                    data = {
                        location: query.location,
                        temperature_c: current.temp_C,
                        temperature_f: current.temp_F,
                        humidity: current.humidity,
                        description: current.weatherDesc?.[0]?.value,
                        wind_speed_kmh: current.windspeedKmph,
                        feels_like_c: current.FeelsLikeC,
                    };
                    logs.push(`Weather data fetched for ${query.location}`);
                    break;
                }

                case 'exchange_rate': {
                    const from = (query.from || 'USD').toUpperCase();
                    const to = (query.to || 'EUR').toUpperCase();
                    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
                    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
                    const raw = await res.json();
                    data = {
                        from,
                        to,
                        rate: raw.rates?.[to],
                        timestamp: raw.time_last_update_utc,
                        all_rates: undefined, // Don't return all rates to save tokens
                    };
                    if (!data.rate) data.error = `Currency ${to} not found`;
                    logs.push(`Exchange rate: 1 ${from} = ${data.rate} ${to}`);
                    break;
                }

                case 'ip_geolocation': {
                    const ip = query.ip || '';
                    const url = ip
                        ? `http://ip-api.com/json/${ip}`
                        : `http://ip-api.com/json/`;
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`IP API error: ${res.status}`);
                    data = await res.json();
                    logs.push(`IP geolocation: ${data.query} -> ${data.city}, ${data.country}`);
                    break;
                }

                case 'random_fact': {
                    const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random');
                    if (!res.ok) throw new Error(`Facts API error: ${res.status}`);
                    data = await res.json();
                    logs.push(`Random fact fetched`);
                    break;
                }

                case 'country_info': {
                    const name = encodeURIComponent(query.name || 'Japan');
                    const res = await fetch(`https://restcountries.com/v3.1/name/${name}`);
                    if (!res.ok) throw new Error(`Country API error: ${res.status}`);
                    const raw = await res.json();
                    const c = raw[0] || {};
                    data = {
                        name: c.name?.common,
                        official_name: c.name?.official,
                        capital: c.capital,
                        population: c.population,
                        region: c.region,
                        subregion: c.subregion,
                        languages: c.languages,
                        currencies: c.currencies,
                        flag: c.flag,
                    };
                    logs.push(`Country info fetched for ${query.name}`);
                    break;
                }

                case 'github_user': {
                    const username = encodeURIComponent(query.username || '');
                    if (!username) throw new Error('username required');
                    const res = await fetch(`https://api.github.com/users/${username}`);
                    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
                    const raw = await res.json();
                    data = {
                        login: raw.login,
                        name: raw.name,
                        bio: raw.bio,
                        public_repos: raw.public_repos,
                        followers: raw.followers,
                        following: raw.following,
                        created_at: raw.created_at,
                        html_url: raw.html_url,
                    };
                    logs.push(`GitHub user fetched: ${raw.login}`);
                    break;
                }

                case 'npm_package': {
                    const pkg = encodeURIComponent(query.name || '');
                    if (!pkg) throw new Error('package name required');
                    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
                    if (!res.ok) throw new Error(`npm API error: ${res.status}`);
                    const raw = await res.json();
                    data = {
                        name: raw.name,
                        version: raw.version,
                        description: raw.description,
                        license: raw.license,
                        homepage: raw.homepage,
                        dependencies: Object.keys(raw.dependencies || {}),
                    };
                    logs.push(`npm package fetched: ${raw.name}@${raw.version}`);
                    break;
                }

                case 'dns_lookup': {
                    const domain = encodeURIComponent(query.domain || '');
                    if (!domain) throw new Error('domain required');
                    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
                    if (!res.ok) throw new Error(`DNS API error: ${res.status}`);
                    data = await res.json();
                    logs.push(`DNS lookup for ${query.domain}`);
                    break;
                }

                default:
                    return {
                        ok: false,
                        error: `Unknown datasource: "${source}". Available: weather, exchange_rate, ip_geolocation, random_fact, country_info, github_user, npm_package, dns_lookup`,
                        logs: [`Unknown source: ${source}`],
                    };
            }

            return {
                ok: true,
                output: { data, source },
                logs,
            };
        } catch (error: any) {
            return {
                ok: false,
                error: `Datasource query failed: ${error.message}`,
                logs: [`Error querying ${source}: ${error.message}`],
            };
        }
    }
}
