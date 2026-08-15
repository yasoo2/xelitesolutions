/**
 * A DATABASE WITH A URL IS NOT A SYSTEM ANYONE CAN RUN.
 *
 * The backend learned to carry vendors, customers, coupons and shipments —
 * and they were reachable only by `curl`. These are the screens, generated
 * from the SAME model the server was generated from, so the two halves cannot
 * drift apart.
 *
 * Proven in a real browser (verify_admin_screens.ts, 20/20): the owner signs
 * in through the page, adds a vendor through the form, and the row is in the
 * database afterwards. Two defects were caught by that run and are pinned
 * here — a stale «sign in first» note, and a stylesheet the builder was
 * overwriting.
 */
import fs from 'fs';
import path from 'path';
import { fileTablesAdminCss, fileTablesAdminJsx } from '../modules/tools/definitions/react-app-templates';
import { deriveDataModel } from '../core/design/data-model';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');
const MODEL = deriveDataModel('multi-vendor marketplace');

describe('every table becomes a screen', () => {
    const jsx = (isAr = false) => fileTablesAdminJsx(MODEL, isAr);

    it('the screens carry the server’s own model, not a copy someone typed', () => {
        const src = jsx();
        for (const e of MODEL) {
            expect(src).toContain(`"key":"${e.key}"`);
            for (const f of e.fields) expect(src).toContain(`"key":"${f.key}"`);
        }
    });

    it('reading is public and writing goes through the owner’s token', () => {
        const src = jsx();
        expect(src).toMatch(/import \{ apiListOn, apiCreateOn, apiDeleteOn, apiUpdateOn, getToken, canWriteNow, pickImage, cardFor \}/);
        // Signed in is not the same as allowed: an account that may not write
        // is shown no form and no row buttons, instead of buttons that 403.
        expect(src).toMatch(/const \[mayWrite, setMayWrite\] = useState\(\(\) => canWriteNow\(\)\);/);
        expect(src).toMatch(/\{mayWrite \? \(\n\s*<form className="tbl-form"/);
        expect(src).toMatch(/apiCreateOn\(api, table\.key, draft\)/);
        expect(src).toMatch(/apiUpdateOn\(api, table\.key, editing, draft\)/);
        expect(src).toMatch(/apiDeleteOn\(api, table\.key, id\)/);
    });

    it('a machine error is turned into a sentence', () => {
        const en = jsx(false);
        expect(en).toMatch(/Required field: /);
        expect(en).toMatch(/The linked row does not exist/);
        const ar = jsx(true);
        expect(ar).toMatch(/حقل مطلوب: /);
        expect(ar).toMatch(/السطر المرتبط غير موجود/);
    });

    it('a link is CHOSEN from real rows, never typed as an id', () => {
        const src = jsx();
        expect(src).toMatch(/<select value=\{draft\[f\.key\] \?\? ''\}/);
        expect(src).toMatch(/\(parentRows \|\| \[\]\)\.map\(\(p\) =>/);
        expect(src).toMatch(/table\.belongsTo\.entity/);
    });

    it('and the sign-in state is LIVE — a token read once at mount never changes', () => {
        // Measured: after a successful sign-in the screen still said «sign in as
        // the owner to add anything», while writing already worked.
        const src = jsx();
        expect(src).toMatch(/const \[signedIn, setSignedIn\] = useState\(\(\) => !!getToken\(\)\);/);
        expect(src).toMatch(/window\.addEventListener\('joe:auth', sync\)/);
        const store = read('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(store).toMatch(/window\.dispatchEvent\(new CustomEvent\('joe:auth'/);
    });

    it('the screens are contained like the rest of the page, not edge-to-edge', () => {
        const css = fileTablesAdminCss();
        expect(css).toMatch(/\.admin-tables \{[\s\S]*max-width: var\(--maxw, 1180px\)/);
        expect(css).toMatch(/\.tbl-scroll \{ overflow-x: auto; \}/);
        // Tap targets the self-QA would otherwise flag.
        expect((css.match(/min-height: 44px/g) || []).length).toBeGreaterThanOrEqual(3);
        // A backtick inside this literal silently ends it and the export stops
        // being a function — that exact bug shipped once and is pinned here.
        expect(css).not.toContain('`');
    });
});

describe('and the builder wires them without breaking what was there', () => {
    it('only when this session really has a server to talk to', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        // …and from the model the SERVER was built from, so the screens and the
        // tables cannot disagree when an LLM designed them.
        expect(r).toMatch(/const tableModel = apiLink/);
        expect(r).toMatch(/Array\.isArray\(prevEntry\?\.model\) && prevEntry\.model\.length/);
        // …and when the session has none, the SAME ORDER the server uses:
        // what he named, then what his words imply, and a stocked domain only
        // when the sentence named nothing at all.
        //
        // Repointed: this used to require the stocked domains to be consulted
        // FIRST. Measured on a paired build of an eleven-domain freight
        // request — the server created clients/shipments/containers/…, the
        // interface asked the running server for `/api/suppliers` from a
        // stocked domain, and three 404s failed the delivery gate. The comment
        // above says these two must not disagree; now they read alike.
        expect(r).toMatch(/named-entities'\)\.namedEntities\(request\)/);
        expect(r).toMatch(/entity-inference'\)\.inferModel\(request\)\.entities/);
        expect(r).toMatch(/deriveDataModel\(request\)/);
        const chain = r.slice(r.indexOf('const tableModel = apiLink'));
        expect(chain.indexOf('namedEntities(request)')).toBeLessThan(chain.indexOf('deriveDataModel(request)'));
        // The app itself manages the FIRST table now; the admin screens carry
        // the rest, so «النباتات» is never rendered twice.
        expect(r).toMatch(/model: adminModel,/);
        expect(r).toMatch(/adminModel = tableModel\.slice\(1\)/);
    });

    it('the shell renders them, and a build without a model imports nothing', () => {
        const t = read('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(t).toMatch(/\$\{hasTables \? "import TablesAdmin from '\.\/components\/TablesAdmin\.jsx';/);
        expect(t).toMatch(/'src\/App\.jsx': fileAppShellJsx\(bp, o\.isArabic, !!\(o\.model && o\.model\.length\), !!o\.api\)/);
        expect(t).toMatch(/\.\.\.\(o\.model && o\.model\.length \? \{ 'src\/components\/TablesAdmin\.jsx'/);
    });

    it('and the stylesheet is EXTENDED, never rebuilt from scratch', () => {
        // This line used to rebuild app.css from fileAppCss() alone, throwing
        // away the engine's own styles — the shop grid, and the whole tables
        // screen, which rendered edge-to-edge with unstyled inputs.
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/\+ \(appFiles\['src\/styles\/app\.css'\] \|\| fileAppCss\(\)\);/);
        expect(r).not.toMatch(/body\{font-family:\$\{familyFonts\(family\)\.body\}\}\\n\$\{fileAppCss\(\)\}`;/);
    });
});
