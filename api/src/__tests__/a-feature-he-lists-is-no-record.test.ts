/**
 * ⛔ "PAGINATION", "START AND STOP TIMERS", "SEARCH BY TITLE" NAME NO TABLE.
 *
 * Read before the hard exam's second half ran (2026-11-05), the records reader
 * took the features of four of its requests for tables the delivery gate would
 * then require a server to serve:
 *   - H13 "…pagination, filtering and sorting…" → `paginations`;
 *   - H17 "start and stop timers per task, …, a weekly timesheet report, …, and
 *     persistent data" → `starts`, `task_stop_timers`, `reports`, `persistents`;
 *   - H19 "barcode generation …, low-stock alerts, a FIFO stock valuation
 *     report" → `generations`, `alerts`, `reports`;
 *   - "search by title" → `titles`, «بحث بالكلمات المتقاربة» → a transliterated
 *     table; "change their status" → `status`; «تعمل بلوحة المفاتيح» → `workings`.
 * A bare control verb acts on a record, a process noun is a capability, a
 * report or a timer is a feature, a search by a field searches by a field, a
 * verb says how the app behaves, and persistence is a quality of the build.
 * The records each list names are still read, every one of them.
 */
import { listedRecords } from '../core/design/named-entities';
import { isActionWord, isFeaturePhrase } from '../core/design/listed-request';
import { requestedRecords } from '../core/quality/request-coverage';

const H13 = 'Build a project management REST API only, with Node, Express and SQLite: organizations, projects, tasks and comments; JWT authentication with refresh tokens; role-based permissions per organization; pagination, filtering and sorting; OpenAPI documentation; and a full test suite.';
const H17 = 'Build a time tracking app: projects and tasks, start and stop timers per task, manual entries, a weekly timesheet report, CSV export, charts per project, and persistent data.';
const H19 = 'Build an inventory system: products, warehouses, stock movements (in, out, transfer), barcode generation and scanning with the camera, low-stock alerts, a FIFO stock valuation report, and tests.';
const LIBRARY = 'Build a library API with: books, members, search by title, loans and fines.';

const keys = (request: string) => requestedRecords(request, { backendRequested: true }).entities.map(e => e.key);
const recordItems = (request: string) => listedRecords(request, { backend: true }).entries.filter(e => e.as === 'record').map(e => e.item);

describe('a feature he lists is no record', () => {
    it('reads the four records of the project API, and pagination as none', () => {
        expect(keys(H13)).toEqual(['organizations', 'projects', 'tasks', 'comments']);
    });

    it('reads projects, tasks and entries of the time tracker, and its timers, report and persistence as none', () => {
        expect(keys(H17)).toEqual(['projects', 'tasks', 'entries']);
    });

    it('reads products, warehouses and movements of the inventory, and its generation, alerts and report as none', () => {
        const read = keys(H19);
        expect(read).toEqual(expect.arrayContaining(['products', 'warehouses', 'movements']));
        for (const phantom of ['generations', 'alerts', 'reports']) expect(read).not.toContain(phantom);
    });

    it('reads a search by a field as a capability, never a table of that field', () => {
        expect(keys(LIBRARY)).toEqual(expect.arrayContaining(['books', 'members', 'loans', 'fines']));
        expect(keys(LIBRARY)).not.toContain('titles');
        const arabic = listedRecords('نظام دعم فني بباك اند: التذاكر، العملاء، بحث بالكلمات المتقاربة، والموظفين', { backend: true });
        expect(arabic.entries.find(e => e.item.includes('بالكلمات'))?.as).toBe('capability');
        expect(arabic.entries.filter(e => e.as === 'record').map(e => e.key)).not.toContain('balklmat_mtqarbas');
    });

    it('reads a bare start, stop, pause or resume as an action, in both languages', () => {
        for (const word of ['start', 'stop', 'pause', 'resume', 'تشغيل', 'وإيقاف', 'بدء', 'استئناف']) expect(isActionWord(word)).toBe(true);
    });

    it('reads a report, a timer and a chart per record as features', () => {
        for (const item of ['a weekly timesheet report', 'FIFO stock valuation report', 'stop timers per task', 'charts per project', 'تقرير بالكتب الأكثر إعارة']) {
            expect(isFeaturePhrase(item)).toBe(true);
        }
    });

    it('reads changing their status, a file upload and how the app works as no record', () => {
        const portal = 'Build a job portal backend: jobs, applicants, CV file upload, change their status, and notifications log';
        expect(recordItems(portal)).not.toEqual(expect.arrayContaining(['change their status']));
        expect(recordItems(portal)).not.toContain('CV file upload');
        expect(recordItems(portal)).toEqual(expect.arrayContaining(['jobs', 'applicants']));
        const game = listedRecords('ابني لعبة: ثلاث مراحل، أعداء يتحركون، عملات ونقاط، وتعمل بلوحة المفاتيح وباللمس على الجوال.', { backend: true });
        expect(game.entries.filter(e => e.as === 'record').map(e => e.key)).not.toContain('workings');
    });

    it('still reads every record the hard exam\'s first half named', () => {
        const school = 'Build a school management system with a backend: students, teachers, classes, subjects, grades, attendance, and a timetable.';
        expect(keys(school)).toEqual(expect.arrayContaining(['students', 'teachers', 'classes', 'subjects', 'grades']));
        expect(keys('Backend for a gym: members, trainers, subscriptions, class bookings, and payments')).toEqual(expect.arrayContaining(['members', 'trainers', 'subscriptions', 'payments']));
    });
});
