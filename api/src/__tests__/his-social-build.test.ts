/**
 * «لم يعجبني اداء النظام جو ولا اداء المتصفح» — SIX FINDINGS, ONE BY ONE.
 *
 * Once the browser stopped grading Express's 404 page it finally measured the
 * product, and the product had real defects. Five were Joe's own building, one
 * was the auditor still being wrong, and one — the score — was a lie told by
 * the repairer.
 *
 * Measured end to end in verify_his_social_build.ts on HIS request: 55/100 →
 * 92/100, 13/13.
 */
import fs from 'fs';
import path from 'path';
import { fileAppStoreJs, fileSocialAppJsx, fileShopAppJsx, fileAppCss } from '../modules/tools/definitions/react-app-templates';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('a sibling of a dead address is a dead address', () => {
    it('the store resolves the origin before taking a sibling', () => {
        const s = fileAppStoreJs();
        expect(s).toMatch(/export async function apiSiblingLive\(api, name\) \{\n\s*return apiSibling\(await resolvedApi\(api\), name\);/);
    });

    it('«follow» goes through it — that was the ERR_CONNECTION_REFUSED', () => {
        const jsx = fileSocialAppJsx(true);
        expect(jsx).toMatch(/await apiSiblingLive\(content\.api, 'follows'\)/);
        // …in both directions: the read at mount and the toggle.
        expect((jsx.match(/apiSiblingLive\(content\.api, 'follows'\)/g) || []).length).toBe(2);
        expect(jsx).not.toMatch(/apiSibling\(content\.api/);
    });

    it('and so does the shop’s checkout, which had the same shape', () => {
        const jsx = fileShopAppJsx(true);
        expect(jsx).toMatch(/const endpoint = await apiSiblingLive\(content\.api, 'orders'\)/);
        expect(jsx).not.toMatch(/apiSibling\(content\.api/);
    });
});

describe('a control a thumb cannot hit is not a control', () => {
    const css = () => fileAppCss();

    it('the feed’s like and comment buttons are 44px, not 36', () => {
        expect(css()).toMatch(/\.act\{[^}]*\n?[^}]*min-height:44px/);
    });

    it('the filter tabs are 44px, not 40', () => {
        expect(css()).toMatch(/\.tabbtn\{[^}]*\n?\s*min-height:44px/);
    });

    it('and the photo picker too — it measured 298x40', () => {
        expect(css()).toMatch(/\.file-in\{[^}]*min-height:44px/);
    });
});

describe('one overflow, seen from six heights', () => {
    it('flex and grid children are told they may shrink', () => {
        const css = fileAppCss();
        // «Horizontal scrolling at 390px — div, div.app, header.app-bar,
        // div.app-bar-in, main.app-main, div.wrap.social-wrap»: the whole
        // ancestor chain, because min-width:auto is the default.
        expect(css).toContain('.app-bar-in>*{min-width:0}');
        expect(css).toContain('.wrap>*{min-width:0}');
        expect(css).toContain('.social-wrap>*{min-width:0}');
        expect(css).toMatch(/\.app-bar-in\{[^}]*flex-wrap:wrap\}/);
    });
});

describe('and the auditor stops inventing two of them', () => {
    const B = () => read('core', 'quality', 'behaviour-audit.ts');

    it('a disabled submit IS validation — «Post» is off until there is content', () => {
        const b = B();
        expect(b).toMatch(/const guarded = !!submit && \(submit as HTMLButtonElement\)\.disabled === true;/);
        expect(b).toMatch(/f\.required === 0 && !f\.guarded/);
    });

    it('and a toggle already pressed is not a dead button', () => {
        expect(B()).toMatch(/if \(el\.getAttribute\('aria-pressed'\) === 'true'\) return;/);
    });
});

describe('a repair is what the SECOND measurement says it is', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('the findings that actually disappeared are computed, not assumed', () => {
        const r = R();
        const LOOP = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'improve-loop.ts'), 'utf-8');
        expect(LOOP).toMatch(/const fixed = remaining\.filter\(id => !after\.findingIds\.includes\(id\)\);/);
        expect(r).toMatch(/fixed: loop\.fixed,/);
    });

    it('and «55/100 → 55/100» is reported as an attempt, never as an achievement', () => {
        const r = R();
        expect(r).toMatch(/const moved = selfRepair\.after > selfRepair\.before \|\| selfRepair\.fixed\.length > 0;/);
        expect(r).toContain('ولم تتغيّر النتيجة');
        expect(r).toContain('An attempt is not an achievement');
        expect(r).toMatch(/moved \? '' : \(isAr \? 'حاولتُ: ' : 'tried: '\)/);
    });
});

describe('twelve features, and the model matched none of the six domains', () => {
    const { deriveDataModel, dataModelDomain } = require('../core/design/data-model');

    it('a social platform now has groups, pages, messages and ads', () => {
        const m = deriveDataModel('Build a next-generation social media platform');
        expect(m.map((e: any) => e.key)).toEqual(['groups', 'pages', 'messages', 'ads']);
        expect(dataModelDomain('social media platform')).toBe('social');
    });

    it('and «منصة تواصل اجتماعي» reaches the same tables', () => {
        expect(deriveDataModel('ابنِ منصة تواصل اجتماعي').map((e: any) => e.key))
            .toEqual(['groups', 'pages', 'messages', 'ads']);
    });

    it('every one of them is a real row, not a label', () => {
        for (const e of deriveDataModel('social network')) {
            expect(e.fields.length).toBeGreaterThanOrEqual(3);
            expect(e.fields.some((f: any) => f.required)).toBe(true);
            expect(e.key).toMatch(/^[a-z0-9_]+$/);
        }
    });

    it('the feed server mounts them, and carries real accounts', () => {
        const a = fs.readFileSync(path.join(SRC, 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');
        const feed = a.slice(a.indexOf('function filePostsServerJs'), a.indexOf('function fileDbJs'));
        expect(feed).toContain('mountEntities(app, { requireAuth, optionalAuth, requireWrite, scopeOf, mayTouch });');
        expect(feed).toContain("app.post('/api/auth/login'");
        expect(feed).toContain('const ownerOnly = [requireAuth, requireRole(\'owner\')];');
        expect(feed).toContain('const owner = seedOwner();');
    });

    it('and its database knows what an account is', () => {
        const a = fs.readFileSync(path.join(SRC, 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');
        const db = a.slice(a.indexOf('function filePostsDbJs'), a.indexOf('function filePostsServerJs'));
        for (const fn of ['db.userByEmail', 'db.createUser', 'db.listUsers', 'db.countOwners', 'db.setRole']) {
            expect(db).toContain(fn);
        }
        // Both backends, or the feature exists only on modern Node.
        expect((db.match(/db\.countOwners/g) || []).length).toBe(2);
    });
});
