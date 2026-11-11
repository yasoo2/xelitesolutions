/**
 * ⛔ A JUDGE SHOWN HALF A FUNCTION CANNOT SAY THE FUNCTION WORKS.
 *
 * The hard exam, 2026-11-04, H01: a clinic of 45 files. «Appointments with no
 * double-booking» was judged nine times over windows cut around his words, and
 * every time the judge said so: «the checkSlot body is cut off (`.get(doctorId,
 * wee`) and the POST route that calls it is not shown». The builder could do
 * nothing to let it see more; the delivery was refused for a rule the code kept.
 *
 * A project too big to show whole is shown by whole files: those holding the
 * requirement's words, most first, then the file that defines each function
 * they call. A file is never cut in the middle; a requirement none of whose
 * words made it in still gets its windows.
 */
import fs from 'fs';
import path from 'path';
import { judgeSourceOf, MAX_SOURCE_CHARS, sliceFor, sliceForMany, type NamedRequirement } from '../core/quality/named-requirements';

const DOUBLE_BOOKING: NamedRequirement = { id: 'no-double-booking', text: 'appointments with no double-booking and per-doctor working hours', quote: 'appointments with no double-booking and per-doctor working hours' } as NamedRequirement;
const AUDIT: NamedRequirement = { id: 'audit-log', text: 'an audit log of every change', quote: 'an audit log of every change' } as NamedRequirement;

/** Twenty-four pages that talk about appointments and doctors everywhere, and do nothing about overlaps. */
const filler = (i: number) => ({
    path: `client/src/pages/Page${i}.jsx`,
    text: Array.from({ length: 30 }, (_, k) => `// appointments for each doctor, working hours shown in row ${k}\nexport const cell${i}_${k} = (appointments, doctor) => appointments.filter(a => a.doctorId === doctor.id).length;`).join('\n'),
});

const ROUTE = {
    path: 'server/src/routes/appointments.js',
    text: [
        `const { makeSlotChecker } = require('../lib/scheduling');`,
        `module.exports = function register(api, { db }) {`,
        `  // No double-booking: checkSlot rejects overlapping bookings with HTTP 409.`,
        `  const checkSlot = makeSlotChecker(db);`,
        `  api.post('/appointments', (req, res) => {`,
        `    const verdict = checkSlot(req.body.doctorId, req.body.start, req.body.end);`,
        `    if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.reason });`,
        `    res.status(201).json(db.addAppointment(req.body));`,
        `  });`,
        `};`,
    ].join('\n'),
};

/** The rule itself, deep in its own file, far from any of his words. */
const SCHEDULING = {
    path: 'server/src/lib/scheduling.js',
    text: [
        `function makeSlotChecker(db) {`,
        ...Array.from({ length: 60 }, (_, k) => `  const step${k} = ${k}; // bookkeeping that has nothing to say`),
        `  return function check(doctorId, start, end) {`,
        `    const hours = db.prepare('SELECT * FROM schedules WHERE doctor_id = ? AND weekday = ?').get(doctorId, new Date(start).getDay());`,
        `    if (!hours || start < hours.opens || end > hours.closes) return { ok: false, status: 409, reason: 'outside-working-hours' };`,
        `    const clash = db.prepare('SELECT id FROM appointments WHERE doctor_id = ? AND start < ? AND end > ?').get(doctorId, end, start);`,
        `    return clash ? { ok: false, status: 409, reason: 'overlap-detected-end-marker' } : { ok: true };`,
        `  };`,
        `}`,
        `module.exports = { makeSlotChecker };`,
    ].join('\n'),
};

const AUDIT_FILE = { path: 'server/src/lib/audit.js', text: `function audit(db, action, entity, id) { db.prepare('INSERT INTO audit_log (action, entity, entity_id) VALUES (?, ?, ?)').run(action, entity, id); }\nmodule.exports = { audit };` };

const files = [...Array.from({ length: 24 }, (_, i) => filler(i)), ROUTE, SCHEDULING, AUDIT_FILE];
const source = judgeSourceOf(files);

describe('a project too big to show whole', () => {
    it('is big enough to be cut', () => {
        expect(source.length).toBeGreaterThan(MAX_SOURCE_CHARS);
    });

    it('the double-booking rule is shown whole: the route that calls it and the function that keeps it', () => {
        const shown = sliceFor(DOUBLE_BOOKING, source);
        expect(shown.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
        expect(shown).toContain(ROUTE.text);
        expect(shown).toContain(SCHEDULING.text);
        expect(shown).toContain('overlap-detected-end-marker');
    });

    it('no file is cut in the middle', () => {
        const shown = sliceForMany([DOUBLE_BOOKING, AUDIT], source);
        for (const f of files) {
            const opened = shown.includes(`// ==== file: ${f.path} ====\n`);
            if (opened) expect({ file: f.path, whole: shown.includes(`// ==== file: ${f.path} ====\n${f.text}`) }).toEqual({ file: f.path, whole: true });
        }
        //  …and the audit requirement in the same batch is shown its own file.
        expect(shown).toContain(AUDIT_FILE.text);
    });

    it('a source that fits is shown whole, as before', () => {
        const small = judgeSourceOf([ROUTE, SCHEDULING]);
        expect(sliceFor(DOUBLE_BOOKING, small)).toBe(small);
    });

    it('the engine\'s judge reads the project by named files', () => {
        const verify = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'verify.ts'), 'utf-8');
        expect(verify).toMatch(/return \{ text: judgeSourceOf\(read\), leftOut \};/);
    });
});
