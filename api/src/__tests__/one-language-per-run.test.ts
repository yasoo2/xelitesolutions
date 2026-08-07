/**
 * «عند وضع بروميت بالانجليزية … يجب ان تكون النتيجة والذكاء العصبي كلها
 *  انجليزية، وعندما نغير الى لغه اخرى … في نفس اللغه التي تم ارسال البروميت فيها»
 *
 * His trace, on an English prompt in English mode:
 *
 *     جاري تنفيذ: api project…
 *     🗄️ Building a real backend with a database: MyApp
 *
 * The rule had existed for months — inside each build tool, copy-pasted. The
 * neural trace never got a copy, so it spoke Arabic to everyone.
 *
 * Measured live in verify_one_language_per_run.ts (8/8): an English run emits
 * «Running: api project…» and not one Arabic character; an Arabic run emits
 * not one English sentence.
 */
import fs from 'fs';
import path from 'path';
import { isArabicReply, say } from '../shared/reply-language';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('one rule, in one file', () => {
    it('the interface setting wins over the script of the words', () => {
        expect(isArabicReply({ language: 'en-US', text: 'ابنِ متجراً' })).toBe(false);
        expect(isArabicReply({ language: 'ar', text: 'build a store' })).toBe(true);
        expect(isArabicReply({ language: 'ar-SA' })).toBe(true);
    });

    it('and with no setting, the words themselves decide', () => {
        expect(isArabicReply({ text: 'ابنِ متجراً' })).toBe(true);
        expect(isArabicReply({ text: 'build me a store' })).toBe(false);
        expect(isArabicReply('نظام')).toBe(true);
        expect(isArabicReply(undefined)).toBe(false);
    });

    it('say() is the whole helper — no third spelling of the choice', () => {
        expect(say(true, 'نعم', 'yes')).toBe('نعم');
        expect(say(false, 'نعم', 'yes')).toBe('yes');
    });
});

describe('the neural trace speaks the language of the request', () => {
    const TS = () => read('modules', 'services', 'ToolService.ts');

    it('the status block asks the shared rule instead of assuming', () => {
        const t = TS();
        expect(t).toMatch(/import \{ isArabicReply, say \} from '\.\.\/\.\.\/shared\/reply-language';/);
        expect(t).toMatch(/const isAr = isArabicReply\(\{\n?\s*language: \(context as any\)\?\.language,/);
    });

    it('and «جاري تنفيذ» has an English twin — the exact line from his log', () => {
        const t = TS();
        expect(t).toMatch(/say\(isAr, `جاري تنفيذ: \$\{pretty\}…`, `Running: \$\{pretty\}…`\)/);
        expect(t).toMatch(/say\(isAr, 'جاري التنفيذ…', 'Running…'\)/);
    });

    it('every one of the ten tool sentences is a pair, not a constant', () => {
        // The block used to be ten bare Arabic strings.
        const t = TS();
        const block = t.slice(t.indexOf("let status = '';"), t.indexOf("broadcastThinkingPhase(contextSessionId"));
        const bare = block.match(/status = '[^']*[؀-ۿ][^']*'/g) || [];
        expect(bare).toEqual([]);
        expect((block.match(/say\(isAr,/g) || []).length).toBeGreaterThanOrEqual(10);
    });
});

describe('and so does every other thing that narrates', () => {
    const files: Array<[string, string[]]> = [
        ['modules/tools/definitions/PageFixTool.ts', ['Opening the page and measuring']],
        ['modules/tools/definitions/ProjectUndoTool.ts', ['Rolling the project back']],
        ['modules/tools/definitions/UiFixTool.ts', ['Measuring the interface before the repair', 'Repairing the source itself']],
        ['orchestration/AgentOrchestrator.ts', ['independent steps — running them together', 'the repair that worked before']],
    ];

    for (const [file, phrases] of files) {
        it(`${file.split('/').pop()} narrates in both`, () => {
            const src = read(...file.split('/'));
            expect(src).toContain('reply-language');
            for (const p of phrases) expect(src).toContain(p);
        });
    }

    it('and no thinking broadcast is left Arabic-only', () => {
        const roots = ['modules/tools/definitions', 'modules/services', 'orchestration'];
        const offenders: string[] = [];
        for (const root of roots) {
            const dir = path.join(SRC, root);
            for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.ts'))) {
                for (const line of fs.readFileSync(path.join(dir, f), 'utf-8').split('\n')) {
                    if (!/broadcastThinking(Detail|Phase)\(/.test(line)) continue;
                    if (!/[؀-ۿ]/.test(line)) continue;
                    if (/isAr|isArabic|say\(|\? '|: '/.test(line)) continue;
                    offenders.push(`${f}: ${line.trim().slice(0, 70)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
