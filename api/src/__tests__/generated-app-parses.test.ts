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
