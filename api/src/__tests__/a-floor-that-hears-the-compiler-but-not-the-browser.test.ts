/**
 * A FLOOR THAT HEARS THE COMPILER BUT NOT THE BROWSER IS NOT A FLOOR.
 *
 * Measured on a live build, on the owner's machine, minutes after the model
 * was first allowed to author the interface:
 *
 *     ✅ authored   src/components/Hero.jsx    — genuinely not the template
 *     ✅ built      dist/index.html exists, vite exit 0
 *     ❌ ran        empty_page — no button, no link, no form on the page
 *                  page_errors — 5, «TypeError: $.toLowerCase is not a function»
 *                  success: false
 *
 * Joe REFUSED to deliver it, which is the honesty layer working exactly as it
 * should. But the rollback that puts the deterministic sections back only
 * fired when the BUILD failed — and this page compiled. So an authored page
 * that crashes at runtime kept its authored files, and the owner got a
 * refusal with no repair behind it.
 *
 * ⛔ THE CLASS is one this repository already named and paid for: THE GUARD
 * STANDS AT THE WRITER, NOT AT THE READER. «A guard reads what reaches the
 * owner, not what is written in the source.» What reaches him is a rendered
 * page, so the floor has to sit behind the same judge that decides delivery —
 * the browser audit — and not behind the bundler's exit code.
 *
 * This file reads the generator itself, because that is where the ordering
 * lives, and ordering is the whole defect: a rollback written AFTER the point
 * where the verdict is formed would be a rollback nobody reaches.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

describe('the authored interface is rolled back by the browser, not only by the bundler', () => {
    it('POSITIVE — there is a rollback keyed on RUNTIME findings, not just build exit', () => {
        //  The build-failure rollback already existed and was not enough.
        //  This asserts the second one exists at all.
        expect(SRC).toContain('runtimeBlockers');
        expect(SRC).toMatch(/runtimeBlockers[\s\S]{0,400}authoredFallback/);
    });

    it('POSITIVE — and it only fires when the audit really ran', () => {
        //  A skipped audit finds nothing, and «found nothing» must never be
        //  read as «the page is fine» — that is the zero-failed / zero-run
        //  trap wearing the browser's clothes.
        expect(SRC).toMatch(/runtimeBlockers\.length[\s\S]{0,200}!audit\?\.skipped/);
    });

    it('POSITIVE — it rebuilds and re-audits, rather than declaring the repair done', () => {
        //  ⛔ BOUNDED BY STRUCTURE, NOT BY A CHARACTER COUNT.
        //  The first version sliced a fixed 2200 characters and went red the
        //  moment a comment inside the block grew — a guard measuring the
        //  distance between two things instead of the thing itself. It would
        //  also have gone GREEN for the opposite reason, had the window been
        //  wide enough to swallow code belonging to somebody else.
        const block = SRC.slice(
            SRC.indexOf('const runtimeBlockers'),
            SRC.indexOf('if (audit && !someoneIsWatching)'),
        );
        expect({
            rebuilds: block.includes("'run', 'build'"),
            reAudits: block.includes('auditBuiltApp'),
        }).toEqual({ rebuilds: true, reAudits: true });
    });

    it('⛔ ORDERING — the rollback happens BEFORE the delivery verdict is formed', () => {
        //  This is the actual defect, and it is invisible to every other
        //  assertion here. A rollback written after `blockers` is computed
        //  would be perfectly correct code that nothing ever reaches in time.
        const rollbackAt = SRC.indexOf('const runtimeBlockers');
        const verdictAt = SRC.indexOf("const blockers = ((audit?.findings");
        expect({
            rollbackFound: rollbackAt > 0,
            verdictFound: verdictAt > 0,
            rollbackComesFirst: rollbackAt > 0 && verdictAt > 0 && rollbackAt < verdictAt,
        }).toEqual({ rollbackFound: true, verdictFound: true, rollbackComesFirst: true });
    });

    /**
     *  ⛔ AND IT MUST NOT PUNISH THE NEW THING FOR A FAULT THE OLD THING HAS.
     *
     *  Measured on a live build: the authored page returned exactly one
     *  blocker, `form_dead_submit` — a contact form with no server behind it.
     *  The rollback fired, the templates went back, the project rebuilt and
     *  re-audited, and the verdict was the SAME finding. The authored
     *  interface was discarded to repair something it had not broken and could
     *  not fix.
     *
     *  So the trigger is narrowed to faults that mean the authored markup
     *  failed to RENDER. This test pins both halves, because widening it back
     *  would be silent and the page would simply look ordinary again.
     */
    it('POSITIVE — it fires on render faults the authored markup can cause', () => {
        const block = SRC.slice(
            SRC.indexOf('const AUTHORED_RENDER_FAULTS'),
            SRC.indexOf('if (audit && !someoneIsWatching)'),
        );
        for (const id of ['empty_page', 'page_errors', 'console_errors', 'js_errors']) {
            expect({ id, present: block.includes(`'${id}'`) }).toEqual({ id, present: true });
        }
    });

    it('NEGATIVE — and NOT on faults the deterministic page has too', () => {
        const block = SRC.slice(
            SRC.indexOf('const AUTHORED_RENDER_FAULTS'),
            SRC.indexOf('if (audit && !someoneIsWatching)'),
        );
        //  `form_dead_submit` survived a rollback on a real build — proof it is
        //  not attributable to the authoring. `dead_controls` was reported on
        //  a template-only build in the same session.
        const set = block.slice(block.indexOf('new Set('), block.indexOf(']'));
        for (const id of ['form_dead_submit', 'dead_controls']) {
            expect({ id, inTrigger: set.includes(id) }).toEqual({ id, inTrigger: false });
        }
    });

    it('NEGATIVE — both audits are read, because they name the field differently', () => {
        //  app-audit writes `id`, behaviour-audit writes `code`. Reading one
        //  would make every behaviour finding invisible to the trigger — a
        //  guard blind to half its evidence.
        const block = SRC.slice(
            SRC.indexOf('const AUTHORED_RENDER_FAULTS'),
            SRC.indexOf('if (audit && !someoneIsWatching)'),
        );
        expect(block).toMatch(/f\.id \|\| f\.code/);
    });

    it('NEGATIVE — the fallback is emptied when used, so it cannot fire twice', () => {
        //  Bounded on purpose: one rollback, one rebuild, one re-audit. If the
        //  deterministic page is ALSO blocked, that is a defect the authored
        //  sections did not cause and it must stay visible instead of looping.
        expect(SRC).toMatch(/authoredFallback\)\.forEach\(k => delete authoredFallback\[k\]\)/);
    });

    it('NEGATIVE — and the deterministic body is captured BEFORE it is replaced', () => {
        //  A floor recorded after the overwrite is a copy of the authored file
        //  — a rollback that rolls back to the thing it was rolling back from.
        const seam = SRC.slice(SRC.indexOf('for (const [name, code] of Object.entries(authored.files)'));
        const keepAt = seam.indexOf('authoredFallback[rel] = files[rel]');
        const writeAt = seam.indexOf('files[rel] = code');
        expect({ keepFound: keepAt > 0, writeFound: writeAt > 0, keepFirst: keepAt < writeAt })
            .toEqual({ keepFound: true, writeFound: true, keepFirst: true });
    });
});
