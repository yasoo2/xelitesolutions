/**
 * A model's JSON reply with one raw line break inside a string is read, not
 * thrown away.
 *
 * P001 (run500, 2026-10-27, run-1793116203492): react_project spent six model
 * calls (8 to 31 minutes each) authoring the page's sections, and four were
 * refused «the reply held no usable file». The same Cta prompt, sent again to
 * the same local model, answered `{"files":{"Cta":"…"}}`, a 7.6 KB file with
 * every line break escaped as \n except one:
 *     SyntaxError: Bad control character in string literal … (line 3 column 4560)
 * With the fix that reply parses and its Cta passes validateAuthored as it is.
 * Only the model call is substituted here; the readers and the validator are
 * the real code.
 */
import { parseFirstJson, parseModelJson, escapeControlCharsInStrings } from '../shared/utils/json';
import { parseAuthored, authorComponents, type AuthoringSpec } from '../core/design/authored-ui';
import { parseCopy } from '../core/design/authored-copy';
import { parseRows } from '../core/design/authored-catalogue';
import { composeDesign } from '../core/design/composer';

const KEYS = ['brand', 'heroTitle', 'heroLede', 'cta'];

const HERO = `import React from 'react';

export default function Hero({ content }) {
  return (
    <header className="wrap" style={{ paddingBlock: 'var(--section-space)' }}>
      <p className="eyebrow">{content.brand}</p>
      <h1 style={{ maxWidth: 'var(--measure)' }}>{content.heroTitle}</h1>
      <p className="lede">{content.heroLede}</p>
      <a className="btn" href="#contact">{content.cta}</a>
    </header>
  );
}
`;

/** What the model really sent: valid JSON escaping everywhere but one line break. */
const slipped = (name: string, code: string) => {
    const escaped = JSON.stringify(code);
    const at = escaped.indexOf('\\n', escaped.indexOf('<h1'));
    return `{"files":{"${name}":${escaped.slice(0, at)}\n${escaped.slice(at + 2)}}}`;
};

const spec = (): AuthoringSpec => ({
    request: 'اعمل موقع تعريفي احترافي لعيادة أسنان',
    brand: 'عيادة الابتسامة',
    isArabic: true,
    components: ['Hero'],
    contentKeys: KEYS,
    genome: composeDesign('اعمل موقع تعريفي احترافي لعيادة أسنان'),
    tokens: ['--brand', '--measure', '--section-space'],
});

describe('a raw line break inside a reply string is read as a line break', () => {
    it('the authored section reaches the page instead of «no usable file»', async () => {
        const reply = slipped('Hero', HERO);
        expect(() => JSON.parse(reply)).toThrow(/control character/i);
        expect(parseAuthored(reply)).toEqual({ Hero: HERO });
        const r = await authorComponents(spec(), async () => reply);
        expect(r.rejected).toEqual([]);
        expect(r.files.Hero).toBe(HERO.trim() + '\n');
    });

    it('every reader of a model JSON reply recovers the same slip', () => {
        expect(parseFirstJson('{"plan":"line one\nline two\tend"}')).toEqual({ plan: 'line one\nline two\tend' });
        expect(parseCopy('```json\n{"fields":{"heroLede":"سطر أول\nسطر ثانٍ"}}\n```')).toEqual({ heroLede: 'سطر أول\nسطر ثانٍ' });
        expect(parseRows('{"rows":[{"name":"تنظيف\r\nالأسنان"}]}')).toEqual([{ name: 'تنظيف\r\nالأسنان' }]);
    });

    it('nothing else is guessed: text outside strings, escapes and broken JSON stay as they were', () => {
        // Line breaks between tokens are already valid and are not touched.
        expect(escapeControlCharsInStrings('{\n  "a": "x"\n}')).toBe('{\n  "a": "x"\n}');
        // An escaped quote or backslash does not end or start a string.
        expect(escapeControlCharsInStrings('{"a":"say \\"hi\\"\nok","b":"c:\\\\"}')).toBe('{"a":"say \\"hi\\"\\nok","b":"c:\\\\"}');
        expect(parseModelJson('{"a":"\u0001"}')).toEqual({ a: '\u0001' });
        // A reply that is still not JSON after the repair stays refused.
        expect(() => parseModelJson('{"files":{"Hero":"cut off')).toThrow();
        expect(parseFirstJson('{"a": nope}')).toBeNull();
        expect(parseAuthored('{"files":{"Hero": nope\n}}')).toEqual({});
    });
});
