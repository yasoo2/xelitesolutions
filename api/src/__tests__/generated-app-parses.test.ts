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
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';
import { blueprintFor, type AppKind } from '../core/design/app-blueprints';

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
