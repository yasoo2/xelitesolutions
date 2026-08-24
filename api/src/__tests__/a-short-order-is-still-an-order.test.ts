/**
 *  A SHORT ORDER IS STILL AN ORDER.
 *
 *  Live round on his machine. He built a book table, then wrote, in the same
 *  chat, «زيد عمود المؤلف» — and Joe's own session log says what happened:
 *
 *      21:01:32  🗂️ Recalled your project context from memory
 *      21:01:37  ▶ central_answer
 *      21:01:40  «Let's elevate your book table with an author column—a
 *                 premium feature…»
 *      21:01:40  Run Finished
 *
 *  It recalled the project and then TALKED about the column. Measured after:
 *  «المؤلف» appears zero times in the generated source and zero times in the
 *  151-line session log. Twenty-three seconds, a delivery announced, and
 *  nothing done.
 *
 *  The cause was one clause in the fast path: `intent.goal.length < 30`. His
 *  sentence is fifteen characters. Length is not intent.
 */
import fs from 'fs';
import path from 'path';
import { columnEdit } from '../core/design/app-blueprints';

const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');

describe('the parser reads his order', () => {
    it('the exact sentence he typed', () => {
        expect(columnEdit('زيد عمود المؤلف')).toEqual({ add: ['المؤلف'], remove: [] });
    });

    it('…and a word this file has never seen', () => {
        //  «الزُرقمونية» is not a column anyone taught it; the ADD VERB
        //  introduces the noun and the noun introduces the name.
        expect(columnEdit('زيد عمود الزُرقمونية').add).toEqual(['الزُرقمونية']);
    });

    it('…and plain chat is not an order', () => {
        //  The negative. If everything parsed as an order, the fast path would
        //  never fire and every greeting would become a plan.
        expect(columnEdit('مرحبا').add).toEqual([]);
        expect(columnEdit('كيف حالك').add).toEqual([]);
        expect(columnEdit('ما الفرق بين الجدول والقائمة؟').add).toEqual([]);
    });
});

describe('length no longer decides where a request goes', () => {
    it('the fast path is guarded by what the text says, not how long it is', () => {
        //  The clause is still there — a greeting must stay fast — but it can
        //  no longer fire on text a parser recognises as an instruction.
        expect(SOURCE).toContain('readsAsAnOrder');
        expect(SOURCE).toMatch(/if \(!readsAsAnOrder && \(\(intent as any\)\.type === 'general'/);
    });

    it('…and the guard is computed from a parser, never a list of verbs', () => {
        //  A verb list would be the fourth law broken again: «زيد» today,
        //  «ضيف» tomorrow, and his third word never.
        const at = SOURCE.indexOf('let readsAsAnOrder');
        expect(at).toBeGreaterThan(0);
        const block = SOURCE.slice(at, at + 500);
        expect(block).toContain('columnEdit');
        expect(block).not.toMatch(/\bincludes\(\s*['"]زيد/);
    });
});

describe('and the thing in front of him decides what his word means', () => {
    /**
     *  Straight after the fast path stopped sending short orders to chat,
     *  the same sentence went the other way and reached for a DATABASE:
     *
     *      exec=sqlite3 books.db 'CREATE TABLE IF NOT EXISTS books (…'
     *      Stopped at step «Check if SQLite is installed on the system»
     *
     *  «عمود» is a column in a rendered table and a column in SQL. The
     *  word cannot say which; what he has open can.
     */
    it('a column order with a project open is routed to that project', () => {
        const at = SOURCE.indexOf('THE THING IN FRONT OF HIM DECIDES');
        expect(at).toBeGreaterThan(0);
        const block = SOURCE.slice(at, at + 2200);
        expect(block).toContain("tool: 'project_edit'");
        expect(block).toContain('joeProjects');
    });

    it('…and it decides from what is open, never from a vocabulary', () => {
        //  A list naming sqlite, react, vite or any framework would be the
        //  fourth law broken: the next tool he uses would not be on it.
        const at = SOURCE.indexOf('THE THING IN FRONT OF HIM DECIDES');
        const block = SOURCE.slice(at, at + 2200);
        const code = block.slice(block.indexOf('if (readsAsAnOrder)'));
        expect(code).not.toMatch(/['"](?:sqlite|mysql|postgres|react|vite|next)['"]/i);
    });

    it('…and with nothing open the request keeps its old road', () => {
        //  The negative: with no project, «add a column» really might be
        //  about a database, and this must not hijack it.
        const at = SOURCE.indexOf('THE THING IN FRONT OF HIM DECIDES');
        const block = SOURCE.slice(at, at + 2200);
        expect(block).toMatch(/if \(open\?\.dir/);
    });
});
