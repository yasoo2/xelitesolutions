/**
 * EVERY FILE THE APP BUILDER WRITES MUST PARSE.
 *
 * The API scaffold has had a syntax gate since it shipped; the React scaffold
 * had none, and it cost two builds in one session. Both times the cause was
 * identical: a regex literal written inside a generated template, where the
 * backslashes belong to the OUTER string and vanish —
 *
 *     .replace(/\/api\/[^/]*$/, …)   becomes   .replace(//api/[^/]*$/, …)
 *
 * vite refused the bundle, and the failure surfaced three layers away as «the
 * app did not compile». This gate puts the failure where the mistake is.
 */
import { buildAppFiles, guardRequiredInput } from '../modules/tools/definitions/react-app-templates';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';
import { blueprintFor, uncoveredFeatures, type AppKind } from '../core/design/app-blueprints';
import { normalizeReactScaffoldStructure } from '../modules/tools/definitions/SystemTools';
import { undefinedJsxComponentMismatch } from '../core/quality/source-contract';
import { unparenthesizedLogicalTernaryError } from '../modules/tools/definitions/AIGeneratorTool';
import { capabilityEvidenceNotice, repairCapabilityGapsOnce } from '../modules/tools/definitions/ReactProjectTool';

const KINDS: AppKind[] = ['store', 'booking', 'tasks', 'social', 'chat', 'maps', 'weather', 'crm', 'inventory', 'calculator', 'productivity'];

const filesFor = (kind: AppKind, isArabic: boolean) => buildAppFiles(
    blueprintFor(kind, 'اختبار', isArabic),
    { isArabic, brand: 'Joe', storeKey: 'k', api: 'http://localhost:4100/api/items' } as any,
    'app',
);

