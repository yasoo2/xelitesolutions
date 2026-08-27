/**
 * JOE BUILT THE APP, THEN WENT LOOKING FOR IT ON THE INTERNET.
 *
 * The simplest prompt anyone has run at Joe, measured live end to end:
 *
 *     prompt : Build a simple counter app with a button that increments the count.
 *     step   : "Verify that the counter increments when the button is clicked"
 *     result : the browser opened a DuckDuckGo search FOR THAT SENTENCE,
 *              browser_run returned ok:true, the run stopped at 3/4
 *
 * ⛔ AND THE CAUSE WAS A CATALOGUE OF PAST PROJECTS. The reader deciding «is he
 * talking about the app I just built?» matched a hard-coded noun list:
 *
 *     app · application · project · site · system · page ·
 *     weathergo · weather · city · cities · favorite · forecast ·
 *     temperature · settings · invalid · api · istanbul
 *
 * — the WeatherGo project's vocabulary, written into a general router. «counter»
 * is not on it. «button» is not on it. So a counter app was invisible to the one
 * function whose whole job was to see it, and the final `else` searched the web
 * for the sentence. **The fourth law in its most literal form: a decision routed
 * from remembered projects instead of from the request.**
 *
 * It also failed in the worst direction. A search page really does load, so
 * `ok: true` was true — 105 steps, a real Browser panel, a real page, and zero
 * evidence. An activity indistinguishable from work.
 *
 * The repair inverts the default: a browser step asks about what was just built
 * unless the instruction NAMES somewhere else. That question can be answered
 * without knowing what kind of app it is, which is precisely why it survives the
 * next request and a noun list cannot.
 */

import fs from 'fs';
import path from 'path';
import {
    asksToOpenTheActiveApp,
    namesAnExternalTarget,
} from '../modules/tools/definitions/BrowserRunTool';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'BrowserRunTool.ts'),
    'utf-8',
);

describe('the app he just built is the default, not the exception', () => {
    it('⛔ POSITIVE — the sentence that sent Joe to DuckDuckGo now means his app', () => {
        //  Verbatim from the live run's evidence file, not paraphrased.
        expect(asksToOpenTheActiveApp('Verify that the counter increments when the button is clicked')).toBe(true);
    });

    it('⛔ POSITIVE — and so does every app nobody thought to add to a list', () => {
        //  The whole point: these pass because nothing about them is known in
        //  advance. A noun list would need a new entry for each, forever.
        for (const step of [
            'Check that the todo item is removed after clicking delete',
            'Confirm the invoice total updates when a row is added',
            'تحقق أن السلة تحسب الإجمالي بعد إضافة منتج',
            'Make sure the dark mode toggle changes the background',
        ]) {
            expect({ step, opensHisApp: asksToOpenTheActiveApp(step) })
                .toEqual({ step, opensHisApp: true });
        }
    });

    it('⛔ NEGATIVE — an explicitly named elsewhere is still elsewhere', () => {
        //  The inversion must not hijack a real external request. Each of these
        //  names its destination out loud.
        for (const step of [
            'Search Google for the latest browser documentation.',
            'Search the web for the latest browser documentation.',
            'افتح جوجل وابحث عن Vite',
            'Open https://example.com and read the title',
            'Look at the pricing on openai.com',
        ]) {
            expect({ step, opensHisApp: asksToOpenTheActiveApp(step) })
                .toEqual({ step, opensHisApp: false });
        }
    });

    it('⛔ the noun catalogue is GONE, not merely bypassed', () => {
        //  Left in place it would be re-consulted by the next reader that wants
        //  a quick answer, and the defect would return wearing a new caller.
        //  «istanbul» is the tell: a city from one past project, in a router
        //  that must serve every future one.
        const decider = SRC.slice(
            SRC.indexOf('export function namesAnExternalTarget'),
            SRC.indexOf('export function asksToOpenTheActiveApp'),
        );
        for (const ghost of ['weathergo', 'istanbul', 'forecast', 'temperature', 'cities', 'favorites']) {
            expect({ ghost, stillRouting: decider.toLowerCase().includes(ghost) })
                .toEqual({ ghost, stillRouting: false });
        }
    });

    it('NEGATIVE — an incomplete external list fails toward his app, never toward the web', () => {
        //  The asymmetry that makes this survivable. A site name missing from
        //  the external list routes to what he built — harmless. The old list
        //  failed the other way, and that is how a build ended up on a search
        //  engine.
        expect(namesAnExternalTarget('Open some-site-nobody-listed.example and read it')).toBe(false);
        expect(asksToOpenTheActiveApp('Open some-site-nobody-listed.example and read it')).toBe(true);
        //  ...while a written-out address is unambiguous and always wins.
        expect(namesAnExternalTarget('Open https://some-site-nobody-listed.example')).toBe(true);
    });

    it('⛔ NEGATIVE — with no address at all it REFUSES, and does not search', () => {
        //  The half that matters most. A search result can never verify a
        //  build, and `ok: true` over one is the lie that made a failed run
        //  look like 105 steps of work.
        expect(SRC).toContain("error: 'no_target_for_this_instruction'");
        expect(SRC).toMatch(/if \(actions\.length === 0 && !namesAnExternalTarget\(instructionText\)\) \{/);
        //  ...and the refusal is reached BEFORE the search chain, or it is
        //  decoration sitting behind the thing it was written to prevent.
        //  ⛔ AND THIS ASSERTION WAS ITSELF THE DEFECT ONCE. Its first form
        //  searched for the assignment without its semicolon, and went red —
        //  because it found that text inside the COMMENT above the refusal,
        //  which quotes the very line it describes. A text search that cannot
        //  tell code from prose is the same failure as a noun list that cannot
        //  tell an app from a city. The semicolon is the difference: prose
        //  quotes the expression, code terminates the statement.
        const refusal = SRC.indexOf("no_target_for_this_instruction");
        const search = SRC.indexOf('targetUrl = agentSearchUrl(instructionText);');
        expect({ refusalExists: refusal > 0, beforeTheSearch: refusal > 0 && refusal < search })
            .toEqual({ refusalExists: true, beforeTheSearch: true });
    });
});
