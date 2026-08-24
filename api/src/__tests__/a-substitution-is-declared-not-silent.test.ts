/**
 *  SCAFFOLD-FALLBACK-UNGUARDED — the class, not the instance.
 *
 *  The raw evidence this whole file exists for, copied from the owner's own
 *  session on his own machine. He asked for a books table with two named
 *  columns — «بدي جدول للكتب فيه العنوان والسعر» — and Joe recorded:
 *
 *      [20:58:26] template classification: page=generic · app=none ·
 *                 mode=presentation · lang=en (ui=en)
 *      [20:58:27] I don't know this app type and have no ready engine —
 *                 I'll build a generic structure.
 *      ...
 *      [21:01:10] acceptance fidelity verdict: no_known_engine —
 *                 engine=unknown chars=67677
 *
 *  Joe knew, and said so — into the build terminal. The owner reads the
 *  chat. So the substitution happened and he was never told.
 *
 *  Every criterion below is stated twice on purpose: once in a case that
 *  proves it and once in a case that disproves it. A notice that fired on
 *  every request would pass a positive test and be worthless, so the
 *  negative half of each pair is the half that carries the weight.
 */

import fs from 'fs';
import path from 'path';
import {
    scaffoldSubstitutionFor,
    scaffoldSubstitutionNotice,
    announceScaffoldSubstitution,
} from '../core/design/scaffold-substitution';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

/** The exact sentence he typed. Fixed for judgement, never paraphrased. */
const MEASURED_REQUEST = 'بدي جدول للكتب فيه العنوان والسعر';
/** The same request in English, for the assertions about English output. */
const MEASURED_REQUEST_EN = 'Build a books table with a title and a price column';
/** A request the PAGE engine resolves: page=restaurant. Not a substitution. */
const RESOLVED_PAGE_REQUEST = 'ابنِ موقعاً لمطعمي';
/** A request the APP engine resolves: app=weather. Not a substitution. */
const RESOLVED_APP_REQUEST = 'ابنِ لي تطبيق طقس';
/** Not a build at all. */
const QUESTION = 'ما هي عاصمة فرنسا؟';

const MODULE_PATH = path.join(__dirname, '..', 'core', 'design', 'scaffold-substitution.ts');
const CALL_SITE_PATH = path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts');

