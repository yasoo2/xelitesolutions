/**
 * ⛔ A FILE THE JUDGE SAYS IT WAS NOT SHOWN IS SHOWN TO IT — ONCE (named-requirements.ts).
 *
 * The hard sample, 2026-11-09 (L332, a bookstore's documents): the slice for
 * «a thumbnail for every uploaded image» was filled by a 22 KB main.py and the
 * tests, and three times the judge named what was missing: «app/files.py is not
 * in the source shown». The file was 3 KB and in the project; the delivery was
 * refused three times. Pinned: the file named is added and the judge asked
 * once more; a file named that is not in the project, or a reason that names
 * no file, asks nothing again.
 */
import { filesNamedIn, judgeSourceOf, verifyNamed } from '../core/quality/named-requirements';

const filler = (n: number) => Array.from({ length: n }, (_, i) =>
    `@app.post("/books/${i}/upload")\ndef upload_${i}(file):\n    # the thumbnail of this upload is stored beside it; thumbnail name returned\n    thumb_name = files.store(file)\n    return {"thumbnail": thumb_name}\n`).join('\n');
const FILES_PY = [
    'from pillow_shim import open_picture', '',
    'def store(file):',
    '    pic = open_picture(file.stream)',
    '    small = pic.resize((200, 200))',
    '    name = file.filename + ".small.jpg"',
    '    small.save(name)',
    '    return name', '',
].join('\n');
const SOURCE = judgeSourceOf([
    { path: 'app/main.py', text: filler(150) },
    { path: 'app/static/index.html', text: Array.from({ length: 90 }, (_, i) => `<figure><img class="thumbnail" src="/thumbnails/${i}.jpg" alt="thumbnail ${i}"><figcaption>thumbnail of upload ${i}</figcaption></figure>`).join('\n') },
    { path: 'tests/test_api.py', text: Array.from({ length: 160 }, (_, i) => `def test_thumbnail_${i}():\n    assert upload_thumbnail(${i})["thumbnail"]\n`).join('\n') },
    { path: 'app/files.py', text: FILES_PY },
]);
const R = [{ id: 'R4', text: 'every upload gets a thumbnail', quote: 'thumbnails' }];

test('the files a reason names are found by path, or by a name only one file has', () => {
    expect(filesNamedIn('the module that renders the thumbnail (app/files.py) is not in the source shown.', SOURCE)).toEqual(['app/files.py']);
    expect(filesNamedIn('files.py is not shown', SOURCE)).toEqual(['app/files.py']);
    expect(filesNamedIn('the files module is not shown', SOURCE)).toEqual([]);
    expect(filesNamedIn('see lib/app/files.pyc', SOURCE)).toEqual([]);
});

test('the judge that names a file it was not shown is shown it, and its new answer stands', async () => {
    expect(SOURCE.length).toBeGreaterThan(40_000);
    const prompts: string[] = [];
    const judge = async (p: string) => {
        prompts.push(p);
        return p.includes('==== file: app/files.py ====')
            ? JSON.stringify({ verdicts: [{ id: 'R4', verdict: 'met', evidence: 'small = pic.resize((200, 200))', why: 'store_upload makes a 200px copy' }] })
            : JSON.stringify({ verdicts: [{ id: 'R4', verdict: 'unprovable', evidence: '', why: 'the module that renders the thumbnail (app/files.py) is not in the source shown' }] });
    };
    const out = await verifyNamed(R, SOURCE, false, judge);
    expect(out[0].verdict).toBe('met');
    expect(prompts[0]).not.toContain('==== file: app/files.py ====');
    expect(prompts.filter(p => p.includes('==== file: app/files.py ===='))).toHaveLength(1);
});

test('a file named that the project does not have asks nothing again', async () => {
    let calls = 0;
    const judge = async () => { calls++; return JSON.stringify({ verdicts: [{ id: 'R4', verdict: 'unprovable', evidence: '', why: 'app/images.py is not in the source shown' }] }); };
    const out = await verifyNamed(R, SOURCE, false, judge);
    expect(out[0].verdict).toBe('unprovable');
    const once = calls;
    expect(once).toBeLessThanOrEqual(2);
});
