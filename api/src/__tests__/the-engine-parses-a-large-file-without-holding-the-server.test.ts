/**
 * THE ENGINE PARSES A LARGE FILE WITHOUT HOLDING THE SERVER.
 *
 * Every write and edit of a JavaScript, TypeScript or JSON file is parsed, and
 * an edit is parsed twice (before and after). esbuild's transformSync holds
 * the thread that calls it for the whole parse: measured on this laptop
 * (D:\Joe\eval\proof\engine\files\resume\probe-transform-cost-idle.txt) about
 * 0.12 s for 200 KB and 0.5 s for 1 MB. On the request thread every other user
 * of the server waits that long. Here the parse runs in a worker thread: the
 * request thread keeps serving, and the answer is the same answer.
 */
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(180_000);

/** About `bytes` of valid TSX, one small component per line, Arabic included. */
function component(bytes: number): string {
    const lines: string[] = [];
    let size = 0;
    for (let i = 0; size < bytes; i++) {
        const line = `export const Item${i} = (p: { n: number }) => <li data-n={p.n * 2}>مرحبا {p.n + ${i}}</li>;`;
        lines.push(line);
        size += line.length + 1;
    }
    return `${lines.join('\n')}\n`;
}

/** The longest stretch, in ms, the request thread was held while fn ran. */
async function heldWhile<T>(fn: () => Promise<T>): Promise<{ result: T; longest: number }> {
    let last = Date.now();
    let longest = 0;
    const ticker = setInterval(() => { const now = Date.now(); longest = Math.max(longest, now - last); last = now; }, 10);
    try {
        const result = await fn();
        longest = Math.max(longest, Date.now() - last);
        return { result, longest };
    } finally { clearInterval(ticker); }
}

let fx: FileToolsFixture;
const BIG = component(2 * 1024 * 1024);
const LINES = BIG.split('\n').length - 1;
beforeAll(async () => {
    fx = fileToolsFixture('large');
    // The parser's first answer includes starting it; this test is about every answer after.
    await fx.run('engine_file_write', { path: 'warm.tsx', content: 'export const W = () => <b />;\n' });
});
afterAll(() => fx.cleanup());

describe('a 2 MB file is parsed off the request thread', () => {
    it('a write of it is checked, and the request thread is never held long', async () => {
        const { result, longest } = await heldWhile(() => fx.run('engine_file_write', { path: 'src/List.tsx', content: BIG }));
        expect(result.ok).toBe(true);
        expect(result.output.text).toMatch(/\nTSX syntax OK\.$/u);
        expect(longest).toBeLessThan(300);
    });

    it('an error on its last line is found there, with the parser\'s words', async () => {
        const broken = `${BIG}export const Last = (p) => <li>{p.n}</li;\n`;
        const { result, longest } = await heldWhile(() => fx.run('engine_file_write', { path: 'src/Broken.tsx', content: broken }));
        expect(result.output.parses).toBe(false);
        expect(result.output.text).toContain(`Written, but it does not parse: line ${LINES + 1} col 41: Expected ">" but found ";"`);
        expect(longest).toBeLessThan(300);
    });

    it('an edit that would break it is refused, the file keeps its bytes, and the thread was free', async () => {
        const before = fx.sha('src/List.tsx');
        const { result, longest } = await heldWhile(() => fx.run('engine_file_edit', {
            path: 'src/List.tsx', old_text: 'export const Item7 = ', new_text: 'export const Item7 = = ',
        }));
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^Not applied: after this edit src\/List\.tsx would not parse: line 8 col 22: Unexpected "="\n/u);
        expect(fx.sha('src/List.tsx')).toBe(before);
        expect(longest).toBeLessThan(300);
    });

    it('many checks at once all get their own answer', async () => {
        const writes = await Promise.all(Array.from({ length: 12 }, (_, i) => fx.run('engine_file_write', {
            path: `many/m${i}.${i % 3 === 0 ? 'json' : 'js'}`,
            content: i % 3 === 0 ? `{"n": ${i}${i % 2 ? ',' : ''}}\n` : `export const m${i} = ${i % 2 ? '' : i};\n`,
        })));
        expect(writes.map(w => w.output.parses)).toEqual(Array.from({ length: 12 }, (_, i) => i % 2 === 0));
    });
});
