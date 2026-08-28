/**
 *  SCAFFOLD-FALLBACK-UNGUARDED — A SUBSTITUTION NOBODY WAS TOLD ABOUT.
 *
 *  Measured live on the owner's own machine. He asked, in his own words, for
 *  a books table with two named columns — «بدي جدول للكتب فيه العنوان
 *  والسعر» — and this is what the session recorded, verbatim:
 *
 *      [20:58:26] template classification: page=generic · app=none ·
 *                 mode=presentation · lang=en (ui=en)
 *      [20:58:27] I don't know this app type and have no ready engine —
 *                 I'll build a generic structure.
 *      ...
 *      [21:01:10] acceptance fidelity verdict: no_known_engine —
 *                 engine=unknown chars=67677
 *
 *  Read those two lines together. Joe ALREADY KNEW it had not understood the
 *  request — it said so, at 20:58:27, one second after classifying. It then
 *  built sixty-seven thousand characters of a generic presentation page and
 *  handed it over.
 *
 *      THE DEFECT IS NOT THE FALLBACK. THE DEFECT IS THE ADDRESSEE.
 *
 *  The sentence exists and it is true. It was written into the build
 *  terminal, which is a log; the person who needed it was reading the chat.
 *  So a substitution was performed on the owner's request and the owner was
 *  never told one had happened. He asked for one thing, received another,
 *  and the only record that they were different kinds of thing was a line in
 *  a panel he does not read.
 *
 *      A SILENT SUBSTITUTION IS THE DEFECT. AN ANNOUNCED ONE IS HONEST.
 *
 *  So this module owns one judgement and one sentence: given a request the
 *  engine is about to build, is a substitution happening, and what does the
 *  owner have to be told before it starts.
 *
 *  WHY IT IS SHAPED LIKE THIS — the fourth law, which is not negotiable:
 *  behaviour is derived from the request text, never from a memorised
 *  catalogue of app shapes. There is therefore no list of domains, kinds or
 *  keywords anywhere below. The judgement reads exactly the two facts the
 *  terminal line already printed and nothing else:
 *
 *      page=generic   <=>  detectPageKind(request) === 'generic'
 *      app=none       <=>  detectAppKind(request)  === null
 *
 *  Those two together are precisely `mode=presentation` with no engine
 *  behind it — the measured state above, reproduced as a predicate rather
 *  than as a string match on a log line. When either one resolves to
 *  something, the engine has a deterministic path that came out of his own
 *  sentence and nothing is being substituted: «ابنِ موقعاً لمطعمي» resolves
 *  page=restaurant, «ابنِ لي تطبيق طقس» resolves app=weather, and neither
 *  request is answered with this declaration. That is what keeps the notice
 *  from becoming noise, and it is measured, not assumed.
 *
 *  And the WORDS of the declaration are his, not ours. What it names as «not
 *  understood» comes from the request itself — the features the request
 *  states that no engine covers, and failing that the request's own subject
 *  phrase. A declaration that named a category would be the catalogue
 *  disease wearing an apology.
 */

import { detectPageKind } from './blueprints';
import { buildableFromWords, sectionNameFor } from './section-name';
import { detectAppKind, uncoveredFeatures } from './app-blueprints';
import { subjectPhrase } from './subject-phrase';

export interface ScaffoldSubstitution {
    /**
     * True only when a build is about to run, the engine resolved no
     * application engine, and no page kind either — the exact state the
     * terminal prints as `page=generic · app=none · mode=presentation`.
     */
    substituted: boolean;
    /** The engine that was resolved, or null. Reported so a caller can log the reason. */
    appKind: string | null;
    /** The page kind that was resolved. 'generic' means none was. */
    pageKind: string;
    /**
     * HIS OWN WORDS for the part of the request that has no deterministic
     * path. Never a category name — see the header.
     */
    notUnderstood: string[];
}

/**
 * The judgement, with the caller supplying the one fact this layer cannot
 * see: whether a build is actually about to run. That separation is
 * deliberate. `core/design` classifies requests; deciding that a request is
 * a build belongs to the planner, and a design module that reached into the
 * orchestrator to ask would be inventing a second answer to a question that
 * already has one. It also makes both halves of the criterion testable: the
 * same request declares when it is being built and stays silent when it is
 * not.
 */
export function scaffoldSubstitutionFor(request: string, building: boolean): ScaffoldSubstitution {
    const text = String(request || '');
    const appKind = building ? detectAppKind(text) : null;
    const pageKind = building ? String(detectPageKind(text) || '') : '';
    const noEngine = building && !appKind && (pageKind === '' || pageKind === 'generic');
    /**
     *  ⛔ «NO ENGINE» IS NOT «NO PATH» — BUT SILENCING THE NOTICE WAS THE WRONG
     *  CURE, AND AN EXISTING GUARD CAUGHT ME.
     *
     *  My first repair suppressed the declaration whenever any of his words
     *  yielded a component name. `a-substitution-is-declared-not-silent` went
     *  red on «metre of Arabic poetry» — which becomes `MetreArabicPoetry` and
     *  is still something Joe has no idea how to build. **A name is not a
     *  capability**, and a warning suppressed by the wrong test is a silence
     *  with extra steps.
     *
     *  So the verdict is unchanged — no engine is no engine — and what changed
     *  is the SENTENCE. See `scaffoldSubstitutionNotice`.
     *
     *  Measured by the owner, in his own browser, on his own request:
     *
     *      I have no ready engine for it … a presentation page, not a working
     *      program … I could not turn this into a deterministic path from your
     *      words: «a servings counter with plus · a print button»
     *
     *  **A servings counter and a print button both become components** — the
     *  builder derives `ServingsCounterPlus` and `PrintButton` from those exact
     *  phrases and writes them. There was no engine, and there was a path.
     *
     *  The declaration existed because a silent substitution is worse than an
     *  announced one, and that is still true. But a notice that fires when Joe
     *  CAN build what was asked is worse than either: it is the first thing he
     *  reads, it tells him to stop, and it is wrong.
     *
     *  So the same rule the builder uses is asked here. If nothing in his
     *  sentence yields a component, the notice stands exactly as it was.
     */
    const substituted = noEngine;
    return {
        substituted,
        appKind,
        pageKind,
        notUnderstood: substituted ? notUnderstoodWords(text) : [],
    };
}

