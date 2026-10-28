/**
 * A fence inside a source file is the file's content; only a fence where the
 * chat wrapper stands is refused.
 *
 * Round 21 second review (W5): any ``` in a non-document file refused the
 * write — a JSX Markdown renderer testing `m.startsWith('```')`, a Python
 * docstring with a fenced example, a `<pre>```js…```</pre>` page. After
 * normalizeArtifactContent has removed a complete wrapper, what is left of one
 * can only open or close the content. The real write contract is used.
 */
import { prepareArtifactContent } from '../modules/tools/artifact-validation';

const RENDERER = [
    "export function render(md) {",
    "  return md.split('\\n\\n').map((m) => (m.startsWith('```')",
    "    ? `<pre>${m.replace(/```\\w*/g, '')}</pre>`",
    "    : `<p>${m}</p>`));",
    "}",
].join('\n');
const DOCSTRING = [
    'def total(rows):',
    '    """Sum the rows.',
    '',
    '    Example:',
    '    ```python',
    '    total([1, 2])',
    '    ```',
    '    """',
    '    return sum(rows)',
].join('\n');
const PAGE = '<!doctype html>\n<html><body><pre>```js\nconst a = 1;\n```</pre></body></html>';

describe('a fence inside a file is its content', () => {
    it('NEGATIVE — a renderer, a docstring and a page that show a fence are written', () => {
        expect(prepareArtifactContent('src/markdown.jsx', RENDERER).error).toBeUndefined();
        expect(prepareArtifactContent('app/totals.py', DOCSTRING).error).toBeUndefined();
        expect(prepareArtifactContent('public/help.html', PAGE).error).toBeUndefined();
    });

    it('POSITIVE — what is left of the chat wrapper is still refused', () => {
        const fence = /incomplete Markdown fence/;
        expect(prepareArtifactContent('server.js', '```js\nconst x = 1;\n').error).toMatch(fence);
        expect(prepareArtifactContent('server.js', 'Here is the file:\n```js\nconst x = 1;\n```').error).toMatch(fence);
        expect(prepareArtifactContent('server.js', 'const x = 1;\n```').error).toMatch(fence);
        expect(prepareArtifactContent('app/totals.py', '```python\nprint(1)').error).toMatch(fence);
        // A complete wrapper is still removed, not refused.
        expect(prepareArtifactContent('server.js', '```js\nconst x = 1;\n```')).toEqual({ content: 'const x = 1;' });
    });
});
