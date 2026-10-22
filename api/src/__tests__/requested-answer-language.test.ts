import { resolveRequestedAnswerLanguage } from '../core/llm/requested-answer-language';

describe('standalone answer-language headers', () => {
    it.each([
        ['بالعربية فقط: ما الفرق بين اختبار الوحدة والاختبار التكاملي؟ أعط مثالًا صغيرًا لكل منهما في أربع جمل.', 'en', 'ar'],
        ['باللغة العربية: ما نتيجة جمع خمسة وثلاثة؟', 'en-US', 'ar'],
        ['بالإنجليزية فقط: ما معنى اختبار الوحدة؟', 'ar', 'en'],
        ['تفاصيل المهمة\n  بالعربية: ما الفرق بين الاختبارين؟', 'en', 'ar'],
        ['The variable بالعربية فقط: appears here.', 'en', 'en'],
        ['لا بالعربية فقط: ما الفرق؟', 'en', 'en'],
        ['"بالعربية فقط:" ما الفرق؟', 'en', 'en'],
        ['`بالعربية فقط:` ما الفرق؟', 'en', 'en'],
        ['بالعربية فقط ما الفرق؟', 'en', 'en'],
        ['بالعربية:\nبالإنجليزية: ما الفرق؟', 'en', 'en'],
        ['بالعربية:\nبالإنجليزية: ما الفرق؟', 'fr', 'fr'],
    ])('resolves header boundaries in %s', (question, uiLanguage, expected) => {
        expect(resolveRequestedAnswerLanguage(question, uiLanguage)).toBe(expected);
    });
});

describe('explicit bounded word-language directives', () => {
    it.each([
        ['Reply with one Arabic word.', 'en', 'ar'],
        ['Answer in a single English word.', 'ar', 'en'],
        ['Respond with exactly one short Arabic word.', 'en-US', 'ar'],
        ['Do not reply with one Arabic word.', 'en', 'en'],
        ['Explain why John and Mary reply with one Arabic word.', 'en', 'en'],
        ['The quoted phrase is "Reply with one Arabic word".', 'en', 'en'],
        ['The code is `Reply with one Arabic word`.', 'en', 'en'],
        ['Reply with one Arabic word. Then reply with one English word.', 'en', 'en'],
    ])('resolves %s with UI %s', (question, uiLanguage, expected) => {
        expect(resolveRequestedAnswerLanguage(question, uiLanguage)).toBe(expected);
    });
});

// Runner provides describe/it/expect globals (Jest / Vitest globals mode).

