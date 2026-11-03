import { diagnoseAnswerScriptIssue, hasUnrequestedAnswerScript, arabicShare } from '../shared/utils/language';

const ar = (answer: string, question = 'Explain in Arabic.') => hasUnrequestedAnswerScript(answer, question, 'ar');

describe('unrequested script in answer prose', () => {
    test('the preserved live defect is rejected despite the old ratio passing', () => {
        const answer = '\u0627\u0644\u0627\u0633\u062a\u0639\u0644\u0627\u0645\u0627\u062a SQL \u0622\u0645\u0646\u0629\u5f97\u591a \u0644\u0623\u0646\u0647\u0627 \u062a\u0641\u0635\u0644 \u0627\u0644\u0643\u0648\u062f \u0639\u0646 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.';
        expect(arabicShare(answer)).toBeGreaterThan(0.35);
        expect(ar(answer)).toBe(true);
    });
    test.each(['\u4f60\u597d', '\u041f\u0440\u0438\u0432\u0435\u0442', '\u03ba\u03cc\u03c3\u03bc\u03bf\u03c2', '\u3053\u3093\u306b\u3061\u306f', '\u0928\u092e\u0938\u094d\u0924\u0947'])('a different foreign script is detected: %s', foreign => {
        expect(ar('\u0622\u0645\u0646\u0629' + foreign + ' SQL.')).toBe(true);
    });
    test.each(['\u062a\u062d\u0641\u0638 SQLite \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.', '\u0750\u0870\ufb8e', '\u0634\u0631\u062d na\u00efve caf\u00e9 SQL', '123 \u0661\u0662\u0663 \ud83d\ude00 + = \u20ac', ''])('allowed Arabic, Latin and nonletters are retained: %s', answer => {
        expect(ar(answer)).toBe(false);
    });
    test('unknown targets retain prior behavior and regional tags normalize', () => {
        expect(hasUnrequestedAnswerScript('\u4f60\u597d', '', 'zh')).toBe(false);
        expect(hasUnrequestedAnswerScript('\u0622\u0645\u0646\u0629\u4f60\u597d', '', 'ar-EG')).toBe(true);
        expect(hasUnrequestedAnswerScript('Clean caf\u00e9.', '', 'en-US')).toBe(false);
    });
    test.each(['\u4f60\u597d', '\u041f\u0440\u0438\u0432\u0435\u0442', '\u0646\u0639\u0645'])('English prose detects foreign letters: %s', foreign => {
        expect(hasUnrequestedAnswerScript('Clean ' + foreign + ' answer.', 'Explain in English.', 'en')).toBe(true);
    });
    test('exact supplied foreign literal is retained without allowing an entire script', () => {
        const question = 'Explain the term "\u4f60\u597d" in Arabic.';
        expect(ar('\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d" \u062a\u062d\u064a\u0629.', question)).toBe(false);
        expect(ar('\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d" \u062a\u062d\u064a\u0629\u5f97\u591a.', question)).toBe(true);
        expect(ar('\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d\u518d\u89c1".', question)).toBe(true);
    });
    test('one supplied letter does not exempt a longer foreign token', () => {
        expect(ar('\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d".', 'Explain "\u4f60" in Arabic.')).toBe(true);
    });
    test.each(['"\u5f97\u591a"', "'\u5f97\u591a'", '\u00ab\u5f97\u591a\u00bb'])('model-added quotes are not an exemption: %s', quoted => {
        expect(ar('\u0622\u0645\u0646\u0629 ' + quoted + '.')).toBe(true);
    });
    test('complete code, identifiers, URLs and file paths keep technical content', () => {
        expect(ar('\u0645\u062b\u0627\u0644 `const \u540d\u79f0 = 1;` \u064a\u0639\u0645\u0644.')).toBe(false);
        expect(ar('\u0645\u062b\u0627\u0644\n```ts\nconst \u540d\u79f0 = "\u4f60\u597d";\n```\n\u064a\u0639\u0645\u0644.')).toBe(false);
        expect(ar('\u0631\u0627\u062c\u0639 https://example.test/\u6587\u6863 \u0648 C:\\code\\\u540d\u79f0.ts')).toBe(false);
    });
    test('unfinished code markers cannot hide the remainder of the answer', () => {
        expect(ar('\u0645\u062b\u0627\u0644 `\u5f97\u591a')).toBe(true);
        expect(ar('\u0645\u062b\u0627\u0644\n```ts\n\u5f97\u591a')).toBe(true);
    });
    test('technical exemptions do not exempt neighboring unrelated prose', () => {
        expect(ar('`const \u540d\u79f0 = 1;` \u0622\u0645\u0646\u0629\u5f97\u591a')).toBe(true);
    });
    test('the shared Arabic-ratio contract remains unchanged', () => {
        expect(arabicShare('ASCII')).toBe(0);
        expect(arabicShare('\u0646\u0639\u0645')).toBe(1);
        expect(arabicShare('')).toBe(0);
    });
    test('answers beyond either scan budget fail instead of accepting an unchecked suffix', () => {
        expect(ar('a'.repeat(20001) + '\u5f97\u591a')).toBe(true);
        expect(ar('a '.repeat(3001) + '\u5f97\u591a')).toBe(true);
    });
    test('many ordinary question tokens do not consume the exact-foreign-literal allowance', () => {
        expect(ar('\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d".', 'ordinary '.repeat(900) + 'Explain "\u4f60\u597d" in Arabic.')).toBe(false);
    });
});


describe('content-free script rejection diagnosis', () => {
    test.each([
        ['clean technical prose', 'SQLite data.', 'Explain in Arabic.', 'ar', 'none'],
        ['unknown language', '你好', '', 'zh', 'none'],
        ['unrequested letters', 'آمنة你好 SQL.', 'Explain in Arabic.', 'ar', 'unrequested_letter'],
        ['over character boundary', 'a'.repeat(20001), '', 'en', 'answer_length_limit'],
        ['at character boundary', 'a'.repeat(20000), '', 'en', 'none'],
        ['over token boundary', 'a '.repeat(3001), '', 'en', 'answer_token_limit'],
        ['at token boundary', 'a '.repeat(3000), '', 'en', 'none'],
        ['exact user literal', 'المصطلح "你好".', 'Explain "你好" in Arabic.', 'ar', 'none'],
        ['empty output', '', '', 'ar', 'none'],
        ['English target', 'Clean café.', '', 'en', 'none'],
    ])('%s returns only its fixed diagnosis code', (_name, answer, question, lang, expected) => {
        expect(diagnoseAnswerScriptIssue(answer, question, lang)).toBe(expected);
    });
});