/**
 * What to quote back at him.
 *
 * `uncoveredFeatures` reads the features the REQUEST states and removes the
 * ones an engine covers; with no engine, what is left is everything he named
 * and nothing we invented. When his phrasing yields no feature list at all —
 * measured on his own sentence, «بدي جدول للكتب فيه العنوان والسعر» returns
 * an empty list from that reader — the subject phrase of his request is
 * quoted instead. Either way the words on screen are his.
 *
 * It never returns an empty array while a substitution is happening: a
 * declaration that names nothing is the silence this module exists to end,
 * so the raw request is the last resort.
 */
function notUnderstoodWords(request: string): string[] {
    const named = uncoveredFeatures(request, null, false, '')
        .map(feature => String(feature || '').trim())
        .filter(Boolean);
    if (named.length) return named.slice(0, 8);
    const subject = String(subjectPhrase(request) || '').trim();
    if (subject) return [subject];
    const raw = String(request || '').trim().slice(0, 120);
    return raw ? [raw] : [];
}

/**
 * The sentence the owner reads, before the build starts.
 *
 * Null when there is nothing to declare — and null is the correct answer far
 * more often than not. A notice that fired on every build would be read once
 * and then ignored, which is the same silence by a different route.
 *
 * The three things it must contain, because all three were missing from what
 * he was shown: that Joe did not recognise the request, WHAT it is going to
 * build instead, and which of his own words it could not turn into a path.
 * It closes by saying that it is speaking before the work and not after —
 * the whole point of moving this sentence out of the log is that he still
 * has time to correct it.
 */
export function scaffoldSubstitutionNotice(
    request: string,
    options: { building: boolean; isArabic: boolean },
): string | null {
    const verdict = scaffoldSubstitutionFor(request, !!options?.building);
    if (!verdict.substituted) return null;
    const words = verdict.notUnderstood.join(' · ');
    /**
     *  ⛔ WHAT IT WILL BUILD FROM HIS WORDS, WHEN THERE IS ANYTHING.
     *
     *  Measured on his screen, as the FIRST thing Joe said, before a file was
     *  written:
     *
     *      I could not turn this into a deterministic path from your words:
     *      «a servings counter with plus · a print button»
     *
     *  Both of those become components — `ServingsCounterPlus`, `PrintButton` —
     *  and the builder writes them. There was no ENGINE and there was a PATH,
     *  and the sentence conflated the two while telling him to stop.
     *
     *  The warning is right and it stays. What is added is the half that was
     *  missing: the sections it is going to write from those very words. A
     *  notice that says «I cannot» about something it is about to do is worse
     *  than no notice, because he acts on it.
     */
    const willBuild = buildableFromWords(verdict.notUnderstood)
        .map(p => sectionNameFor(p))
        .filter(Boolean)
        .slice(0, 6);
    if (options?.isArabic) {
        return '⚠️ لم أتعرّف على نوع ما طلبته، ولا أملك محرّكاً جاهزاً له. '
            + 'سأبني بدلاً منه هيكلاً عامّاً — صفحة عرض، لا برنامجاً يعمل. '
            + `وهذا ما لا أملك له محرّكاً جاهزاً من كلامك: «${words}». `
            + (willBuild.length
                ? `لكنّي سأكتب هذه الأقسام من كلماتك نفسها: ${willBuild.join(' · ')}. `
                : '')
            + 'أقول هذا قبل أن أبدأ لا بعده — إن لم يكن الهيكل العامّ ما تريد فأوقفني الآن.';
    }
    return 'I did not recognise the kind of thing you asked for, and I have no ready engine for it. '
        + 'I am going to build a generic structure instead — a presentation page, not a working program. '
        + `This is what I have no ready engine for, in your words: «${words}». `
        + (willBuild.length
            ? `I will write these sections from those same words: ${willBuild.join(' · ')}. `
            : '')
        + 'I am saying this before I start, not after — if a generic structure is not what you want, stop me now.';
}

/**
 * The announcement itself, so the ordering is testable rather than asserted
 * about source text: the caller hands over the channel that reaches the
 * owner, and this returns whether anything was said.
 *
 * `say` is deliberately a parameter. The call site passes the chat channel;
 * the test passes a recorder. Nothing here knows about websockets, which is
 * why the negative case — a request with a known engine says NOTHING — can
 * be proven by counting calls instead of by reading a screen.
 */
export function announceScaffoldSubstitution(input: {
    request: string;
    building: boolean;
    isArabic: boolean;
    say: (message: string) => void;
}): boolean {
    const notice = scaffoldSubstitutionNotice(String(input?.request || ''), {
        building: !!input?.building,
        isArabic: !!input?.isArabic,
    });
    if (!notice) return false;
    try {
        input.say(notice);
    } catch {
        // A declaration must never be the thing that kills a run. It failed
        // to reach him; say so by returning false rather than by throwing
        // into the middle of a build.
        return false;
    }
    return true;
}
