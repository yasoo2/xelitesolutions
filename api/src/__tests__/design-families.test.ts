/**
 * DESIGN FAMILIES, locked — four complete identities, ONE deterministic pick.
 *
 * The gap this closes: one design system made every Joe project look like
 * its sibling. The lock pins the picker (explicit wish beats kind, kind
 * beats default, same input → same family always), the four css blocks
 * being genuinely DIFFERENT, the marker-based swap, the scaffolder wiring,
 * the surgical «غيّر الطراز إلى فاخر» edit, and the Arabic guard: no
 * letter-spacing anywhere in a family (joined script breaks apart).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { familyFor, familyCss, swapFamilyCss, familyOf, FAMILY_LABEL_AR, type DesignFamily } from '../core/design/families';

const FAMILIES: DesignFamily[] = ['minimal', 'elegant', 'bold', 'warm'];

describe('the deterministic family pick', () => {
    it('an explicit wish always wins — in Arabic and English', () => {
        expect(familyFor('ابنِ متجر فاخر للعطور', 'store')).toBe('elegant');
        expect(familyFor('موقع مطعم بتصميم جريء', 'restaurant')).toBe('bold');
        expect(familyFor('build a cozy bakery site', 'store')).toBe('warm');
        expect(familyFor('بسيط ونظيف لو سمحت', 'app')).toBe('minimal');
    });
    it('the kind decides like a designer when nothing is asked', () => {
        expect(familyFor('ابنِ موقع لمطعم', 'restaurant')).toBe('warm');
        expect(familyFor('ابنِ متجر عطور', 'store')).toBe('elegant');
        expect(familyFor('منصة إدارة مهام', 'app')).toBe('bold');
        expect(familyFor('موقع لمشروعي', 'generic')).toBe('minimal');
    });
    it('same input → same family, always (no randomness)', () => {
        for (let i = 0; i < 5; i++) expect(familyFor('ابنِ متجر عطور', 'store')).toBe('elegant');
    });
});

describe('the four identities are real, distinct, and Arabic-safe', () => {
    it('every family emits a marker-wrapped block with the full variable set', () => {
        for (const f of FAMILIES) {
            const css = familyCss(f);
            expect(css).toContain(`/* joe-family:${f} */`);
            expect(css).toContain('/* /joe-family */');
            for (const v of ['--f-font', '--f-head', '--f-radius', '--f-btn-radius', '--f-border-w', '--f-card-shadow']) {
                expect(css).toContain(v);
            }
            expect(css).not.toContain('letter-spacing');   // joined Arabic script must never be tracked apart
            const open = (css.match(/\{/g) || []).length, close = (css.match(/\}/g) || []).length;
            expect(open).toBe(close);
        }
    });
    it('no two families share the same block', () => {
        const all = FAMILIES.map(familyCss);
        expect(new Set(all).size).toBe(4);
        expect(familyCss('elegant')).toContain('serif');
        expect(familyCss('bold')).toContain('6px 6px 0');            // the brutalist hard shadow
        expect(familyCss('warm')).toContain('--f-radius:26px');
    });
    it('swapFamilyCss replaces exactly the block; unmarked css refuses', () => {
        const base = `${familyCss('warm')}\n.card{border-radius:var(--f-radius)}`;
        const swapped = swapFamilyCss(base, 'bold')!;
        expect(familyOf(swapped)).toBe('bold');
        expect(swapped).toContain('.card{border-radius:var(--f-radius)}');   // structure untouched
        expect(swapped).not.toContain('--f-radius:26px');
        expect(swapFamilyCss('.card{}', 'bold')).toBeNull();
    });
});

describe('the scaffolder and the surgical editor carry the family', () => {
    let root: string;
    beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fam-')); });
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
        delete (global as any).joeProjects?.['fam-t'];
    });

    it('a fancy store scaffolds ELEGANT; «غيّر الطراز إلى جريء» swaps just the block', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react فاخر للعطور', skipInstall: true, root }, { sessionId: 'fam-t' });
        const cssPath = path.join(res.output.path, 'src', 'styles', 'base.css');
        const css = fs.readFileSync(cssPath, 'utf-8');
        expect(familyOf(css)).toBe('elegant');
        expect(css).toContain('font-family:var(--f-font)');
        expect(String(res.output.message)).toContain(FAMILY_LABEL_AR.elegant);

        const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
        const swap: any = await new ProjectEditTool().execute({ request: 'غيّر الطراز إلى جريء' }, { sessionId: 'fam-t' });
        expect(swap.ok).toBe(true);
        expect(swap.output.touched).toContain('src/styles/base.css');
        const after = fs.readFileSync(cssPath, 'utf-8');
        expect(familyOf(after)).toBe('bold');
        expect(after).toContain('.menu-list');                        // the rest of base.css survived

        // Unnamed swap asks instead of guessing; same-family swap answers honestly.
        const ask: any = await new ProjectEditTool().execute({ request: 'غيّر الطراز' }, { sessionId: 'fam-t' });
        expect(String(ask.output.message)).toContain('سمِّ الطراز');
        const same: any = await new ProjectEditTool().execute({ request: 'غيّر الطراز إلى جريء' }, { sessionId: 'fam-t' });
        expect(String(same.output.message)).toContain('بالفعل');

        // «تراجع» rides the same machinery: elegant comes back.
        const undo: any = await new ProjectEditTool().execute({ request: 'تراجع عن آخر تعديل' }, { sessionId: 'fam-t' });
        expect(String(undo.output.message)).toContain('↩️');
        expect(familyOf(fs.readFileSync(cssPath, 'utf-8'))).toBe('elegant');
    });
});
