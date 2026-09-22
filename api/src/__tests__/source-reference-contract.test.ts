import { undefinedSourceReferenceMismatch as check } from '../core/quality/source-contract';

describe('generated JSX reference contract', () => {
    it('catches missing helpers inside event handlers before the user clicks', () => {
        expect(check('View.jsx', 'export default function View({fields,setDraft}) { return <button onClick={() => setDraft(blank(fields))}>Cancel</button> }'))
            .toMatch(/source_reference_mismatch.*blank/);
    });
    it.each([
        'import { blank } from "./controller.js"; export default function View({fields}) { return <button onClick={() => blank(fields)}>Cancel</button> }',
        'export default function View({rows}) { const f = ({name}) => name; return <div>{rows.map(row => f(row))}</div> }',
        'export default function View() { return <button onClick={() => { const url = new URL(location.href); window.alert(JSON.stringify(url)); }}>Open</button> }',
        'interface Props { rows: string[] } export default function View({rows}: Props) { return <div>{rows.map((row, i) => <span key={i}>{row}</span>)}</div> }',
    ])('accepts declared scopes, imports and browser globals', source => {
        expect(check('View.tsx', source)).toBeNull();
    });
    it('does not confuse a sibling scope declaration with a binding', () => {
        expect(check('View.jsx', 'function other(){ const missing = 1; } export default function View(){ return <div>{missing}</div> }')).toMatch(/missing/);
    });
    it('catches object shorthand references', () => {
        expect(check('View.jsx', 'export default function View(){ const data = {missing}; return <div>{data.missing}</div> }')).toMatch(/missing/);
    });
    it('does not inspect unrelated artifacts', () => {
        expect(check('notes.md', 'missing(words)')).toBeNull();
    });
    it.each(['@ts-nocheck', '@ts-ignore', '@ts-expect-error'])('does not allow %s to bypass the gate', directive => {
        expect(check('View.jsx', `// ${directive}\nexport default function View(){ return <div>{missing}</div> }`)).toMatch(/must not suppress/);
    });
    it('does not mistake a string for a suppression comment', () => {
        expect(check('View.jsx', 'const text = "// @ts-ignore"; export default function View(){ return <div>{text}</div> }')).toBeNull();
    });
});
