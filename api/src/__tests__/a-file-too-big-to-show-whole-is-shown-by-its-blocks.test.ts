/**
 * The acceptance judge is shown the code that keeps a rule, even when the
 * file that holds it is too big to show whole. The hard exam, 2026-11-05, H01:
 * server/app.js was 33 KB, the API tests took the room first, and the judge
 * was shown the test that asserts «no double-booking» and not the route that
 * keeps it — «R8 unprovable … the appointment-creation code in server/app.js
 * is not in the source». The builder spent forty minutes moving the rule into
 * a smaller file. The fixture is that clinic, with the rule back inside app.js.
 */
import fs from 'fs';
import path from 'path';
import { judgeSourceOf, sliceForMany, enclosingBlocksFor, MAX_SOURCE_CHARS } from '../core/quality/named-requirements';

const root = path.join(__dirname, 'fixtures-clinic-h01');
const files = ['server/app.js', 'server/test/api.test.js', 'client/src/i18n.jsx', 'client/src/pages/Appointments.jsx', 'client/src/pages/Invoices.jsx', 'client/src/App.jsx']
    .map(p => ({ path: p, text: fs.readFileSync(path.join(root, ...p.split('/')), 'utf8') }));
const R8 = { id: 'R8', text: 'No double-booking of appointments', quote: 'appointments with no double-booking' };

describe('a file too big to show whole is shown by its blocks', () => {
    it('the clinic is bigger than what the judge is shown', () => {
        expect(judgeSourceOf(files).length).toBeGreaterThan(MAX_SOURCE_CHARS);
    });

    it('the judge is shown the route that keeps the rule, whole, with the rule itself', () => {
        const shown = sliceForMany([R8], judgeSourceOf(files));
        expect(shown.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
        // The route that creates an appointment, from its first line to its end…
        const route = shown.indexOf("app.post('/api/appointments'");
        expect(route).toBeGreaterThan(-1);
        expect(shown.slice(route, route + 1200)).toMatch(/assertBookable\(db, \{ doctorId: data\.doctor_id/);
        // …and the function it calls, which refuses the overlap.
        expect(shown).toMatch(/export function assertBookable\(db,/);
        expect(shown).toMatch(/slot_conflict/);
        // Under the file's own name, so the judge can say where it is.
        expect(shown).toMatch(/\/\/ ==== file: server\/app\.js ====/);
    });

    it('never half a function: a block runs from its first line to the line that closes it', () => {
        const text = [
            "import x from 'y';",
            '',
            "app.post('/api/appointments', (req, res) => {",
            '  const data = req.body;',
            '  if (overlaps(data)) {',
            "    return res.status(409).json({ error: 'slot_conflict' });",
            '  }',
            '  res.json(save(data));',
            '});',
            '',
            "app.get('/api/other', (req, res) => res.json([]));",
        ].join('\n');
        expect(enclosingBlocksFor(['slot_conflict'], text, 5000)).toBe(text.split('\n').slice(2, 9).join('\n'));
    });
});
