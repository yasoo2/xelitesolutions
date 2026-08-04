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

    it('«ضف منتج …» inserts a full well-formed row; no network here → clean img: null', async () => {
        const r: any = await edit('ضف منتج عطر الليل بسعر 300 بوصف رائحة شرقية فاخرة');
        expect(r.ok).toBe(true);
        const c = contentOf();
        expect(c).toContain("{ name: 'عطر الليل', desc: 'رائحة شرقية فاخرة', price: '300 ر.س', slug: 'عطر-الليل', img: null },");
        const { syntaxOk } = require('../modules/tools/definitions/ProjectEditTool');
        expect(syntaxOk('src/content.js', c).ok).toBe(true);
    });

    it('a duplicate add is refused with guidance; a dish with no price ships with «—»', async () => {
        const dup: any = await edit('ضف منتج عطر الليل بسعر 500');
        expect(String(dup.output.message)).toContain('موجود مسبقاً');
        const r: any = await edit('ضف منتج مجموعة السفر');
        expect(r.ok).toBe(true);
        expect(contentOf()).toMatch(/\{ name: 'مجموعة السفر',[^\n]*?price: '—'/);
    });

    it('«احذف منتج …» removes exactly that row; an unnamed delete lists the items', async () => {
        const r: any = await edit('احذف منتج مجموعة السفر');
        expect(r.ok).toBe(true);
        const c = contentOf();
        expect(c).not.toContain('مجموعة السفر');
        expect(c).toContain('عطر الليل');                 // its neighbour survived
        const none: any = await edit('احذف المنتج');
        expect(String(none.output.message)).toContain('سمِّ العنصر');
        expect(contentOf()).toBe(c);
    });
});

/**
 * THE FIELD FAILURE: «طلبت تعديل وفشل التعديل بالشكل الصحيح».
 *
 * «تعديل على المنتجات قم بزياده عطر اسمه البوس مع صوره له» matched no
 * deterministic branch — the verb carried a «بـ» prefix and the thing added
 * was «عطر», not the word «منتج» — so it fell to the model, which wrote an
 * image path for a file that never existed.
 */
import { attachedImagePath, adoptLocalImage } from '../modules/tools/definitions/ProjectEditTool';

describe('the phrasing that fell through to the model', () => {
    let root: string, proj: string;
    const contentOf = () => fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fieldfail-'));
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للعطور', root, skipInstall: true }, { sessionId: 'ff-t' });
        proj = res.output.path;
    });
    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); delete (global as any).joeProjects?.['ff-t']; });

    it('«قم بزياده عطر اسمه البوس» adds a real row — deterministically, no model', async () => {
        const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
        const res: any = await new ProjectEditTool().execute(
            { request: 'تعديل على المنتجات قم بزياده عطر اسمه البوس مع صوره له' }, { sessionId: 'ff-t' });
        expect(res.ok).toBe(true);
        const row = contentOf().match(/\{ name: 'البوس',[^\n]*\},/)?.[0] || '';
        expect(row).toContain("name: 'البوس'");
        expect(row).toMatch(/slug: '[^']+'/);
        // Offline here: no archive, so the row ships clean rather than lying.
        expect(row).toContain('img: null');
    });

    it('an INVENTED image path is stripped, never shipped', async () => {
        const poisoned = contentOf().replace(/(\{ name: 'البوس',[^\n]*?img: )null/, "$1{ src: 'images/boss.jpg', alt: 'البوس' }");
        fs.writeFileSync(path.join(proj, 'src', 'content.js'), poisoned, 'utf-8');
        const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
        const res: any = await new ProjectEditTool().execute({ request: 'غيّر سعر البوس إلى 340' }, { sessionId: 'ff-t' });
        expect(res.ok).toBe(true);
        expect(contentOf()).not.toContain('images/boss.jpg');
        expect(res.output.invented).toContain('images/boss.jpg');
        expect(String(res.output.message)).toMatch(/مُختلَق/);
    });

    it('an attached photo is READ from the raw request and adopted into the project', () => {
        const file = path.join(root, 'shot.png');
        fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
        const raw = `قم باضافه هذه الصوره الى منتج البوس\n\n[ATTACHED FILES]\n(raw file on disk at: ${file})`;
        expect(attachedImagePath(raw)).toBe(file);
        expect(attachedImagePath('no attachment here')).toBeNull();
        const img = adoptLocalImage(file, proj, 'البوس')!;
        expect(img.src).toMatch(/^images\/[a-f0-9]{32}\.png$/);
        expect(fs.readFileSync(path.join(proj, 'public', img.src))).toEqual(fs.readFileSync(file));
    });

    it('the planner sends «أضف هذه الصورة إلى …» to project_edit, not to a chat about the file', async () => {
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const goal = `قم باضافه هذه الصوره الى منتج البوس\n\n[ATTACHED FILES — 1 file]\n(raw file on disk at: ${path.join(root, 'shot.png')})`;
        const plan = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any });
        expect(plan.steps[0].tool).toBe('project_edit');
    });
});
