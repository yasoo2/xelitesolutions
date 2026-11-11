import { safeComponent } from '../core/quality/model-round';

/**
 * Round 21 review, group 3 #6: model-round's component gate still cut
 * esbuild's message to 80 characters — its header, «Transform failed with 1
 * error:», and at most the start of the line after it — so the refusal never
 * said where or what. It now reads the parser's located errors, as every other
 * reader does (parserDiagnosis).
 */
const PREVIOUS = 'export default function Counter() {\n  return <button className="count">0</button>;\n}\n';

describe('a component repair the parser rejects is refused with the parser\'s located words', () => {
    it('names the line, the column and what the parser expected', () => {
        const broken = 'export default function Counter() {\n  const n = 1;\n  return <button className="count">{n + }</button>;\n}\n';
        const why = String(safeComponent(broken, PREVIOUS).why);
        expect(why).toMatch(/^does not parse \(line 3, column \d+: /u);
        expect(why).toContain('Unexpected "}"');
        expect(why).toContain('at `return <button className="count">{n + }</button>;`');
        expect(why).not.toMatch(/Transform failed/u);
    });

    it('a component that parses passes the gate', () => {
        expect(safeComponent('export default function Counter() {\n  return <button className="count" onClick={() => 1}>0</button>;\n}\n', PREVIOUS)).toMatchObject({ ok: true });
    });
});
