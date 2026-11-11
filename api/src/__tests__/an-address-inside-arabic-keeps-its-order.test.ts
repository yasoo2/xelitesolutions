/**
 *  AN ADDRESS INSIDE AN ARABIC MESSAGE KEEPS ITS OWN ORDER.
 *
 *  The ladder exam's capture of Joe's page, 2026-11-07 (L008): «المعاينة
 *  الحية: http://127.0.0.1:8000/» read «/http://127.0.0.1:8000» and «(ثم افتح
 *  http://127.0.0.1:8000/index.html)» closed with a mirrored bracket. The chat
 *  now isolates every address left to right (web/src/lib/bidi.ts, ChatPanel's
 *  paragraphs, headings and list items), and inline code is left to right.
 */
import fs from 'fs';
import path from 'path';
import { splitAddresses } from '../../../web/src/lib/bidi';

describe('the addresses inside a sentence', () => {
    test('an address is cut out whole, without the sentence\'s punctuation', () => {
        expect(splitAddresses('المعاينة الحية: http://127.0.0.1:8000/')).toEqual([
            { text: 'المعاينة الحية: ', ltr: false },
            { text: 'http://127.0.0.1:8000/', ltr: true },
        ]);
        expect(splitAddresses('(ثم افتح http://127.0.0.1:8000/index.html)')).toEqual([
            { text: '(ثم افتح ', ltr: false },
            { text: 'http://127.0.0.1:8000/index.html', ltr: true },
            { text: ')', ltr: false },
        ]);
        expect(splitAddresses('افتح https://example.com/a?b=1، ثم تابع.')).toEqual([
            { text: 'افتح ', ltr: false },
            { text: 'https://example.com/a?b=1', ltr: true },
            { text: '، ثم تابع.', ltr: false },
        ]);
    });

    test('text with no address is one plain piece', () => {
        expect(splitAddresses('لا عنوان هنا')).toEqual([{ text: 'لا عنوان هنا', ltr: false }]);
    });

    test('the chat\'s paragraphs, headings and list items isolate them, and inline code reads left to right', () => {
        const chat = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'ChatPanel.tsx'), 'utf8');
        for (const tag of ['p', 'li', 'h1', 'h2', 'h3']) {
            expect(chat).toContain(`${tag}: ({ children, ...props }) => <${tag} dir="auto" {...props}>{isolateAddresses(children)}</${tag}>`);
        }
        expect(chat).toContain('<bdi key={i} dir="ltr" className="joe-ltr-address">');
        expect(chat).toMatch(/<code dir="ltr" className=\{className\}/);
    });
});
