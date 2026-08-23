import fs from 'fs';
import path from 'path';
import { replyLanguageCode, isArabicReply } from '../shared/reply-language';

const readSource = (relative: string) => fs.readFileSync(path.join(__dirname, relative), 'utf-8');

describe('the interface decides what Joe says', () => {
    it.each([
        ['English UI, Arabic request', 'en', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد', 'en'],
        ['Arabic UI, English request', 'ar', 'Build me a table for my clients', 'ar'],
        ['locale with a region', 'en-US', 'عندي عيادة أسنان', 'en'],
        ['a third language', 'fr', 'عندي عيادة أسنان', 'fr'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui, text)).toBe(expected);
    });

    it.each([
        ['no UI, Arabic request', undefined, 'عندي عيادة أسنان. بدي جدول', 'ar'],
        ['no UI, English request', '', 'Build me a table for my clients', 'en'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui as string | undefined, text)).toBe(expected);
    });

    it('the UI language reaches the run entrypoint and AgentLoop', () => {
        const joe = readSource('../../../web/src/pages/Joe.tsx');
        const route = readSource('../api/routes/run.ts');
        const loop = readSource('../modules/services/AgentLoopService.ts');
        const reactProject = readSource('../modules/tools/definitions/ReactProjectTool.ts');
        expect(joe).toContain('language: i18n.language');
        expect(route).toContain('const uiLanguage =');
        expect(route).toContain('language: uiLanguage');
        expect(loop).toContain('const gateLang = replyLanguageCode(options.language, goal);');
        expect(loop).toContain('const language0 = replyLanguageCode(options.language, goal);');
        expect(reactProject).toContain("import { replyLanguageCode } from '../../../shared/reply-language';");
        expect(reactProject).toContain('template classification: page=');
        expect(reactProject).toContain('lang=${replyLang} (ui=${uiLang || \'absent\'})');
    });

    it.each([
        ['en over Arabic text', 'en', 'عندي عيادة أسنان'],
        ['ar over English text', 'ar', 'Build me a table'],
        ['no UI, Arabic text', '', 'عندي عيادة أسنان'],
        ['no UI, English text', '', 'Build me a table'],
    ])('%s: isArabicReply and replyLanguageCode agree', (_label, ui, text) => {
        expect(isArabicReply({ language: ui, text })).toBe(replyLanguageCode(ui, text) === 'ar');
    });
});
