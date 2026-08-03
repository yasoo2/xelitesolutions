/**
 * NAMED-ROW TEXT EDITS — «غيّر سعر طقم الهدية إلى 200» — locked.
 *
 * The whole path is deterministic: the row is found by SCORED name words in
 * the project's own content.js, the field swap is a regex on the
 * serializer's single-line row format, and no model is ever asked. These
 * locks pin the currency-affix inheritance, row isolation, the tiers
 * sharing the same shape, the guided answer for a rowless price request,
 * the model-path fallthrough for rowless اسم/وصف (a brand rename is NOT a
 * row edit), and undo.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('named-row text edits — deterministic, no model', () => {
    let root: string;
    let dir: string;
    const contentOf = () => fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8');
    const edit = async (request: string) => {
        const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
        return new ProjectEditTool().execute({ request }, { sessionId: 'txt-edit' });
    };

    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-txt-'));
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمتجر عطور', skipInstall: true, root }, { sessionId: 'txt-edit' });
        dir = res.output.path;
    });
    afterAll(() => {
        delete (global as any).joeProjects?.['txt-edit'];
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('a bare number keeps the row\'s currency affix', async () => {
        const r: any = await edit('غير سعر طقم الهدية الى 200');
        expect(r.ok).toBe(true);
        expect(r.output.touched).toContain('src/content.js');
        expect(contentOf()).toMatch(/\{ name: 'طقم الهدية',[^\n]*?price: '200 ر\.س'/);
        expect(String(r.output.message)).toContain('200 ر.س');
    });

    it('an explicit value is used verbatim, and ONLY the named row changes', async () => {
        const r: any = await edit('خلي سعر الإصدار الفاخر = 99 دولار');
        expect(r.ok).toBe(true);
        const c = contentOf();
        expect(c).toMatch(/\{ name: 'الإصدار الفاخر',[^\n]*?price: '99 دولار'/);
        expect(c).toMatch(/\{ name: 'الإصدار الكلاسيكي',[^\n]*?price: '120 ر\.س'/);   // untouched
    });

    it('the tiers share the row shape — a named tier price swaps too', async () => {
        const r: any = await edit('غير سعر الاحترافية الى 149');
        expect(r.ok).toBe(true);
        expect(contentOf()).toMatch(/\{ name: 'الاحترافية',[^\n]*?price: '149'/);
    });

    it('descriptions and names change by the same path', async () => {
        await edit('عدل وصف الإصدار الكلاسيكي إلى نسخة محدودة هذا الموسم');
        expect(contentOf()).toMatch(/\{ name: 'الإصدار الكلاسيكي', desc: 'نسخة محدودة هذا الموسم'/);
        await edit('غير اسم الأكثر مبيعاً إلى الإصدار الأسطوري');
        expect(contentOf()).toMatch(/\{ name: 'الإصدار الأسطوري',/);
        expect(contentOf()).not.toMatch(/'الأكثر مبيعاً'/);
    });

    it('a rowless PRICE request earns the guided answer, nothing changes', async () => {
        const before = contentOf();
        const r: any = await edit('غير السعر الى 500');
        expect(String(r.output.message)).toContain('العناصر المتاحة');
        expect(contentOf()).toBe(before);
    });

    it('«تراجع» rolls the last text edit back', async () => {
        const r: any = await edit('تراجع عن آخر تعديل');
        expect(String(r.output.message)).toContain('↩️');
        expect(contentOf()).toMatch(/'الأكثر مبيعاً'/);   // the rename is undone
    });
});