describe('the generated application is syntactically real', () => {
    it.each(KINDS)('%s: every file parses, in both languages', (kind) => {
        for (const isArabic of [true, false]) {
            for (const [rel, body] of Object.entries(filesFor(kind, isArabic))) {
                const gate = syntaxOk(rel, body);
                const tag = `${kind}/${isArabic ? 'ar' : 'en'}/${rel}`;
                expect(`${tag}: ${gate.ok ? 'ok' : gate.error}`).toBe(`${tag}: ok`);
            }
        }
    });

    it('every generated JSX file renders only imported or locally declared components', () => {
        for (const kind of KINDS) {
            for (const [rel, body] of Object.entries(filesFor(kind, false))) {
                if (/\.(?:jsx|tsx)$/i.test(rel)) {
                    expect(undefinedJsxComponentMismatch(rel, body)).toBeNull();
                }
            }
        }
    });

    it('rejects a syntactically valid shell that renders an undefined component', () => {
        const source = "import React from 'react'; export default function App(){ return <WishlistApp />; }";
        expect(syntaxOk('src/App.jsx', source).ok).toBe(false);
        expect(undefinedJsxComponentMismatch('src/App.jsx', source)).toMatch(/WishlistApp/);
    });

    it('accepts valid TSX with generic type arguments and declared/global types', () => {
        const source = `
import React, { createContext, useState, useRef } from 'react';
interface WeatherContextType { city: string }
type WeatherData = { temp: number };
type WeatherProviderProps = { children: React.ReactNode };
const Ctx = createContext<WeatherContextType | undefined>(undefined);
const WeatherProvider: React.FC<WeatherProviderProps> = ({ children }) => {
    const [data, setData] = useState<WeatherData | null>(null);
    const pos = useRef<GeolocationPosition | null>(null);
    return <Ctx.Provider value={{ city: '' }}>{children}</Ctx.Provider>;
}`;
        expect(undefinedJsxComponentMismatch('src/context/WeatherContext.tsx', source)).toBeNull();
    });

    it('still rejects an unknown JSX component immediately after a JSX boundary', () => {
        const source = "function Shell() {\n    return <section><MysteryPanel /></section>;\n}";
        expect(undefinedJsxComponentMismatch('src/Shell.jsx', source)).toMatch(/MysteryPanel/);
    });

    it('request-driven domain generation never receives the stock WeatherApp file', () => {
        const generated = buildAppFiles(
            blueprintFor('weather', 'WeatherGo', false),
            {
                isArabic: false,
                brand: 'WeatherGo',
                storeKey: 'weathergo',
                generatedEnginePath: 'src/components/WeatherApp.jsx',
            } as any,
            'weathergo',
        );
        expect(generated['src/components/WeatherApp.jsx']).toBeUndefined();
        expect(generated['src/App.jsx']).toContain("import WeatherApp from './components/WeatherApp.jsx'");
    });

    it('every generated React app declares a real build/test contract and smoke test', () => {
        for (const kind of KINDS) {
            const files = filesFor(kind, false);
            const manifest = JSON.parse(files['package.json']);
            expect(manifest.scripts).toMatchObject({
                build: 'vite build',
                test: 'node --test scripts/smoke-test.test.mjs',
            });
            expect(files['scripts/smoke-test.test.mjs']).toContain("from 'node:test'");
            expect(files['scripts/smoke-test.test.mjs']).toContain("assert.equal(manifest.scripts.test, 'node --test scripts/smoke-test.test.mjs')");
        }
    });

    it('normalizes a proven React/Vite scaffold with a missing root index.html', () => {
        const result = normalizeReactScaffoldStructure({
            'package.json': JSON.stringify({
                scripts: { dev: 'vite', build: 'vite build' },
                dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                devDependencies: { vite: '^5.0.0' },
            }),
            'src/main.jsx': "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);",
            'src/App.jsx': "import React from 'react'; export default function App() { return <main>WeatherGo</main>; }",
        });
        expect(result.changed).toBe(true);
        expect(result.structure['index.html']).toContain('<div id="root"></div>');
        expect(result.structure['index.html']).toContain('src="./src/main.jsx"');
        expect(result.structure['index.html']).toContain('<script type="module"');
    });

    it('does not invent a Vite entrypoint for a generic scaffold', () => {
        const result = normalizeReactScaffoldStructure({
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' } }),
            'server.js': 'console.log("server");',
        });
        expect(result.changed).toBe(false);
        expect(result.structure['index.html']).toBeUndefined();
    });

    it('weather compound forecasts require independent evidence, not the word forecast alone', () => {
        const request = `WeatherGo\nFeatures:\n- 7-day forecast\n- Hourly forecast`;
        const conservativeGap = uncoveredFeatures(request, 'weather', false);
        expect(conservativeGap).toEqual(expect.arrayContaining(['7-day forecast', 'Hourly forecast']));

        const source = filesFor('weather', false)['src/components/WeatherApp.jsx'];
        const provenGap = uncoveredFeatures(request, 'weather', false, source);
        expect(provenGap).not.toContain('7-day forecast');
        expect(provenGap).not.toContain('Hourly forecast');
    });

    it('052: weather evidence recognizes Open-Meteo daily and weathercode source shapes from the field', () => {
        const request = `WeatherGo\nFeatures:\n- 7-day forecast\n- weather condition`;
        const round14Source = [
            'const [forecastData, setForecastData] = useState(null);',
            'fetch(`https://api.open-meteo.com/v1/forecast?...&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`);',
            '{forecastData && forecastData.daily && (',
            '{forecastData.daily.time.map((day, index) => (',
            'weatherData.current_weather.weathercode',
            'getWeatherIcon(weatherData.current_weather.weathercode)',
        ].join('\\n');

        expect(uncoveredFeatures(request, 'weather', false, round14Source)).toEqual([]);
        expect(uncoveredFeatures(request, 'weather', false, '<h2>7-Day Forecast</h2> current_weather.weathercode')).toEqual([]);
        expect(uncoveredFeatures(request, 'weather', false, 'const unrelated = true;')).toEqual([
            '7-day forecast',
            'weather condition',
        ]);

        const generatedWeather = filesFor('weather', false)['src/components/WeatherApp.jsx'];
        expect(uncoveredFeatures(request, 'weather', false, generatedWeather)).toEqual([]);
    });

    it('053: repairs one named capability gap and rechecks the same evidence contract', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-capability-repair-'));
        const generatedPath = 'src/DomainApp.jsx';
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, generatedPath), 'export default function DomainApp(){ return null; }');
        let calls = 0;
        let repairDescription = '';
        const result = await repairCapabilityGapsOnce({
            request: 'A useful interface\\nFeatures:\\n- weather icons',
            engine: 'weather',
            apiLinked: false,
            projectRoot,
            generatedPath,
            authorDescription: 'Author the requested domain file.',
            language: 'en',
            aestheticMode: 'Preserve the current interface.',
            context: 'The existing artifact is on disk.',
            executionContext: { projectRoot },
            readEvidence: () => fs.readFileSync(path.join(projectRoot, generatedPath), 'utf8'),
            authorExecute: async (payload: any) => {
                calls += 1;
                repairDescription = payload.description;
                fs.writeFileSync(path.join(projectRoot, generatedPath), 'const weatherIcon = getWeatherIcon(weather_code);');
                return { ok: true };
            },
        });
        expect(result.ok).toBe(true);
        expect(result.attempted).toBe(true);
        expect(result.evidenceStatus).toBe('available');
        expect(result.gaps).toEqual(['weather icons']);
        expect(result.remaining).toEqual([]);
        expect(calls).toBe(1);
        expect(repairDescription).toContain('Missing capability: "weather icons"');
        expect(repairDescription).not.toContain('WeatherGo');
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('053: blocks honestly after the single repair leaves a named gap unresolved', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-capability-block-'));
        const generatedPath = 'src/DomainApp.jsx';
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, generatedPath), 'export default function DomainApp(){ return null; }');
        let calls = 0;
        const result = await repairCapabilityGapsOnce({
            request: 'A useful interface\\nFeatures:\\n- weather icons',
            engine: 'weather',
            apiLinked: false,
            projectRoot,
            generatedPath,
            authorDescription: 'Author the requested domain file.',
            language: 'en',
            aestheticMode: 'Preserve the current interface.',
            context: 'The existing artifact is on disk.',
            executionContext: { projectRoot },
            readEvidence: () => fs.readFileSync(path.join(projectRoot, generatedPath), 'utf8'),
            authorExecute: async () => {
                calls += 1;
                return { ok: true };
            },
        });
        expect(result.ok).toBe(false);
        expect(result.attempted).toBe(true);
        expect(result.evidenceStatus).toBe('available');
        expect(result.remaining).toEqual(['weather icons']);
        expect(result.error).toBe('capability_gap_unresolved: weather icons');
        expect(calls).toBe(1);
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('172: treats empty evidence as unverifiable and does not invoke repair', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-capability-empty-evidence-'));
        const generatedPath = 'src/DomainApp.jsx';
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, generatedPath), 'export default function DomainApp(){ return null; }');
        let calls = 0;
        const events: string[] = [];
        const result = await repairCapabilityGapsOnce({
            request: 'A useful interface\\nFeatures:\\n- weather icons',
            engine: 'weather',
            apiLinked: false,
            projectRoot,
            generatedPath,
            authorDescription: 'Author the requested domain file.',
            language: 'en',
            aestheticMode: 'Preserve the current interface.',
            context: 'The existing artifact is on disk.',
            executionContext: { projectRoot },
            readEvidence: () => '',
            authorExecute: async () => { calls += 1; return { ok: true }; },
            onEvent: (message) => events.push(message),
        });
        expect(result).toEqual({
            ok: false,
            attempted: false,
            gaps: [],
            remaining: [],
            error: 'capability_evidence_unavailable',
            evidenceStatus: 'unverifiable',
            evidenceUnavailableReason: 'unavailable_empty',
        });
        expect(calls).toBe(0);
        expect(events).toContain('capability audit: UNVERIFIABLE — evidence length=0; skipping feature classification and repair');
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('172: treats a reader exception as unverifiable and does not invoke repair', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-capability-reader-error-'));
        const generatedPath = 'src/DomainApp.jsx';
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, generatedPath), 'export default function DomainApp(){ return null; }');
        let calls = 0;
        const events: string[] = [];
        const result = await repairCapabilityGapsOnce({
            request: 'A useful interface\\nFeatures:\\n- weather icons',
            engine: 'weather',
            apiLinked: false,
            projectRoot,
            generatedPath,
            authorDescription: 'Author the requested domain file.',
            language: 'en',
            aestheticMode: 'Preserve the current interface.',
            context: 'The existing artifact is on disk.',
            executionContext: { projectRoot },
            readEvidence: () => { throw new Error('evidence read failed'); },
            authorExecute: async () => { calls += 1; return { ok: true }; },
            onEvent: (message) => events.push(message),
        });
        expect(result).toEqual({
            ok: false,
            attempted: false,
            gaps: [],
            remaining: [],
            error: 'capability_evidence_unavailable',
            evidenceStatus: 'unverifiable',
            evidenceUnavailableReason: 'unavailable_read_error',
        });
        expect(calls).toBe(0);
        expect(events).toContain('capability audit: UNVERIFIABLE — evidence read failed: evidence read failed; skipping feature classification and repair');
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('178: announces unverifiable capability evidence without treating it as success', () => {
        expect(capabilityEvidenceNotice('unverifiable', false)).toBe(
            'I could not read the project source to verify the requested capabilities — I did not inspect them, and I do not claim they are sound.',
        );
        expect(capabilityEvidenceNotice('unverifiable', true)).toContain('لم أستطع قراءة مصدر المشروع');
        expect(capabilityEvidenceNotice('available', false)).toBeNull();
        expect(capabilityEvidenceNotice(undefined, true)).toBeNull();
    });

    it('weather prose capabilities require executable search and detail shapes', () => {
        const request = `WeatherGo\nFeatures:\n- a clear responsive interface for searching cities\n- viewing weather details`;
        expect(uncoveredFeatures(request, 'weather', false)).toEqual([
            'a clear responsive interface for searching cities',
            'viewing weather details',
        ]);

        const weather = filesFor('weather', false)['src/components/WeatherApp.jsx'];
        expect(uncoveredFeatures(request, 'weather', false, weather)).toEqual([]);

        const wordsOnly = 'searching cities weather details temperature humidity wind';
        expect(uncoveredFeatures(request, 'weather', false, wordsOnly)).toEqual([
            'a clear responsive interface for searching cities',
            'viewing weather details',
        ]);

        const searchOnly = `<form onSubmit={submit}><input onChange={update} /></form> fetch('https://geocoding-api.open-meteo.com')`;
        expect(uncoveredFeatures(request, 'weather', false, searchOnly)).toEqual([
            'viewing weather details',
        ]);
    });

    it('interactive search engines share a real empty-input contract', () => {
        const weather = filesFor('weather', false)['src/components/WeatherApp.jsx'];
        const maps = filesFor('maps', false)['src/components/MapApp.jsx'];
        const message: string[] = [];
        let fetchCalls = 0;
        const canRequest = guardRequiredInput('   ', (text) => message.push(text), 'Enter a city before searching.');
        if (canRequest) fetchCalls += 1;

        expect(canRequest).toBe(false);
        expect(fetchCalls).toBe(0);
        expect(message).toEqual(['Enter a city before searching.']);
        expect(guardRequiredInput('Istanbul', () => undefined, 'Enter a city before searching.')).toBe(true);

        for (const [name, source, needle, alertText] of [
            ['weather', weather, 'EMPTY_CITY_MESSAGE', 'role="alert"'],
            ['maps', maps, 'EMPTY_PLACE_MESSAGE', 'role="alert"'],
        ] as const) {
            expect(syntaxOk(`src/components/${name === 'weather' ? 'WeatherApp' : 'MapApp'}.jsx`, source).ok).toBe(true);
            const findCitiesStart = source.indexOf('const findCities =');
            const searchStart = findCitiesStart >= 0 ? findCitiesStart : source.indexOf('const search =');
            const guard = source.indexOf('guardRequiredInput(', searchStart);
            const request = source.indexOf('fetch(', searchStart);
            expect(searchStart).toBeGreaterThan(-1);
            expect(guard).toBeGreaterThan(searchStart);
            expect(guard).toBeLessThan(request);
            expect(source).toContain(`if (!guardRequiredInput(`);
            expect(source).toContain(needle);
            expect(source).toContain(alertText);
            expect(source).toMatch(/onEmpty\(message\);[\s\S]*?return false;/);
        }
    });

    it('catalogues unparenthesized logical/ternary precedence defects before writing authored files', () => {
        const authoredLine = "return descriptions[code] || isArabic ? 'غير معروف' : 'Unknown';";
        const rejection = unparenthesizedLogicalTernaryError('src/components/WeatherApp.jsx', authoredLine);
        expect(rejection).toMatch(/operator_precedence_ambiguity/);
        expect(rejection).toMatch(/WeatherApp\.jsx:1/);
        expect(rejection).toMatch(/parenthesize the ternary branch/);
        expect(unparenthesizedLogicalTernaryError(
            'src/components/WeatherApp.jsx',
            "return descriptions[code] || (isArabic ? 'غير معروف' : 'Unknown');",
        )).toBeNull();
        expect(unparenthesizedLogicalTernaryError('src/App.jsx', "return ok ? 'yes' : 'no';")).toBeNull();
        expect(unparenthesizedLogicalTernaryError('src/App.jsx', "return value || fallback;")).toBeNull();
        expect(unparenthesizedLogicalTernaryError('src/App.jsx', "const example = '|| condition ? x : y';")).toBeNull();
    });

    it('weather includes the real forecast contract and negative-state surfaces', () => {
        const files = filesFor('weather', false);
        const weather = files['src/components/WeatherApp.jsx'];
        expect(weather).toContain('https://api.open-meteo.com/v1/forecast');
        expect(weather).toContain('https://geocoding-api.open-meteo.com/v1/search');
        expect(weather).toContain("hourly: 'temperature_2m,weather_code'");
        expect(weather).toContain("daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max'");
        expect(weather).toContain('No city by that name was found.');
        expect(weather).toContain('Could not load weather data. Check the network and try again.');
        expect(weather).toContain("localStorage.setItem(content.storeKey + ':time'");
    });

    it('productivity carries two API resources and real remote CRUD', () => {
        const files = buildAppFiles(
            blueprintFor('productivity', 'QuickNotes', true),
            {
                isArabic: true, brand: 'QuickNotes', storeKey: 'quicknotes-productivity',
                api: 'http://localhost:4100/api/notes',
                apiResources: {
                    notes: 'http://localhost:4100/api/notes',
                    tasks: 'http://localhost:4100/api/tasks',
                },
            } as any,
            'quicknotes',
        );
        const content = files['src/content.js'];
        const app = files['src/components/ProductivityApp.jsx'];
        expect(content).toContain('"notes":"http://localhost:4100/api/notes"');
        expect(content).toContain('"tasks":"http://localhost:4100/api/tasks"');
        expect(app).toContain("apiListOn(content.api, 'notes')");
        expect(app).toContain("apiListOn(content.api, 'tasks')");
        expect(app).toContain("apiCreateOn(content.api, 'notes'");
        expect(app).toContain("apiCreateOn(content.api, 'tasks'");
        expect(app).toContain("apiUpdateOn(content.api, 'notes'");
        expect(app).toContain("apiUpdateOn(content.api, 'tasks'");
        expect(app).toContain("apiDeleteOn(content.api, 'notes'");
        expect(app).toContain("apiDeleteOn(content.api, 'tasks'");
    });

    it('and the API address is resolved at runtime, never baked in alone', () => {
        // A bundle that can only talk to localhost:4100 is a bundle that dies
        // on a domain — which is the whole point of this batch.
        const store = filesFor('booking', true)['src/app/store.js'];
        expect(store).toMatch(/async function resolvedApi\(api\)/);
        expect(store).toMatch(/fetch\('\/api\/health'/);
        // and every call goes through it
        for (const fn of ['apiList', 'apiCreate', 'apiUpdate', 'apiPost', 'apiDelete', 'apiLogin', 'apiMe',
            'apiListOn', 'apiCreateOn', 'apiDeleteOn']) {
            const i = store.indexOf(`function ${fn}(`);
            expect(`${fn}: ${store.slice(i, i + 500).includes('resolvedApi(') ? 'resolves' : 'hardcoded'}`)
                .toBe(`${fn}: resolves`);
        }
    });
});