/** Executable source only — a comment that QUOTES a domain is evidence, not a catalogue. */
function codeWithoutComments(file: string): string {
    return fs.readFileSync(file, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('a substitution is declared, not performed in silence', () => {
    it('the measured request is judged a substitution — page=generic and app=none, exactly as the terminal printed it', () => {
        const verdict = scaffoldSubstitutionFor(MEASURED_REQUEST, true);
        expect(verdict.pageKind).toBe('generic');
        expect(verdict.appKind).toBeNull();
        expect(verdict.substituted).toBe(true);
    });

    it('and the same request is NOT judged a substitution when nothing is being built', () => {
        const verdict = scaffoldSubstitutionFor(MEASURED_REQUEST, false);
        expect(verdict.substituted).toBe(false);
        expect(verdict.notUnderstood).toEqual([]);
        expect(scaffoldSubstitutionNotice(MEASURED_REQUEST, { building: false, isArabic: true })).toBeNull();
    });

    it('the build gate the call site uses is a real gate: his request is a build, a question is not', () => {
        expect(PlanningEngine.looksLikeBuild(MEASURED_REQUEST)).toBe(true);
        expect(PlanningEngine.looksLikeBuild(QUESTION)).toBe(false);
        expect(scaffoldSubstitutionNotice(QUESTION, {
            building: PlanningEngine.looksLikeBuild(QUESTION), isArabic: true,
        })).toBeNull();
    });

    it('a request the PAGE engine resolves is not a substitution and says nothing', () => {
        const resolved = scaffoldSubstitutionFor(RESOLVED_PAGE_REQUEST, true);
        expect(resolved.pageKind).toBe('restaurant');
        expect(resolved.substituted).toBe(false);
        expect(scaffoldSubstitutionNotice(RESOLVED_PAGE_REQUEST, { building: true, isArabic: true })).toBeNull();
        // The positive half of the same criterion, so the silence above is
        // the gate working and not the notice being dead.
        expect(scaffoldSubstitutionNotice(MEASURED_REQUEST, { building: true, isArabic: true })).not.toBeNull();
    });

    it('a request the APP engine resolves is not a substitution and says nothing', () => {
        const resolved = scaffoldSubstitutionFor(RESOLVED_APP_REQUEST, true);
        expect(resolved.appKind).toBe('weather');
        expect(resolved.substituted).toBe(false);
        expect(scaffoldSubstitutionNotice(RESOLVED_APP_REQUEST, { building: true, isArabic: false })).toBeNull();
        expect(scaffoldSubstitutionNotice(MEASURED_REQUEST_EN, { building: true, isArabic: false })).not.toBeNull();
    });

    it('the declaration names what was not understood AND what will be built instead', () => {
        const ar = String(scaffoldSubstitutionNotice(MEASURED_REQUEST, { building: true, isArabic: true }));
        expect(ar).toContain('لم أتعرّف على نوع ما طلبته');
        expect(ar).toContain('هيكلاً عامّاً');
        expect(ar).toContain('لا برنامجاً يعمل');
        expect(ar).toContain('قبل أن أبدأ');
        const en = String(scaffoldSubstitutionNotice(MEASURED_REQUEST_EN, { building: true, isArabic: false }));
        expect(en).toContain('I did not recognise the kind of thing you asked for');
        expect(en).toContain('generic structure');
        expect(en).toContain('not a working program');
        expect(en).toContain('before I start, not after');
    });

    it('and a request that is not a substitution gets none of those sentences at all', () => {
        for (const request of [RESOLVED_PAGE_REQUEST, RESOLVED_APP_REQUEST]) {
            for (const isArabic of [true, false]) {
                const notice = scaffoldSubstitutionNotice(request, { building: true, isArabic });
                expect(notice).toBeNull();
            }
        }
    });

    it('the declaration is written in the reader language, both ways', () => {
        const ar = String(scaffoldSubstitutionNotice(MEASURED_REQUEST, { building: true, isArabic: true }));
        expect(ar).toMatch(/[؀-ۿ]/);
        expect(ar).not.toContain('generic structure');
        const en = String(scaffoldSubstitutionNotice(MEASURED_REQUEST_EN, { building: true, isArabic: false }));
        // His words are quoted verbatim, so this case uses an English request:
        // an English notice quoting an Arabic sentence is correct behaviour and
        // would make a bare script assertion meaningless.
        expect(en).not.toMatch(/[؀-ۿ]/);
        expect(en).not.toContain('هيكلاً عامّاً');
    });

    it('what it says it did not understand comes from HIS words — change them and the quote changes', () => {
        const his = String(scaffoldSubstitutionNotice(MEASURED_REQUEST, { building: true, isArabic: true }));
        expect(his).toContain('«بدي جدول للكتب فيه العنوان والسعر»');
        const other = 'اعمل لي حاجة حلوة';
        const otherNotice = String(scaffoldSubstitutionNotice(other, { building: true, isArabic: true }));
        expect(otherNotice).toContain('حاجة حلوة');
        expect(otherNotice).not.toContain('جدول للكتب');
    });

    it('a request that states features has those features quoted, not a category name', () => {
        const notice = String(scaffoldSubstitutionNotice(MEASURED_REQUEST_EN, { building: true, isArabic: false }));
        expect(notice).toContain('a title');
        expect(notice).toContain('a price column');
        // The negative half: it must not have invented a shape for the request.
        expect(notice.toLowerCase()).not.toContain('landing page');
        expect(notice.toLowerCase()).not.toContain('dashboard');
    });

    it('the judgement reads two classifier facts and no catalogue of shapes — the fourth law', () => {
        const code = codeWithoutComments(MODULE_PATH);
        for (const domain of ['restaurant', 'weather', 'store', 'portfolio', 'blog', 'clinic', 'books', 'مطعم', 'طقس', 'متجر']) {
            expect(code).not.toContain(domain);
        }
        // The positive half: it really does consult the two classifiers whose
        // output the terminal line printed.
        expect(code).toContain('detectPageKind(');
        expect(code).toContain('detectAppKind(');
    });

    it('the announcement reaches the owner channel exactly once, and stays silent when there is nothing to declare', () => {
        const spoken: string[] = [];
        const announced = announceScaffoldSubstitution({
            request: MEASURED_REQUEST, building: true, isArabic: true,
            say: message => { spoken.push(message); },
        });
        expect(announced).toBe(true);
        expect(spoken).toHaveLength(1);
        expect(spoken[0]).toContain('لم أتعرّف على نوع ما طلبته');

        const silent: string[] = [];
        const announcedNothing = announceScaffoldSubstitution({
            request: RESOLVED_APP_REQUEST, building: true, isArabic: true,
            say: message => { silent.push(message); },
        });
        expect(announcedNothing).toBe(false);
        expect(silent).toEqual([]);
    });

    it('a broken channel is reported as unsaid — it never throws into the middle of a build', () => {
        expect(() => announceScaffoldSubstitution({
            request: MEASURED_REQUEST, building: true, isArabic: true,
            say: () => { throw new Error('socket closed'); },
        })).not.toThrow();
        expect(announceScaffoldSubstitution({
            request: MEASURED_REQUEST, building: true, isArabic: true,
            say: () => { throw new Error('socket closed'); },
        })).toBe(false);
    });

    it('the call site declares AFTER the clarify gate and BEFORE the run is executed', () => {
        const source = fs.readFileSync(CALL_SITE_PATH, 'utf-8');
        const clarify = source.indexOf('clarifyGate(');
        const declaration = source.indexOf('announceScaffoldSubstitution({');
        const execution = source.indexOf('AgentOrchestrator');
        expect(clarify).toBeGreaterThan(-1);
        expect(declaration).toBeGreaterThan(-1);
        // Positive: it is inside execute(), after the gate that may end the
        // run with questions, so a clarify turn never carries this notice.
        expect(declaration).toBeGreaterThan(clarify);
        // Negative: it must not have drifted below the point where the run
        // starts. «Stop me now» is only true while nothing has been written.
        const runStart = source.indexOf('new AgentOrchestrator', execution);
        expect(runStart).toBeGreaterThan(-1);
        expect(declaration).toBeLessThan(runStart);
        // And the channel is the chat, not the build terminal — the whole
        // defect was a true sentence delivered to the wrong reader.
        const call = source.slice(declaration, declaration + 600);
        expect(call).toContain('broadcastThinkingDetail(sessionId, message)');
    });
});
