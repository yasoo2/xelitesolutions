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