describe('resolveRequestedAnswerLanguage', () => {
    it('prefers an explicit Arabic directive over an English UI (reported defect)', () => {
        expect(
            resolveRequestedAnswerLanguage(
                'اشرح الفرق بين المتغير والثابت في البرمجة بجملتين عربيتين قصيرتين.',
                'en',
            ),
        ).toBe('ar');
    });

    it('prefers an explicit English directive over an Arabic UI', () => {
        expect(
            resolveRequestedAnswerLanguage('اشرح المتغير لكن أجب بجملتين إنجليزيتين فقط.', 'ar'),
        ).toBe('en');
    });

    it('honors an English-phrased answer-in-Arabic request under an English UI', () => {
        expect(
            resolveRequestedAnswerLanguage('Please answer in Arabic: what is a variable?', 'en'),
        ).toBe('ar');
    });

    it('honors an English-phrased respond-in-English request under an Arabic UI', () => {
        expect(resolveRequestedAnswerLanguage('Please respond in English: ما هو الثابت؟', 'ar')).toBe(
            'en',
        );
    });

    it('honors باللغة العربية as an explicit Arabic directive', () => {
        expect(
            resolveRequestedAnswerLanguage('اشرح المتغير باللغة العربية من فضلك.', 'en'),
        ).toBe('ar');
    });

    it('does not switch on a bare mention of the word Arabic', () => {
        expect(resolveRequestedAnswerLanguage('What does the word Arabic mean?', 'en')).toBe('en');
    });

    it('does not switch on comparing Arabic and English as topics', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain the difference between Arabic and English.', 'en'),
        ).toBe('en');
    });

    it('ignores a negated Arabic directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Do not answer in Arabic, explain the variable plainly.', 'en'),
        ).toBe('en');
    });

    it('ignores a quoted directive used as data, not a command', () => {
        expect(
            resolveRequestedAnswerLanguage('He wrote "answer in Arabic" in his notes; explain variables.', 'en'),
        ).toBe('en');
    });

    it('ignores a backtick-quoted directive used as a code token', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain the token `answer in Arabic` in this snippet.', 'en'),
        ).toBe('en');
    });

    it('keeps an ordinary Arabic question in English when the UI is English', () => {
        expect(resolveRequestedAnswerLanguage('ما هو المتغير في البرمجة؟', 'en')).toBe('en');
    });

    it('falls back to the question script when no UI language is present', () => {
        expect(resolveRequestedAnswerLanguage('ما هو المتغير في البرمجة؟')).toBe('ar');
        expect(resolveRequestedAnswerLanguage('What is a variable?')).toBe('en');
    });

    it('normalizes regional UI tags to their primary subtag', () => {
        expect(resolveRequestedAnswerLanguage('What is a variable?', 'en-US')).toBe('en');
        expect(resolveRequestedAnswerLanguage('What is a variable?', 'ar-EG')).toBe('ar');
    });

    it('does not let an unrelated negation in an earlier sentence cancel a later Arabic directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Do not use jargon. Answer in Arabic.', 'en'),
        ).toBe('ar');
    });

    it('honors a later-sentence English directive after a negated Arabic directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Do not answer in Arabic. Answer in English.', 'ar'),
        ).toBe('en');
    });

    it('does not treat English sentences as a topic as an output directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain two short Arabic sentences used in greetings.', 'en'),
        ).toBe('en');
    });

    it('does not treat an Arabic content mention as an output directive', () => {
        expect(
            resolveRequestedAnswerLanguage('ما معنى عبارة مكتوبة باللغة العربية؟', 'en'),
        ).toBe('en');
    });

    it('does not treat a noun mention of the answer in Arabic as a directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why the answer in Arabic is longer.', 'en'),
        ).toBe('en');
    });

    it('does not treat a noun mention of the reply in English as a directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Describe the reply in English.', 'ar'),
        ).toBe('ar');
    });

    it('does not treat an embedded whether-clause as an output directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain whether we should answer in Arabic.', 'en'),
        ).toBe('en');
    });

    it('honors a bare imperative Arabic directive', () => {
        expect(resolveRequestedAnswerLanguage('Answer in Arabic.', 'en')).toBe('ar');
    });

    it('honors a polite English directive under an Arabic UI', () => {
        expect(resolveRequestedAnswerLanguage('Please reply in English.', 'ar')).toBe('en');
    });

    it('honors a second-person modal Arabic directive', () => {
        expect(resolveRequestedAnswerLanguage('You should answer in Arabic.', 'en')).toBe('ar');
    });

    it('does not switch on a single-quoted directive mention', () => {
        expect(resolveRequestedAnswerLanguage("What does 'answer in Arabic' mean?", 'en')).toBe(
            'en',
        );
    });

    it('honors a coordinate directive after an earlier why-clause (comma + then)', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why Python is popular, then answer in Arabic.', 'en'),
        ).toBe('ar');
    });

    it('honors a coordinate directive after an earlier how-clause (and)', () => {
        expect(
            resolveRequestedAnswerLanguage('Tell me how lists work and answer in Arabic.', 'en'),
        ).toBe('ar');
    });

    it('honors a but-coordinated directive after an earlier why-clause', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why Python is popular, but answer in Arabic.', 'en'),
        ).toBe('ar');
    });

    it('still blocks a same-clause how-topic without coordination', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain how the answer in Arabic works.', 'en'),
        ).toBe('en');
    });

    it('still blocks a same-clause why + first-person topic without coordination', () => {
        expect(
            resolveRequestedAnswerLanguage('Tell me why we should answer in Arabic.', 'en'),
        ).toBe('en');
    });

    it('does not let coordination rescue a noun mention of the answer', () => {
        expect(
            resolveRequestedAnswerLanguage(
                'Explain why Python is popular, then the answer in Arabic is longer.',
                'en',
            ),
        ).toBe('en');
    });

    it('honors an explain-in-sentences output format adjunct', () => {
        expect(resolveRequestedAnswerLanguage('Explain in two Arabic sentences.', 'en')).toBe(
            'ar',
        );
    });

    it('honors the mirrored English sentences format adjunct under an Arabic UI', () => {
        expect(resolveRequestedAnswerLanguage('Explain in two English sentences.', 'ar')).toBe(
            'en',
        );
    });

    it('does not treat a bare Arabic topic with only فقط as a directive', () => {
        expect(
            resolveRequestedAnswerLanguage('The variable بالعربية فقط appears here.', 'en'),
        ).toBe('en');
    });

    it('still honors an Arabic verb directive that also uses فقط', () => {
        expect(resolveRequestedAnswerLanguage('اشرح المتغير بالعربية فقط.', 'en')).toBe('ar');
    });

    it('does not treat a negative modal contraction as a command', () => {
        expect(resolveRequestedAnswerLanguage("You shouldn't answer in Arabic.", 'en')).toBe(
            'en',
        );
    });

    it('honors the positive modal counterpart as a directive', () => {
        expect(resolveRequestedAnswerLanguage('You must answer in Arabic.', 'en')).toBe('ar');
    });

    it('does not treat must-not as a command', () => {
        expect(resolveRequestedAnswerLanguage('You must not reply in Arabic.', 'en')).toBe(
            'en',
        );
    });

    it('does not treat another negative modal contraction as a command', () => {
        expect(resolveRequestedAnswerLanguage("You can't answer in Arabic.", 'en')).toBe('en');
    });

    it('does not treat a coordinated subject inside a why-topic as a directive', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why John and Mary answer in Arabic.', 'en'),
        ).toBe('en');
    });

    it('still blocks the uncoordinated why-topic counterpart', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why they answer in Arabic.', 'en'),
        ).toBe('en');
    });

    it('honors possessive answer phrasing with directive framing', () => {
        expect(resolveRequestedAnswerLanguage('Give your answer in Arabic.', 'en')).toBe('ar');
    });

    it('still blocks possessive answer phrasing inside a subordinate topic', () => {
        expect(
            resolveRequestedAnswerLanguage('Explain why your answer in Arabic is longer.', 'en'),
        ).toBe('en');
    });
});

