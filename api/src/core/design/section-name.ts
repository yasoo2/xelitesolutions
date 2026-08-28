/**
 *  A REQUIREMENT HE NAMED, TURNED INTO A COMPONENT THAT CAN BE WRITTEN.
 *
 *  «an ingredients list» → `IngredientsList`. «a servings counter with plus and
 *  minus buttons» → `ServingsCounterPlus`. Invented domains work by
 *  construction, because the next request is never on any list:
 *  «a florbing gauge» → `FlorbingGauge`.
 *
 *  ⛔ IT LIVES HERE, AND NOT IN THE TOOL THAT BUILDS, FOR ONE REASON.
 *
 *  Two places need the same answer to «can this sentence become something Joe
 *  builds?»:
 *
 *    · the BUILDER, to decide what to author
 *    · the DECLARATION, to decide whether to tell him «I have no engine for
 *      this — I am building a generic presentation page instead»
 *
 *  They disagreed, and the owner watched the consequence in his own browser:
 *
 *      ANALYSIS: I did not recognise the kind of thing you asked for, and I
 *      have no ready engine for it. I am going to build a generic structure
 *      instead — a presentation page, not a working program. This is what I
 *      could not turn into a deterministic path from your words: «a servings
 *      counter with plus · a print button».
 *
 *  **Both of those become components right here.** The sentence was not a
 *  cautious admission; it was false, and it was the first thing he read.
 *
 *  Two readers of one rule, maintained apart, is the class that has cost this
 *  repository more than any other. So there is one rule, in one file, and both
 *  import it.
 */

/**
 *  Words that carry no meaning for a component's name. Dropping them is what
 *  makes the name STABLE: «the ingredients list» and «an ingredients list» are
 *  the same requirement and must not become two different components.
 */
const STOP = /^(?:a|an|the|and|with|that|this|for|from|of|on|in|to|is|are|it|its|his|her|their|our|your|some|any)$/i;

export function sectionNameFor(requirementText: string): string {
    const words = String(requirementText || '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(w => w && !STOP.test(w))
        .slice(0, 3);
    if (!words.length) return '';
    const name = words
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('')
        .replace(/[^A-Za-z0-9]/g, '');
    //  A React component name must start with a letter and be pronounceable in
    //  a file path. An Arabic requirement yields nothing here, and that is
    //  correct: the caller keeps the template section in that case rather than
    //  writing a file nobody can import.
    return /^[A-Za-z][A-Za-z0-9]{1,40}$/.test(name) ? name : '';
}

/**
 *  Is there anything in this sentence Joe can actually build?
 *
 *  Used by the declaration, so it never tells him «I have no path for your
 *  words» about words that become a component the moment the build starts. A
 *  phrase yields a name only when it has a content word that survives the stop
 *  list and reads as an identifier — which is exactly the test the builder
 *  applies before writing the file.
 */
export function buildableFromWords(phrases: readonly string[]): string[] {
    return (phrases || [])
        .map(p => ({ phrase: String(p || ''), name: sectionNameFor(String(p || '')) }))
        .filter(x => x.name.length > 0)
        .map(x => x.phrase);
}
