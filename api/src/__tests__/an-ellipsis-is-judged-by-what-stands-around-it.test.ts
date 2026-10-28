/**
 * An ellipsis in a planned file is an outline only where it stands for a part.
 *
 * Round 21 review (a8832292): the outline detector discarded a complete planned
 * file for a placeholder the page legitimately shows — `<div id="result">...</div>`
 * until the sum is computed, a chat's typing indicator — and had it re-authored
 * by a model; and it wrote real outlines verbatim: a section whose heading is
 * followed by «...» for the rest, `// ... rest of the handlers`. Each case
 * below has its twin on the other side of the line.
 */
const calls: Array<{ tool: string; args: any }> = [];
jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(async (toolName: string, args: any) => {
        calls.push({ tool: toolName, args });
        return { ok: true, output: { message: `mock executed ${toolName}` } };
    }),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { elidedParts } from '../shared/utils/elided-content';

const projectContext = {
    projectName: 'ellipsis-probe',
    workspaceId: 'ellipsis-probe-workspace',
    sessionId: 'ellipsis-probe-session',
    userId: 'ellipsis-probe-user',
};
const runPhase = (tasks: any[]) => new PhaseExecutorTool().execute({
    phase: { phaseNumber: 2, name: 'Core page', tasks },
    projectContext,
}, projectContext);

const LOAN_PAGE = [
    '<!DOCTYPE html>',
    '<html lang="ar" dir="rtl">',
    '<head><meta charset="UTF-8"><title>حاسبة القسط</title></head>',
    '<body>',
    '  <main>',
    '    <h1>احسب القسط الشهري</h1>',
    '    <form id="loan"><label>المبلغ <input name="amount" type="number"></label><button>احسب</button></form>',
    '    <div id="result">...</div>',
    '  </main>',
    '  <script src="app.js"></script>',
    '</body>',
    '</html>',
].join('\n');

describe('a placeholder the page shows is content', () => {
    it('a result slot in a complete page', () => {
        expect(elidedParts('index.html', LOAN_PAGE)).toEqual([]);
    });

    it('a typing indicator in a chat component', () => {
        const chat = 'export default function Chat({ typing }) {\n  return (<section className="chat">\n    <ul className="messages"><li>مرحبا</li></ul>\n    {typing && <div className="typing">...</div>}\n  </section>);\n}\n';
        expect(elidedParts('src/Chat.jsx', chat)).toEqual([]);
    });

    it('a script\'s mount point, a paginator\'s gap and a trailing ellipsis after inline text', () => {
        expect(elidedParts('index.html', '<body><div id="root">...</div><script type="module" src="/src/main.jsx"></script></body>')).toEqual([]);
        expect(elidedParts('index.html', '<ul class="pages"><li>1</li><li>…</li><li>9</li></ul>')).toEqual([]);
        expect(elidedParts('index.html', '<p>جارٍ <strong>الإرسال</strong>...</p>')).toEqual([]);
    });

    it('a comment that continues the one above it', () => {
        expect(elidedParts('src/app.js', '// We validate first\n// ...then normalise the input\nnormalise(x);\n')).toEqual([]);
        expect(elidedParts('app.py', '# Routes\n# ...then the admin ones\ndef admin():\n    pass\n')).toEqual([]);
    });
});

describe('an ellipsis that stands for a part is an outline', () => {
    it('a section whose heading is followed by «...» for the rest', () => {
        expect(elidedParts('index.html', '<section id="services"><h2>خدماتنا</h2>...</section>')).toEqual(['</h2>...</section>']);
        expect(elidedParts('index.html', '<section id="services">\n  <h2>Services</h2>\n  ...\n</section>')).toEqual(['</h2>...</section>']);
        expect(elidedParts('index.html', '<ul><li>Home</li>...</ul>')).toEqual(['</li>...</ul>']);
        expect(elidedParts('src/App.jsx', 'return (<main>\n  <Hero />\n  ...\n</main>);')).toEqual(['<Hero />...</main>']);
    });

    it('a comment that says what it leaves out', () => {
        expect(elidedParts('src/app.js', 'function bind() {\n  form.onsubmit = save;\n  // ... rest of the handlers\n}\n')).toEqual(['// ... rest of the handlers']);
        expect(elidedParts('src/styles.css', '.hero { color: red; }\n/* ... more styles */\n')).toEqual(['/* ... more styles */']);
        expect(elidedParts('index.html', '<section id="hero"><h1>عيادة</h1></section>\n<!-- ... remaining sections -->\n')).toEqual(['<!-- ... remaining sections -->']);
        expect(elidedParts('app.py', 'def index():\n    return "ok"\n# ... rest of the routes\n')).toEqual(['# ... rest of the routes']);
    });

    it('divs are parts once the file is an outline, or when the page has nothing else written', () => {
        expect(elidedParts('index.html', '<nav class="top">...</nav>\n<div class="hero">...</div>')).toEqual(['<nav class="top">...</nav>', '<div class="hero">...</div>']);
        const divOutline = '<body>\n  <div class="hero">...</div>\n  <div class="services">...</div>\n  <script src="app.js"></script>\n</body>';
        expect(elidedParts('index.html', divOutline)).toEqual(['<div class="hero">...</div>', '<div class="services">...</div>']);
    });

    it('every part is counted, not the first twelve', () => {
        const page = Array.from({ length: 15 }, (_, i) => `<section id="s${i}">...</section>`).join('\n');
        expect(elidedParts('index.html', page)).toHaveLength(15);
    });
});

describe('the phase writes what the plan gave when it is whole, and authors it when it is an outline', () => {
    beforeEach(() => { calls.length = 0; });

    it('a complete page with a result slot is written exactly as planned', async () => {
        await runPhase([{ task: 'Create the loan calculator page', tool: 'write_file', args: { path: 'ellipsis-probe/index.html', content: LOAN_PAGE } }]);
        expect(calls.map(call => call.tool)).toEqual(['write_file']);
        expect(calls[0].args.content).toBe(LOAN_PAGE);
    });

    it('a page whose sections are outlined after their headings is authored in full', async () => {
        const outline = '<!DOCTYPE html>\n<html><body>\n<section id="services"><h2>خدماتنا</h2>...</section>\n<section id="contact"><h2>تواصل معنا</h2>...</section>\n</body></html>';
        const result: any = await runPhase([{ task: 'Create the clinic page', tool: 'write_file', args: { path: 'ellipsis-probe/index.html', content: outline } }]);
        expect(result.ok).toBe(true);
        expect(calls.map(call => call.tool)).toEqual(['ai_write_file']);
        expect(calls[0].args.description).toContain('2 part(s)');
    });
});
