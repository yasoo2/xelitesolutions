import { detectAppKind, blueprintFor } from '../core/design/app-blueprints';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

const CALCPRO_REQUEST = `Build a mobile-responsive calculator application called "CalcPro" with the following requirements:
- Basic arithmetic: addition, subtraction, multiplication, division
- Decimal point support
- Percentage calculation
- Sign toggle (positive/negative)
- Clear (AC) and Delete (backspace) buttons
- Calculation history (last 10 operations)
- Division by zero error handling with user-friendly message
- Light and dark mode toggle
- Mobile-first responsive design
- All operations must work correctly and be tested
Build it completely, run it, and verify it works.`;

describe('calculator requests are routed to a real application engine', () => {
    it('detects CalcPro as calculator rather than presentation', () => {
        expect(detectAppKind(CALCPRO_REQUEST)).toBe('calculator');
    });

    it('uses a calculator blueprint with no records fallback', () => {
        const bp = blueprintFor('calculator', CALCPRO_REQUEST, false);
        expect(bp.engine).toBe('calculator');
        expect(bp.title).toBe('Calculator');
        expect(bp.fields).toEqual([]);
    });
});

describe('the calculator scaffolder writes an interactive, verifiable app', () => {
    const files = buildAppFiles(
        blueprintFor('calculator', CALCPRO_REQUEST, false),
        { isArabic: false, brand: 'CalcPro', storeKey: 'calcpro' } as any,
        'calcpro',
    );
    const app = files['src/components/CalculatorApp.jsx'];

    it('mounts the calculator engine instead of Hero/Features sections', () => {
        expect(app).toBeTruthy();
        expect(files['src/App.jsx']).toMatch(/import CalculatorApp from '\.\/components\/CalculatorApp\.jsx'/);
        expect(files['src/App.jsx']).toMatch(/<CalculatorApp content=\{content\} \/>/);
        expect(files['src/App.jsx']).not.toMatch(/Hero|Features|Contact/);
    });

    it('contains real arithmetic behavior and the requested controls', () => {
        expect(app).toMatch(/const calculate =/);
        expect(app).toMatch(/a \+ b/);
        expect(app).toMatch(/a - b/);
        expect(app).toMatch(/a \* b/);
        expect(app).toMatch(/a \/ b/);
        expect(app).toMatch(/Number\(b\) === 0/);
        for (const token of ['AC', '⌫', '%', '±', '÷', '×', '−', '+', '=']) {
            expect(app).toContain(token);
        }
    });

    it('persists and caps the last ten calculations', () => {
        expect(app).toMatch(/createStore\(content\.storeKey \+ ':history'\)/);
        expect(app).toMatch(/\.slice\(0, 10\)/);
        expect(app).toMatch(/historyStore\.write\(next\)/);
        expect(app).toMatch(/History/);
    });

    it('reports division by zero and ships responsive calculator CSS', () => {
        expect(app).toMatch(/Cannot divide by zero/);
        expect(files['src/styles/app.css']).toMatch(/\.calc-layout\{/);
        expect(files['src/styles/app.css']).toMatch(/@media \(max-width:760px\)/);
    });

    it('parses every generated file', () => {
        for (const [rel, body] of Object.entries(files)) {
            const gate = syntaxOk(rel, body);
            expect(`${rel}: ${gate.ok ? 'ok' : gate.error}`).toBe(`${rel}: ok`);
        }
    });
});
