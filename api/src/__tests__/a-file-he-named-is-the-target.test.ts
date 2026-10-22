import { namedTargetFile } from '../core/orchestrator/file-intent';
import { inputForTool } from '../core/orchestrator/toolCatalog';

/**
 * Eval L2-file, 2026-10-22: «Create a file named hello.py that prints the
 * numbers 1 to 5» → Joe asked «Specify a target for ai_write_file: path or
 * description» and reported the run as done. The request named its file; the
 * file field was simply never filled from it.
 */
const aiWriteFile = {
    name: 'ai_write_file',
    inputSchema: {
        properties: {
            path: { type: 'string', description: 'Destination file path relative to workspace root' },
            description: { type: 'string', description: 'Detailed description of what the file should contain' },
        },
        required: ['path', 'description'],
    },
};

describe('a file he named is the target', () => {
    it.each([
        ['Create a file named hello.py that prints the numbers 1 to 5, one per line.', 'hello.py'],
        ['write a file called src/utils/math.ts with an add function', 'src/utils/math.ts'],
        ['Create wordcount.js that counts the words in a file', 'wordcount.js'],
        ['Write a Node.js command-line tool wordcount.js that prints the number of words', 'wordcount.js'],
        ['أنشئ ملف notes.md فيه عنوان «ملاحظاتي» وتحته قائمة من ثلاث نقاط', 'notes.md'],
        ['اعمل ملف باسم «تقرير.txt» يلخص المشروع', 'تقرير.txt'],
    ])('%s → %s', (request, expected) => {
        expect(namedTargetFile(request)).toBe(expected);
    });

    it.each([
        'Write a short story about a cat',
        'compare a.txt and b.txt and tell me which is longer',
        'create a file named a.txt and a file named b.txt',
        'create a file named ../../etc/passwd',
        'create a file named C:\\Windows\\win.ini',
        'اكتب مقالاً عن البرمجة',
    ])('no single safe named file → null: %s', request => {
        expect(namedTargetFile(request)).toBeNull();
    });

    it('ai_write_file receives the named path and the request as its description', () => {
        const goal = 'Create a file named hello.py that prints the numbers 1 to 5, one per line.';
        expect(inputForTool(aiWriteFile, goal)).toEqual({ path: 'hello.py', description: goal });
    });

    it('a request that names no file still cannot fill a required path', () => {
        expect(inputForTool(aiWriteFile, 'Write a short story about a cat')).toBeNull();
    });

    it('a path field that is not described as a file is not filled from a file name', () => {
        const browser = { inputSchema: { properties: { path: { type: 'string', description: 'CSS selector path in the page' } }, required: ['path'] } };
        expect(inputForTool(browser, 'Create a file named hello.py')).toBeNull();
    });
});
