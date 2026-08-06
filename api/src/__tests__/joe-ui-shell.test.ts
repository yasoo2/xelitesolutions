/**
 * THE PAGE HE ACTUALLY LOOKS AT.
 *
 * Every sweep before this one drove the ENGINE. Not one opened Joe's own
 * interface, which is the only surface he touches: if the bundle throws on
 * boot or the socket never connects, every proof still passes and Joe is a
 * white rectangle. verify_joe_ui_live now boots the real server and drives it
 * in a real Chromium; these gates hold the facts that proof depends on, so a
 * refactor cannot quietly move them.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');

describe('the served shell', () => {
    it('declares the language it is actually written in', () => {
        // It said `lang="en"` while every string in it is Arabic. The runtime
        // corrected it after hydration; before that, the document lied.
        expect(read('web', 'index.html')).toMatch(/<html lang="ar">/);
    });

    it('is built, so the server has something to serve', () => {
        expect(fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))).toBe(true);
    });
});

describe('the wire the panels are fed by', () => {
    it('upgrades on /ws and /api/ws — never on the root', () => {
        const W = read('api', 'src', 'api', 'ws.ts');
        expect(W).toMatch(/url\.pathname === '\/ws'/);
        expect(W).toMatch(/url\.pathname === '\/api\/ws'/);
    });

    it('and the browser stream has its own path', () => {
        expect(read('api', 'src', 'api', 'ws.ts')).toMatch(/url\.pathname === '\/ws\/browser'/);
    });
});

describe('the composer follows what is typed into it', () => {
    it('is dir="auto" — measured to be right, not assumed to be wrong', () => {
        // An EMPTY dir="auto" box computes to ltr, which looks like a bug and is
        // not: there is no strong character to follow yet. Typing Arabic flips
        // it to rtl, and Latin flips it back. The live proof measures both.
        expect(read('web', 'src', 'components', 'CommandComposer.tsx')).toMatch(/dir="auto"/);
    });
});