describe('Arabic definition output framing', () => {
    it.each([
        ['عرّف مشروع البرمجيات بالعربية بجملة واحدة.', 'en', 'ar'],
        ['عرف قاعدة البيانات باللغة العربية.', 'en', 'ar'],
        ['عرّف المتغير باللغة الإنجليزية.', 'ar', 'en'],
        ['ماذا يعني يعرف بالعربية؟', 'en', 'en'],
        ['تعريف باللغة العربية موضوع نحوي.', 'en', 'en'],
        ['لا تعرّف المتغير بالعربية.', 'en', 'en'],
        ['العبارة "عرّف المتغير بالعربية" مثال.', 'en', 'en'],
    ])('keeps definition versus topic/negative/quoted boundary for %s', (question, ui, expected) => {
        expect(resolveRequestedAnswerLanguage(question, ui)).toBe(expected);
    });
});

describe('Arabic negation word boundary', () => {
    it.each([
        ["اشرح لي معنى مدخلات المستخدم بالعربية بجملة واحدة.", "en", "ar"],
        ["اشرح أثر الإعلانات بالعربية.", "en", "ar"],
        ["اشرح معنى مدونة باللغة العربية.", "en", "ar"],
        ["اشرح مدخلات المستخدم لكن لا ترد بالعربية.", "en", "en"],
        ["لاترد بالعربية.", "en", "en"],
    ])('distinguishes negation from embedded letters for %s', (question, ui, expected) => {
        expect(resolveRequestedAnswerLanguage(question, ui)).toBe(expected);
    });
});

describe('fused negative output verb persons', () => {
    it.each(["من فضلك لايرد باللغة العربية.", "من فضلك لانرد باللغة العربية.", "من فضلك لااكتب باللغة العربية."])('does not turn %s into an Arabic output request', question => {
        expect(resolveRequestedAnswerLanguage(question, 'en')).toBe('en');
    });
});
