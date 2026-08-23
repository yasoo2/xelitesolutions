/**
 * THE SERVER STORES WHAT THE APP SENDS — THE WHOLE ROW, NOT ITS NAME.
 *
 * «اريد نظام حقيقي وليس فقط شغل كلام … اريد بلدر فتاكاً يبني اي شيء».
 *
 * Every generated backend stored name/details/price, whatever the system was
 * about. A clinic's React app posts {name, phone, service, date, time, status}
 * and the database kept `name`: five of six fields dropped on the floor,
 * silently, on every single save. The two halves of the "full stack" agreed on
 * the resource's NAME and on nothing else.
 *
 * The columns now come from the same blueprint the interface renders from.
 */
import { apiColumnsForRequest, apiPrimaryColumnsForApp, CATALOGUE_COLUMNS, selectApiPrimary } from '../modules/tools/definitions/ApiProjectTool';
import { blueprintFor, detectAppKind, APP_KIND_SIGNALS, maskNegatedSpans, requestedFeatures, uncoveredFeatures } from '../core/design/app-blueprints';
import { extractRunReceiptEvidence } from '../modules/services/AgentLoopService';
import { designDataModel } from '../core/design/schema-designer';
import { fileFinanceAppJsx } from '../modules/tools/definitions/react-app-templates';
import { transform } from 'esbuild';

