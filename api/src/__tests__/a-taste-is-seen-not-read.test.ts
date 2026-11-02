/**
 * ⛔ A TASTE IS SEEN, NOT READ (core/quality/appearance.ts).
 *
 * 2026-11-02, a real Claude build of an Arabic counter page: it worked and
 * looked clean, and Joe refused it because «التصميم أنيق» went to the judge
 * that reads the source, which can only call a taste «unprovable». These pin
 * which requirements are about the look (judged on a screenshot instead), and
 * how the screenshot's verdict is read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appearancePrompt, isAppearanceRequirement, judgeAppearance } from '../core/quality/appearance';

describe('what is a requirement about the look', () => {
    it.each([
        'التصميم أنيق', 'تصميم أنيق وعصري', 'بتصميم جميل', 'ألوان هادئة', 'يكون شكله احترافياً', 'واجهة جذابة ومريحة للعين',
        'an elegant design', 'a modern, clean look', 'calm colours', 'beautiful', 'The UI should look professional', 'stylish and minimalist layout',
    ])('«%s» is judged on the page', text => {
        expect(isAppearanceRequirement(text)).toBe(true);
    });

    it.each([
        'a modern booking form', 'clean code', 'a dark mode toggle', 'responsive design', 'Arabic RTL layout',
        'زر لزيادة العداد', 'نموذج حجز عصري', 'حفظ العداد بعد إعادة التحميل', 'a menu of drinks with prices', 'the design', '',
    ])('«%s» is judged on the source', text => {
        expect(isAppearanceRequirement(text)).toBe(false);
    });
});

describe('the verdict on the screenshot', () => {
    const REQ = [{ id: 'req-look', text: 'التصميم أنيق', quote: 'التصميم أنيق' }];
    let shot: string;
    beforeAll(() => {
        shot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-look-')), 'page.jpg');
        fs.writeFileSync(shot, Buffer.from('pixels'));
    });

    it('a preference is not a defect: the brief says so and asks for what is seen', () => {
        const brief = appearancePrompt(REQ, true);
        expect(brief).toContain('[req-look] التصميم أنيق');
        expect(brief).toContain('A preference is not a defect');
        expect(brief).toContain('in Arabic');
    });

    it('met and unmet are read in the shapes models write; anything else is unprovable, never met', async () => {
        const said = (raw: string) => judgeAppearance(REQ, { path: shot }, true, async () => raw);
        expect((await said('{"verdicts":[{"id":"req-look","verdict":"met","why":"ألوان متناسقة"}]}'))[0]).toMatchObject({ verdict: 'met', why: 'ألوان متناسقة' });
        expect((await said('```json\n{"req-look":{"met":false,"why":"النص غير مقروء"}}\n```'))[0]).toMatchObject({ verdict: 'unmet', why: 'النص غير مقروء' });
        expect((await said('looks fine to me'))[0].verdict).toBe('unprovable');
        expect((await said('{"verdicts":[{"id":"req-look","verdict":"maybe"}]}'))[0].verdict).toBe('unprovable');
    });

    it('no screenshot, no eyes, or a failed call: unprovable with the reason', async () => {
        expect((await judgeAppearance(REQ, undefined, false, async () => 'x'))[0]).toMatchObject({ verdict: 'unprovable', why: expect.stringMatching(/no screenshot/u) });
        expect((await judgeAppearance(REQ, { path: shot }, false, undefined))[0]).toMatchObject({ verdict: 'unprovable', why: expect.stringMatching(/cannot see images/u) });
        expect((await judgeAppearance(REQ, { path: shot }, false, async () => { throw new Error('429'); }))[0]).toMatchObject({ verdict: 'unprovable', why: expect.stringMatching(/did not answer.*429/u) });
    });
});
