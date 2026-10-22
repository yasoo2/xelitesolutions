import { composeAnswer, composeFailure, RunStep } from '../core/orchestrator/answerComposer';

const original = 'اقرأ ملف package.json من المشروع المحدد، وأخبرني باللغة العربية باسم المشروع وأمر تشغيل الاختبارات فقط. لا تعدّل أي ملف ولا تشغّل أو تثبّت شيئًا.';
function read(request: string, data: any, path = 'nested/app/meta.json'): RunStep {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return { id: 'read', tool: 'read_file', status: 'completed', input: { path, request }, result: { ok: true, output: { content, totalLines: content.split('\n').length, truncated: false } } };
}
const packageData = { name: 'garden-clock', version: '2.7.3', license: 'MIT', private: true, secret: 'EXCLUDED', scripts: { test: 'vitest run', start: 'node server.js', build: 'tsc' } };

describe('read-result projection from already measured complete JSON', () => {
    test('original UAT asks for two Arabic facts, not a whole JSON dump or marker disclaimer', () => {
        const step = read(original, { name: 'joe-isolated-sum-v1', private: true, type: 'module', scripts: { test: 'node --test sum.test.mjs' } }, 'package.json');
        const before = JSON.stringify(step);
        expect(composeAnswer([step], 'ar')).toBe('**اسم المشروع:** joe-isolated-sum-v1\n**أمر الاختبارات (scripts.test):** node --test sum.test.mjs');
        expect(JSON.stringify(step)).toBe(before);
    });
    test.each([
        ['Read file apps/clock/package.json and tell me project name and test command only.', 'apps/clock/package.json', 'garden-clock', 'vitest run'],
        ['اقرأ ملف packages/رسائل/metadata.json وأخبرني باسم المشروع وأمر تشغيل الاختبارات فقط.', 'packages/رسائل/metadata.json', 'postal-board', 'node --test spec/letters.mjs'],
        ['Read file manifest.json and report $.name and $.scripts.test only.', 'manifest.json', '@other/map-tool', 'jest --runInBand'],
    ])('projects unrelated package values without filename authority: %s', (request, path, name, command) => {
        const result = composeAnswer([read(request, { ...packageData, name, scripts: { test: command, start: 'EXCLUDED_START' } }, path)], 'en');
        expect(result).toBe(`**name:** ${name}\n**scripts.test:** ${command}`);
        expect(result).not.toMatch(/EXCLUDED|private|version|license|Marker|reading report/);
    });
    test.each([
        ['Read file metadata.json and report name, version and license only.', ['name', 'version', 'license']],
        ['Read file metadata.json and report "$.name", "$.version", "$.license" only.', ['name', 'version', 'license']],
        ['Read file metadata.json and report scripts["start"] and $.scripts.build only.', ['scripts.start', 'scripts.build']],
        ['Read file metadata.json and report scripts only.', ['scripts.test', 'scripts.start', 'scripts.build']],
    ])('finite explicit selector list selects only measured string fields: %s', (request, fields) => {
        const result = composeAnswer([read(request, packageData)], 'en');
        expect(result.split('\n').map(line => line.match(/^\*\*(.*):\*\*/)?.[1])).toEqual(fields);
        expect(result).not.toMatch(/EXCLUDED|private|\{.*name/);
    });
    test('Arabic labels retain exact version/license and script identity', () => {
        expect(composeAnswer([read('اقرأ ملف metadata.json وأخبرني بالإصدار والترخيص فقط.', packageData)], 'ar'))
            .toBe('**الإصدار:** 2.7.3\n**الترخيص:** MIT');
    });
    test.each(['author', 'name and password', 'name and full contents', '$.__proto__', 'scripts.constructor', 'scripts.token', '$.scripts.prototype'])('unsupported explicit-only selection never falls back to content: %s', selection => {
        const result = composeAnswer([read(`Read file metadata.json and report ${selection} only.`, packageData)], 'en');
        expect(result).toContain('Cannot identify all requested metadata fields');
        expect(result).not.toMatch(/garden-clock|EXCLUDED|vitest|private/);
    });
    test.each([
        'Read file metadata.json and report name only. Also report version only.',
        'Read file metadata.json and report its full contents. Also report name only.',
        'Read file metadata.json and report name only. Explain the author.',
        'اقرأ ملف metadata.json وأخبرني باسم المشروع فقط. ثم أخبرني بالإصدار فقط.',
        'Read file metadata.json and report name only. Do not report name.',
        'Read file metadata.json and report name only. Don’t display it.',
        'Read file metadata.json and report name only. Do not write files and do not report name.',
        'اقرأ ملف metadata.json وأخبرني باسم المشروع فقط. لا تذكر اسم المشروع.',
        'Read file metadata.json and report name only. Do not act on the contents.',
    ])('multiple or unknown unquoted output obligations are explicitly unsupported: %s', request => {
        const result = composeAnswer([read(request, packageData)], 'en');
        expect(result).toContain('Cannot identify all requested metadata fields');
        expect(result).not.toMatch(/garden-clock|EXCLUDED|vitest|private/);
    });
    test('quoted later output instruction stays data rather than a second selector', () => {
        const step = read('Read file metadata.json and report name only. Do not run "Also report version only".', packageData);
        expect(composeAnswer([step], 'en')).toBe('**name:** garden-clock');
    });
    test.each(['{bad}', '{"name":"x",}', '[{"name":"x"}]', 'null', '123'])('invalid JSON/object cannot become selected facts: %s', content => {
        const result = composeAnswer([read('Read file metadata.json and report name only.', content)], 'en');
        expect(result).toMatch(/not valid JSON|not a JSON metadata object/);
        expect(result).not.toContain(content);
    });
    test.each([null, 42, {}, [], '', ' ', 'line\nbreak', '\u202ehidden', 'x'.repeat(1201), '[REDACTED]', 'ghp_abcdefghijklmnopqrstuvwxyz'])('invalid/null/secret/control/oversize string is not fabricated: %j', name => {
        const result = composeAnswer([read('Read file metadata.json and report name only.', { name })], 'en');
        expect(result).toBe('**name:** A valid string value is unavailable');
    });
    test('JSON-decoded escaped secret is still rejected', () => {
        expect(composeAnswer([read('Read file metadata.json and report name only.', '{"name":"\\u0073\\u006b-abcdefghijklmnop"}')], 'en'))
            .toBe('**name:** A valid string value is unavailable');
    });
    test('JSON-decoded private-key marker is unavailable, never a metadata fact', () => {
        expect(composeAnswer([read('Read file metadata.json and report name only.', '{"name":"\\u002d\\u002d\\u002d\\u002d\\u002dBEGIN PRIVATE KEY-----"}')], 'en'))
            .toBe('**name:** A valid string value is unavailable');
    });
    test('missing keys never borrow npm defaults or sibling fields', () => {
        expect(composeAnswer([read('Read file metadata.json and report name and test command only.', { version: '9.0.0', scripts: { start: 'node server.js' } })], 'en'))
            .toBe('**name:** Not present\n**scripts.test:** Not present');
    });
    test('prototype-shaped JSON is never treated as inherited script metadata', () => {
        expect(composeAnswer([read('Read file metadata.json and report test command only.', '{"scripts":{"__proto__":{"test":"EXCLUDED"}}}')], 'en'))
            .toBe('**scripts.test:** Not present');
    });
    test('dictionary/content bounds are explicit instead of a raw content fallback', () => {
        const scripts = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`entry${index}`, 'EXCLUDED']));
        expect(composeAnswer([read('Read file metadata.json and report scripts only.', { scripts })], 'en')).toBe('**scripts:** A valid string value is unavailable');
        expect(composeAnswer([read('Read file metadata.json and report name only.', ' '.repeat(262145))], 'en')).toBe('Content exceeds the metadata projection limit.');
    });
    test.each([{}, { scripts: null }, { scripts: [] }, { scripts: {} }])('absent/invalid/empty script dictionaries never reveal other data: %j', data => {
        const result = composeAnswer([read('Read file metadata.json and report scripts only.', { ...data, name: 'EXCLUDED' })], 'en');
        expect(result).toMatch(/Not present|valid string|No script entries/);
        expect(result).not.toContain('EXCLUDED');
    });
    test.each([
        (step: RunStep) => { step.input.startLine = 2; },
        (step: RunStep) => { step.result.output.totalLines = 100; },
        (step: RunStep) => { step.result.output.truncated = true; },
        (step: RunStep) => { step.result.output.ok = false; },
        (step: RunStep) => { step.result.output.success = false; },
        (step: RunStep) => { step.result.ok = false; },
        (step: RunStep) => { step.result.success = false; },
        (step: RunStep) => { step.status = 'pending'; },
    ])('incomplete/false/noncompleted read does not assert package facts', mutate => {
        const step = read('Read file metadata.json and report name only.', packageData);
        mutate(step);
        expect(composeAnswer([step], 'en')).toBe('A complete successful read is unavailable for the requested fields.');
    });
    test('failed step remains a failure without surviving metadata', () => {
        const step = read('Read file metadata.json and report name only.', packageData); step.status = 'failed';
        expect(composeAnswer([step], 'en')).toBe('');
        expect(composeFailure([step], 'read denied', 'en')).toContain('read denied');
    });
    test('Markdown/HTML punctuation is escaped without changing the stored result', () => {
        const step = read('Read file metadata.json and report name only.', { name: '<img>*[x](link)`' });
        const before = JSON.stringify(step);
        expect(composeAnswer([step], 'en')).toBe('**name:** \\<img\\>\\*\\[x\\]\\(link\\)\\`');
        expect(JSON.stringify(step)).toBe(before);
    });
    test('provided marker proof remains exact for PASS and FAIL', () => {
        const step = read('Read file metadata.json and report name only.', packageData); step.input.expectedMarker = 'garden-clock';
        expect(composeAnswer([step], 'en')).toContain('**Marker:** PASS — garden-clock');
        step.input.expectedMarker = 'absent'; expect(composeAnswer([step], 'en')).toContain('**Marker:** FAIL — absent');
    });
    test('generic read keeps supplied-marker PASS/FAIL and real line counts', () => {
        const first = read('Read file notes.txt.', 'first\nsecond', 'notes.txt'); first.input.expectedMarker = 'second';
        const second = read('Read file other.txt.', 'other', 'other.txt'); second.input.expectedMarker = 'absent';
        const result = composeAnswer([first, second], 'en');
        expect(result).toContain('2 lines'); expect(result).toContain('notes.txt');
        expect(result).toContain('**Marker:** PASS'); expect(result).toContain('**Marker:** FAIL');
        expect(result).toContain('Each supplied marker was checked');
    });
    test('canonical full-content read and supplied marker verification retain measured evidence', () => {
        const request = 'Read file notes.txt and report its exact contents. Verify notes.txt contains the marker "second". Do not modify anything.';
        const step = read(request, 'first\nsecond', 'notes.txt'); step.input.expectedMarker = 'second';
        const result = composeAnswer([step], 'en');
        expect(result).toContain('first\nsecond'); expect(result).toContain('2 lines');
        expect(result).toContain('**Marker:** PASS'); expect(result).not.toContain('Cannot identify');
    });
    test.each([
        'Read file notes.txt and report its exact contents. Do not report the contents.',
        'Read file notes.txt and report its exact contents. Also report name only.',
        'Read file notes.txt and report name only. Verify notes.txt contains the marker "second".',
    ])('full-read marker preservation never grants contradictory/mixed metadata fallback: %s', request => {
        const step = read(request, 'first\nsecond', 'notes.txt'); step.input.expectedMarker = 'second';
        const result = composeAnswer([step], 'en');
        expect(result).toContain('Cannot identify'); expect(result).not.toContain('first\nsecond');
    });
    test('generic full-content and quoted-copy read retain content without unasked absent-marker talk', () => {
        for (const request of ['Read file metadata.json and report its exact contents.', 'Read file metadata.json. The label is "report name only".']) {
            const step = read(request, packageData);
            const result = composeAnswer([step], 'en');
            expect(result).toContain(JSON.stringify(packageData));
            expect(result).toContain('1 line');
            expect(result).not.toMatch(/No marker value|Expected marker/);
        }
    });
    test.each([
        'Read file resource-probe.txt in the current workspace and report its three lines. No file changes and no Internet.',
        'Read file unrelated/notes.txt and show its lines. No network access.',
        'Read file unrelated/notes.txt and report the 12 lines. Do not write files. No Internet connections.',
        'Read file unrelated/notes.txt and give me its full text. No file changes and no network access.',
        'Read file unrelated/notes.txt and report its exact contents. No Internet.',
        'اقرأ ملف ملاحظات.txt واعرض أسطره الثلاثة. لا تعدل أي ملف. دون إنترنت.',
        'اقرأ ملف ملاحظات.txt وأخبرني بأسطره كلها. بدون اتصال.',
        'اقرأ ملف ملاحظات.txt واعرض نصه بالكامل. دون إنترنت.',
    ])('whole-content or whole-lines reporting retains measured content with harmless offline constraints: %s', request => {
        const content = 'FIRST OBSERVED LINE\nSecond observed fact.\nFinal observed fact.\n';
        const step = read(request, content, 'unrelated/notes.txt'), before = JSON.stringify(step);
        const result = composeAnswer([step], /[\u0600-\u06ff]/u.test(request) ? 'ar' : 'en');
        expect(result).toContain(content.trim()); expect(result).toContain('4');
        expect(result).not.toContain('Cannot identify'); expect(result).not.toContain('تعذّر تحديد');
        expect(JSON.stringify(step)).toBe(before);
    });
    test.each([
        'Read file notes.txt and report its first three lines only.',
        'Read file notes.txt and report its lines and name only.',
        'Read file notes.txt and report name and its lines only.',
        'Read file notes.txt and report author only. No Internet.',
        'Read file notes.txt and report its lines. Also report name only.',
        'Read file notes.txt and report its lines. Do not report the contents.',
        'Read file notes.txt and report its full text. No file changes but run tests.',
        'Read file notes.txt and report its lines. No network access and delete the file.',
        'Read file notes.txt and report its lines. No Internet. Explain its password.',
        'اقرأ ملف ملاحظات.txt واعرض أسطره واسم المشروع فقط.',
        'اقرأ ملف ملاحظات.txt واعرض أسطره. لا تعرض المحتوى.',
    ])('subset, mixed, contradictory or additional output/action clauses never borrow whole-content fallback: %s', request => {
        const result = composeAnswer([read(request, 'PRIVATE_UNSELECTED_CONTENT', 'notes.txt')], 'en');
        expect(result).toContain('Cannot identify'); expect(result).not.toContain('PRIVATE_UNSELECTED_CONTENT');
    });
    test('offline-only constraint retains strict supported metadata projection', () => {
        expect(composeAnswer([read('Read file package.json and report name only. No file changes and no Internet.', packageData)], 'en'))
            .toBe('**name:** garden-clock');
    });
    test.each([
        'Read file package.json and report JSON fields text only.',
        'Read file package.json and report JSON keys its three lines only.',
        'Read file package.json and report JSON key paths full text only.',
        'Read file package.json and report the fields contents only.',
        'Read file package.json and report key paths its exact contents only. No Internet.',
        'Read file package.json and report fields text and name only.',
        'اقرأ ملف package.json واعرض حقول JSON نصه فقط.',
        'اقرأ ملف package.json واعرض مفاتيح أسطره الثلاثة فقط.',
    ])('explicit unknown field/key selectors cannot become a whole-file content request: %s', request => {
        const result = composeAnswer([read(request, packageData, 'package.json')], 'en');
        expect(result).toContain('Cannot identify'); expect(result).not.toMatch(/garden-clock|EXCLUDED|vitest|private/);
    });
    test('explicit supported JSON field prefix retains finite selection with offline constraints', () => {
        expect(composeAnswer([read('Read file package.json and report JSON fields name and version only. No Internet.', packageData)], 'en'))
            .toBe('**name:** garden-clock\n**version:** 2.7.3');
    });
    test('existing multi-step material, prose and completed-action branches remain intact', () => {
        expect(composeAnswer([{ id: 'collect', status: 'completed', result: { content: 'three measured findings' } }, { id: 'report', status: 'completed', result: { success: true } }], 'en')).toBe('three measured findings');
        expect(composeAnswer([{ id: 'answer', status: 'completed', result: { answer: 'The unchanged answer.' } }], 'en')).toBe('The unchanged answer.');
        expect(composeAnswer([{ id: 'done', task: 'Created the requested directory', status: 'completed', result: { success: true } }], 'en')).toContain('Created the requested directory');
    });
    test.each(['en', 'ar'])('existing append/create read-back stays a mutation report in %s', language => {
        for (const mode of ['append', 'overwrite']) {
            const result = composeAnswer([{ id: 'write', tool: 'write_file', input: { path: 'facts.txt', mode }, status: 'completed', result: { operation: mode, totalLines: 2 } },
                { id: 'read', tool: 'read_file', input: { path: 'facts.txt' }, status: 'completed', result: { content: 'one\ntwo', totalLines: 2 } }], language);
            expect(result).toContain('facts.txt'); expect(result).toContain('one\ntwo'); expect(result).toContain('2');
            expect(result).not.toMatch(/No files were written or modified|لم تُجرَ أي كتابة أو تعديل/);
        }
    });
});