describe('the schema follows the app, not a fixed guess', () => {
    const PROMPT_01 = 'Build a polished React project called SpendWise, a personal expense tracker for one user. Create a responsive dashboard with a clear title, a form to add an expense with description, category, amount, and date, validation that rejects empty descriptions and non-positive amounts, a list of saved expenses with edit and delete actions, category filtering, text search, a running total that updates from the actual rows, and a CSV export button. Keep the data durable across reloads with localStorage. Use a clean light theme with accessible contrast and helpful empty, loading, and error states. Run the real production build and open the live preview. Do not modify existing projects.';

    it('Prompt 01 keeps the recognized expenses resource and its five blueprint columns', () => {
        expect(detectAppKind(PROMPT_01)).toBe('expenses');
        expect(apiColumnsForRequest(PROMPT_01).map(column => column.key))
            .toEqual(['title', 'amount', 'category', 'date', 'note']);
    });

    it('generic multi-table promotion follows an explicit user list, not inferred count', () => {
        const request = 'Build a generic management system. Tables: projects, tasks';
        const designed = [
            { key: 'projects', ar: 'projects', fields: [] },
            { key: 'tasks', ar: 'tasks', fields: [] },
        ];
        const selected = selectApiPrimary('generic', { resource: 'items', labelAr: 'items', generic: true }, designed, request);
        expect(selected.resource).toBe('projects');
        expect(selected.promoted?.key).toBe('projects');
    });

    it('generic prose names alone do not authorize primary promotion', () => {
        const request = 'Build a generic management system for projects, tasks and activity logs.';
        const designed = [
            { key: 'projects', ar: 'projects', fields: [] },
            { key: 'tasks', ar: 'tasks', fields: [] },
            { key: 'activity_logs', ar: 'activity logs', fields: [] },
        ];
        const selected = selectApiPrimary('generic', { resource: 'items', labelAr: 'items', generic: true }, designed, request);
        expect(selected.promoted).toBeNull();
        expect(selected.resource).toBe('items');
    });

    it('generic inference without a declaration cannot promote an absent key', () => {
        const designed = [
            { key: 'calleds', ar: 'calleds', fields: [] },
            { key: 'spends', ar: 'spends', fields: [] },
            { key: 'wises', ar: 'wises', fields: [] },
        ];
        const selected = selectApiPrimary('generic', { resource: 'items', labelAr: 'items', generic: true }, designed, PROMPT_01);
        expect(selected.promoted).toBeNull();
        expect(selected.resource).toBe('items');
    });

    it('a known non-generic blueprint cannot be displaced by an inferred entity', () => {
        const selected = selectApiPrimary('expenses', { resource: 'expenses', labelAr: 'expenses' }, [
            { key: 'calleds', ar: 'calleds', fields: [] },
        ], PROMPT_01);
        expect(selected.promoted).toBeNull();
        expect(selected.resource).toBe('expenses');
    });

    it('different declared expense options change blueprint bytes while silent requests stay stable', () => {
        const food = JSON.stringify(blueprintFor('expenses', 'Build an expense tracker with categories: Food, Transit, Rent', true));
        const business = JSON.stringify(blueprintFor('expenses', 'Build an expense tracker with categories: Payroll, Tax, Utilities', true));
        expect(food).not.toBe(business);
        const silent = JSON.stringify(blueprintFor('expenses', 'Build a personal expense tracker', true));
        expect(silent).toBe(JSON.stringify(blueprintFor('expenses', 'Build a personal expense tracker', true)));
    });

    it('a clinic booking system stores date, time and status', () => {
        const cols = apiColumnsForRequest('نظام حجز مواعيد لعيادة أسنان مع قاعدة بيانات');
        const keys = cols.map(c => c.key);
        expect(keys).toEqual(expect.arrayContaining(['name', 'phone', 'service', 'date', 'time', 'status']));
        expect(cols.find(c => c.key === 'name')!.required).toBe(true);
    });

    it('an expense tracker stores its amount as a NUMBER', () => {
        const cols = apiColumnsForRequest('تطبيق لتتبّع المصاريف الشخصية');
        const amount = cols.find(c => c.type === 'REAL');
        expect(amount).toBeTruthy();
    });

    it('a complete finance request gets income, expense and budget resources', async () => {
        const model = await designDataModel(`Build a complete personal finance app called MoneyTrack. Track income and expenses, create budgets by category, show dashboard charts and monthly totals.`);
        expect(model.map(entity => entity.key)).toEqual(['incomes', 'expenses', 'budgets']);
        expect(model.find(entity => entity.key === 'incomes')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['source', 'amount', 'category', 'date', 'description']));
        expect(model.find(entity => entity.key === 'expenses')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['description', 'amount', 'category', 'date']));
        expect(model.find(entity => entity.key === 'budgets')!.fields.map(field => field.key))
            .toEqual(expect.arrayContaining(['category', 'limit_amount', 'period']));
        expect(model.find(entity => entity.key === 'incomes')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'expenses')!.fields.find(field => field.key === 'amount')!.type).toBe('REAL');
        expect(model.find(entity => entity.key === 'budgets')!.fields.find(field => field.key === 'limit_amount')!.type).toBe('REAL');
    });

    it('the finance primary API table uses the designed income contract, not catalogue columns', async () => {
        const request = 'Build a complete personal finance app called MoneyTrack. Track income and expenses, create budgets by category, show dashboard charts and monthly totals.';
        const model = await designDataModel(request);
        const columns = apiPrimaryColumnsForApp('finance', 'incomes', model);
        expect(columns.map(column => column.key)).toEqual(['source', 'amount', 'category', 'date', 'description']);
        expect(columns.find(column => column.key === 'amount')!.type).toBe('REAL');
        expect(columns.map(column => column.key)).not.toEqual(expect.arrayContaining(['name', 'details', 'price']));
        expect(apiPrimaryColumnsForApp('finance', 'missing', model)).toEqual([]);
    });

    it('FinanceApp emits a closed JSX expression for the editor heading', () => {
        const jsx = fileFinanceAppJsx(false);
        expect(jsx).toContain("<h2>{editing ? 'Edit entry' : 'New entry'}</h2>");
        expect(jsx).not.toContain("'New entry'</h2>");
        expect(jsx).not.toContain("</h2>}");
        expect(jsx).toContain('Date filtering');
        expect(jsx).toContain('Spending by category');
        expect(jsx).toContain('Budget progress');
        expect(jsx).toContain('Category management');
        expect(jsx).toContain('const formatMoney =');
        expect(jsx).toContain('const filteredBalance =');
        expect(jsx).toContain('const budgetSpent =');
        expect(jsx).toContain('const budgetPercent =');
        expect(jsx).toContain('Intl.NumberFormat');
        expect(jsx).toContain("input('description'");
    });

    it('the generated FinanceApp is valid JSX', async () => {
        const result = await transform(fileFinanceAppJsx(false), { loader: 'jsx', jsx: 'automatic', format: 'esm' });
        expect(result.code).toContain('function FinanceApp');
    });

    it('049 uses the exported signal registry and masks negated domain spans', () => {
        expect(APP_KIND_SIGNALS.find(([kind]) => kind === 'weather')?.[1].test('open-meteo forecast')).toBe(true);
        expect(detectAppKind('Build a records dashboard, not a weather app, with search and CSV export')).toBe('generic');
        expect(detectAppKind('Build a live open-meteo weather forecast app')).toBe('weather');
        expect(maskNegatedSpans('Build an app, not a weather dashboard')).not.toMatch(/weather/i);
    });

    it('049b detects the full canonical WeatherGo prompt by score, not first keyword', () => {
        const fullPrompt = 'Build a production-ready React + TypeScript + Vite application called WeatherGo, not a brochure or static mockup. Create a polished responsive mobile-first weather experience with live data from the Open-Meteo geocoding and forecast APIs, requiring no API key or account. Include a visible city search field with a Search button and Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states. Add a working Use my current location action using browser geolocation. For the selected city show current temperature, feels-like temperature, humidity, wind speed, weather condition and a meaningful weather icon. Request and render a real seven-day daily forecast, including sunrise and sunset values from the daily API response, and keep daily data distinct from current data. Add saved/favorite cities with no duplicates, persist favorites and settings in namespaced localStorage, and restore them after a full reload. Add Celsius/Fahrenheit and 12/24-hour display settings, plus a user-controlled light/dark mode. Make the interface accessible, visually coherent, responsive on mobile and desktop, and use smooth but restrained transitions. Do not use fake API responses, random placeholder images, TODOs, unexplained claims, or packages absent from package.json. Keep the existing Joe app shell contract and build the actual app from this request. After implementation, run the real build and quality checks, open the live result in the browser, exercise search, Enter, empty input, invalid city, current location handling, unit/theme/settings persistence, and verify the delivered app honestly reports any remaining limitation.';
        expect(fullPrompt.length).toBe(1697);
        expect(detectAppKind(fullPrompt)).toBe('weather');
    });

    it('050 does not parse a long WeatherGo prose clause as a feature list', () => {
        const canonical = 'Build a production-ready React + TypeScript + Vite application called WeatherGo, not a brochure or static mockup. Create a polished responsive mobile-first weather experience with live data from the Open-Meteo geocoding and forecast APIs, requiring no API key or account. Include a visible city search field with a Search button and Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states. Add a working Use my current location action using browser geolocation. For the selected city show current temperature, feels-like temperature, humidity, wind speed, weather condition and a meaningful weather icon. Request and render a real seven-day daily forecast, including sunrise and sunset values from the daily API response, and keep daily data distinct from current data. Add saved/favorite cities with no duplicates, persist favorites and settings in namespaced localStorage, and restore them after a full reload. Add Celsius/Fahrenheit and 12/24-hour display settings, plus a user-controlled light/dark mode. Make the interface accessible, visually coherent, responsive on mobile and desktop, and use smooth but restrained transitions. Do not use fake API responses, random placeholder images, TODOs, unexplained claims, or packages absent from package.json. Keep the existing Joe app shell contract and build the actual app from this request. After implementation, run the real build and quality checks, open the live result in the browser, exercise search, Enter, empty input, invalid city, current location handling, unit/theme/settings persistence, and verify the delivered app honestly reports any remaining limitation.';
        const extracted = requestedFeatures(canonical);
        expect(extracted).toEqual([]);
        expect(extracted).not.toContain('live data from the Open-Meteo geocoding');
        expect(extracted).not.toContain('forecast APIs');
        expect(extracted).not.toContain('requiring no API key or account');
    });

    it('050 checks canonical weather rules against full source evidence', () => {
        const canonical = 'Build a production-ready React + TypeScript + Vite application called WeatherGo, not a brochure or static mockup. Create a polished responsive mobile-first weather experience with live data from the Open-Meteo geocoding and forecast APIs, requiring no API key or account. Include a visible city search field with a Search button and Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states. Add a working Use my current location action using browser geolocation. For the selected city show current temperature, feels-like temperature, humidity, wind speed, weather condition and a meaningful weather icon. Request and render a real seven-day daily forecast, including sunrise and sunset values from the daily API response, and keep daily data distinct from current data. Add saved/favorite cities with no duplicates, persist favorites and settings in namespaced localStorage, and restore them after a full reload. Add Celsius/Fahrenheit and 12/24-hour display settings, plus a user-controlled light/dark mode. Make the interface accessible, visually coherent, responsive on mobile and desktop, and use smooth but restrained transitions. Do not use fake API responses, random placeholder images, TODOs, unexplained claims, or packages absent from package.json. Keep the existing Joe app shell contract and build the actual app from this request. After implementation, run the real build and quality checks, open the live result in the browser, exercise search, Enter, empty input, invalid city, current location handling, unit/theme/settings persistence, and verify the delivered app honestly reports any remaining limitation.';
        const evidence = '<form><input onKeyDown onSubmit /> geocoding-api.open-meteo navigator.geolocation currentTemperature temperature_2m relative_humidity_2m apparent_temperature wind_speed weather_code sunrise sunset isLoading catch invalid error daily: [\'sunrise\', \'sunset\'] forecastDays favoriteCities localStorage persist restore trim() celsius fahrenheit 12 24 timeFormat dark @media weather-icon transition';
        expect(uncoveredFeatures(canonical, 'weather', false, evidence)).toEqual([]);
    });

    it('050 keeps real weather gaps named when source evidence is empty', () => {
        const canonical = 'Build a production-ready React + TypeScript + Vite application called WeatherGo, not a brochure or static mockup. Create a polished responsive mobile-first weather experience with live data from the Open-Meteo geocoding and forecast APIs, requiring no API key or account. Include a visible city search field with a Search button and Enter-key submission, reject empty input, show loading state, and show clear invalid-city, network-failure, and API-error states. Add a working Use my current location action using browser geolocation. For the selected city show current temperature, feels-like temperature, humidity, wind speed, weather condition and a meaningful weather icon. Request and render a real seven-day daily forecast, including sunrise and sunset values from the daily API response, and keep daily data distinct from current data. Add saved/favorite cities with no duplicates, persist favorites and settings in namespaced localStorage, and restore them after a full reload. Add Celsius/Fahrenheit and 12/24-hour display settings, plus a user-controlled light/dark mode. Make the interface accessible, visually coherent, responsive on mobile and desktop, and use smooth but restrained transitions. Do not use fake API responses, random placeholder images, TODOs, unexplained claims, or packages absent from package.json. Keep the existing Joe app shell contract and build the actual app from this request. After implementation, run the real build and quality checks, open the live result in the browser, exercise search, Enter, empty input, invalid city, current location handling, unit/theme/settings persistence, and verify the delivered app honestly reports any remaining limitation.';
        const gaps = uncoveredFeatures(canonical, 'weather', false, '');
        expect(gaps.length).toBeGreaterThan(0);
        expect(gaps.every(gap => gap.length <= 80)).toBe(true);
        expect(gaps).not.toContain('live data from the Open-Meteo geocoding');
        expect(gaps).not.toContain('forecast APIs');
        expect(gaps).not.toContain('requiring no API key or account');
        expect(gaps).toEqual(expect.arrayContaining(['current location', 'feels-like', 'wind speed', 'sunrise', 'sunset']));
    });

    it('050 preserves the short one-line with-list form', () => {
        expect(requestedFeatures('Build a social app with posts, stories and ads')).toEqual(['posts', 'stories', 'ads']);
    });

    it('049b keeps a weather request with geolocation in the weather engine', () => {
        expect(detectAppKind('build a weather app that uses geolocation to detect user location')).toBe('weather');
    });

    it('049b keeps navigation requests in the maps engine', () => {
        expect(detectAppKind('build a maps navigation app')).toBe('maps');
    });

    it('049 treats Arabic negation markers as standalone words, not substrings', () => {
        expect(maskNegatedSpans('نظام إدارة علاقات العملاء')).toContain('علاقات');
        expect(maskNegatedSpans('نظام إدارة صلاحيات المستخدمين')).toContain('صلاحيات');
        expect(maskNegatedSpans('نظام إدارة لوحة إعلانات')).toContain('إعلانات');
        expect(detectAppKind('نظام إدارة علاقات العملاء')).toBe('crm');
        expect(detectAppKind('نظام إدارة صلاحيات المستخدمين')).toBe('generic');
        expect(detectAppKind('نظام إدارة لوحة إعلانات')).toBe('generic');
        expect(maskNegatedSpans('لا أريد كتيّباً، ابنِ تطبيقاً حقيقياً')).not.toMatch(/كتيّب/);
        expect(maskNegatedSpans('Build a real app, not a brochure')).not.toMatch(/brochure/i);
        expect(detectAppKind('Build a brochure for my bakery')).toBeNull();
    });

    it('048c extracts structural evidence from nested orchestrator and phase envelopes', () => {
        const receipt = extractRunReceiptEvidence({
            result: {
                steps: [{
                    output: {
                        results: [{
                            phaseName: 'Project Setup',
                            projectRoot: '/tmp/weathergo',
                            projectRootRuntimeBound: true,
                            results: [{ tool: 'ai_write_file', ok: false, error: 'authored files never landed' }],
                            honestBlocker: true,
                            selfFixFailureReason: 'self-fix exhausted',
                        }],
                    },
                }],
            },
        }, 'run-048c', 'session-048c', 'failed');
        expect(receipt.projectRoot).toBe('/tmp/weathergo');
        expect(receipt.taskReceipts).toEqual([{ tool: 'ai_write_file', ok: false, error: 'authored files never landed' }]);
        expect(receipt.selfFixReason).toBe('self-fix exhausted');
        expect(receipt.honestBlocker).toBe(true);
    });

    it('an online store stores price, image, category and stock', () => {
        const keys = apiColumnsForRequest('متجر إلكتروني لبيع العطور مع سلة').map(c => c.key);
        expect(keys).toEqual(expect.arrayContaining(['name', 'price', 'category', 'image', 'stock']));
    });

    it('every column matches the blueprint the FRONTEND renders', () => {
        // This is the whole point: one source of truth for both halves — the
        // blueprint's own fields, plus the link column when the blueprint
        // declares a parent table («طبيب ← مواعيده»).
        const req = 'نظام حجز مواعيد لعيادة';
        const kind = detectAppKind(req)!;
        const bp = blueprintFor(kind, req, true);
        const keys = apiColumnsForRequest(req).map(c => c.key);
        expect(keys).toEqual([...bp.fields.map(f => f.key), bp.relation!.key]);
    });

    it('a presentation site keeps the catalogue shape it really posts', () => {
        // A boutique's page and a restaurant menu are section builders; their
        // frontends genuinely send name/details/price, and changing that would
        // break a chain that works.
        expect(apiColumnsForRequest('موقع لمحل عطور فاخر')).toBe(CATALOGUE_COLUMNS);
        expect(apiColumnsForRequest('')).toBe(CATALOGUE_COLUMNS);
    });

    it('and a column name can never be anything but a safe identifier', () => {
        for (const c of apiColumnsForRequest('نظام إدارة عملاء')) {
            expect(c.key).toMatch(/^[a-zA-Z0-9_]{1,40}$/);
        }
    });
});
