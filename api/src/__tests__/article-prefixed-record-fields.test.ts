import { isJudgeable, verifyNamed } from '../core/quality/named-requirements';

const schema = `const fields = [
  { key: 'title', label: 'title', type: 'text' },
  { key: 'borrower', label: 'borrower', type: 'text' },
  { key: 'due', label: 'due date', type: 'date' }
];`;

describe('natural-language field articles and execution instructions', () => {
    it('proves article-prefixed fields without asking a model', async () => {
        const call = jest.fn(async () => '{}');
        const requirements = ['a title', 'a borrower', 'a due date'].map(text => ({ id: text, text, quote: text }));
        const verdicts = await verifyNamed(requirements, schema, false, call);
        expect(verdicts.map(item => item.verdict)).toEqual(['met', 'met', 'met']);
        expect(call).not.toHaveBeenCalled();
    });

    it('does not prove a date contract from a text field with the same label', async () => {
        const text = 'a due date';
        const verdicts = await verifyNamed([{ id: 'due', text, quote: text }],
            schema.replace("type: 'date'", "type: 'text'")
                .replace('];', ", { label: 'another date', type: 'date' }];"), false, async () => '{}');
        expect(verdicts[0].verdict).not.toBe('met');
    });

    it('preserves a literal label beginning with an article', async () => {
        const text = 'A title';
        const call = jest.fn(async () => '{}');
        const verdicts = await verifyNamed([{ id: 'literal', text, quote: text }],
            "const fields = [{ label: 'A title', type: 'text' }];", false, call);
        expect(verdicts[0].verdict).toBe('met');
        expect(call).not.toHaveBeenCalled();
    });

    test.each(['focused checks while editing', 'targeted tests during development'])(
        'keeps %s out of artifact requirements', text => expect(isJudgeable(text)).toBe(false));

    it('does not discard a requested product surface for editing checks', () => {
        expect(isJudgeable('A panel for focused checks while editing')).toBe(true);
    });
});
