import { isUnansweredExplanation } from '../core/llm/concise-answer-prompt';

describe('explanation requests need an answer rather than a whole question restatement', () => {
    test.each([
        ['Explain why parameterized SQL queries are safer. Answer in Arabic. Reply with one sentence.', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0639\u062a\u0628\u0631 SQL \u0623\u0643\u062b\u0631 \u0622\u0645\u0627\u0646\u064b\u0627\u061f'],
        ['Explain how a variable stores a value. Answer in English.', 'How does a variable store a value?'],
        ['Please explain why threads share memory.', 'Why do threads share memory?'],
        ['Why are integration tests useful?', 'Why are integration tests useful?'],
        ['Answer in Arabic. Explain why validation matters.', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642\u061f'],
        ['\u0627\u0634\u0631\u062d \u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642.', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642\u061f'],
        ['Explain why caching helps.', '**Why does caching help?**'],
        ['Explain why translation is useful.', 'Why is translation useful?'],
        ['Explain what the FAQ section contains.', 'What does the FAQ section contain?'],
        ['Explain how rephrasing improves clarity.', 'How does rephrasing improve clarity?'],
        ['Do explain why validation matters.', 'Why does validation matter?'],
        ['Explain how a variable works.', 'How does a\nvariable work?'],
        ['Explain why a label matters.', 'Why does ' + 'a label '.repeat(280) + 'matter?'],
        ['Explain why SQLite stores rows.', 'Why does `SQLite` store rows?'],
        ['Explain why this URL uses HTTPS.', 'Why does https://example.test use HTTPS?'],
    ])('detects a generic question-only reply: %s', (question, reply) => {
        expect(isUnansweredExplanation(question, reply)).toBe(true);
    });
    test.each([
        ['Explain why validation matters.', 'Validation catches invalid input before it changes stored data.'],
        ['Explain why validation matters.', '\u064a\u0645\u0646\u0639 \u0627\u0644\u062a\u062d\u0642\u0642 \u062a\u062e\u0632\u064a\u0646 \u0628\u064a\u0627\u0646\u0627\u062a \u062e\u0627\u0637\u0626\u0629.'],
        ['Explain why validation matters.', 'Why validate? Because it catches malformed input.'],
        ['Explain a question mark.', 'The symbol is `?`.'],
        ['Explain the heading.', 'The heading is "Why?".'],
        ['Explain the URL.', 'The URL is https://example.test/search?q=why?'],
        ['Translate this question into Arabic: "Why does caching help?"', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0633\u0627\u0639\u062f \u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0645\u0624\u0642\u062a\u061f'],
        ['Rewrite this as a polite question: why does caching help?', 'Could you explain why caching helps?'],
        ['Write one clarifying question about the requirements.', 'Which users need access?'],
        ['Explain the context internally, but return only one clarifying question.', 'What should happen when the input is empty?'],
        ['Write FAQ questions without answers about caching.', 'Why does caching help?'],
        ['Do not explain why caching helps. Write a question only.', 'Why does caching help?'],
        ["Don't explain why caching helps. Write a question only.", 'Why does caching help?'],
        ['Never explain why caching helps; write a question only.', 'Why does caching help?'],
        ['The quote "Explain why caching helps" is an example. Write a question.', 'Why does caching help?'],
        ['The code is `Explain why caching helps`. Write a question.', 'Why does caching help?'],
        ['\u0644\u0627 \u062a\u0634\u0631\u062d \u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642\u060c \u0627\u0643\u062a\u0628 \u0633\u0624\u0627\u0644\u064b\u0627 \u0641\u0642\u0637.', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642\u061f'],
        ['Explain numeric output.', '42'],
        ['Explain numeric output.', ''],
        ['Translate the question Why does caching help? into Arabic.', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0633\u0627\u0639\u062f \u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0645\u0624\u0642\u062a\u061f'],
        ['Explain the context. ' + 'context '.repeat(300) + '. Translate this question into Arabic: Why does caching help?', '\u0644\u0645\u0627\u0630\u0627 \u064a\u0633\u0627\u0639\u062f \u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0645\u0624\u0642\u062a\u061f'],
        ['The quote "' + 'Explain why it matters '.repeat(30) + '" is context only.', 'Why does it matter?'],
        ['\u062a\u0631\u062c\u0645 \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u062a\u0627\u0644\u064a: \u0644\u0645\u0627\u0630\u0627 \u064a\u0647\u0645 \u0627\u0644\u062a\u062d\u0642\u0642\u061f', 'Why does validation matter?'],
        ['Explain the context. Do not answer. Write one clarifying question.', 'What should happen next?'],
    ])('does not reject legitimate content or requested questions: %s', (question, reply) => {
        expect(isUnansweredExplanation(question, reply)).toBe(false);
    });
});
