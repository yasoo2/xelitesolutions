import fs from 'fs';
import path from 'path';
import { subjectPhrase } from '../core/design/subject-phrase';

/**
 * Eval run500 P051, 2026-10-23: «Build an admin dashboard for a dental clinic»
 * was named «n admin dashboard …». The pattern (?:a|an|the)?\s* took the «a»
 * of «an» and let zero spaces follow, so the «n» stayed; «analytics» would
 * have become «nalytics». An article now needs a real space after it.
 */
describe('an article does not eat the start of the word', () => {
    it.each([
        ['Build an admin dashboard for a dental clinic to manage patients', 'admin dashboard'],
        ['Build analytics dashboard for a gym, with charts', 'analytics dashboard'],
        ['Create an inventory tracker with low-stock alerts', 'inventory tracker'],
        ['Build a booking app for a hotel', 'booking'],
    ])('%s -> starts with «%s»', (request, start) => {
        expect(subjectPhrase(request, 48).startsWith(start)).toBe(true);
    });

    it('no source regex lets an optional article be followed by zero spaces', () => {
        const BS = String.fromCharCode(92);
        const trap = new RegExp('\\(\\?:(?:a|an|the)(?:\\|(?:a|an|the))*\\)\\?' + BS + BS + 's\\*');
        const hits: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'node_modules' || e.name === '__tests__') continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (/\.tsx?$/.test(e.name) && trap.test(fs.readFileSync(full, 'utf8'))) hits.push(full);
            }
        };
        walk(path.join(__dirname, '..'));
        expect(hits).toEqual([]);
    });
});
