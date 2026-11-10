/**
 * THE MICROPHONE WAITS FOR «ALLOW», SURVIVES A CHANGE OF THE MENUS' LANGUAGE,
 * AND A LATE END TOUCHES ONLY ITS OWN START.
 *
 * Independent verifiers checked commit 7b3668936 (the dictation rework of
 * joe-hears-the-language-he-speaks.test.ts) on 2026-11-08 and found, in
 * web/src/components/CommandComposer.tsx:
 *
 *   1. A second press on the big microphone while a start was still pending
 *      (the permission query running, or the browser's «Allow?» open)
 *      cancelled it silently: nothing showed a start was waiting (the label
 *      still «Tap to speak», aria-pressed false), so the owner pressed again,
 *      and after «Allow» onstart closed the session — nothing heard, nothing
 *      said.
 *   2. The recognizer's effect depended on t, so changing the interface
 *      language while listening (or while «Allow?» was open) closed the
 *      microphone without a word.
 *   3. One shared «want» flag served every start: a closed session's late
 *      onend cleared the flag of the NEW start, so the microphone Joe's speech
 *      had closed never reopened.
 *   4. Cosmetic: «const EliteLogo =({» lost its space.
 *
 * Like its sister file, this one lifts the composer's own code out of the
 * .tsx with the TypeScript parser and runs it in a sandbox: the module-level
 * createDictation and friends, and — so the wiring is run, not read — the
 * component's own toggleListening, startListening and the recognizer's
 * useEffect callback, with React's part (run the effect, run its cleanup
 * before the next one) played by the test. The browser's recognizer is a fake
 * that, like Chrome, refuses a second start() while a session is still open.
 *
 * To see it fail on older code: extract that tree (`git archive <rev> web/src
 * | tar -x -C <dir>`) and run with JOE_MIC_WEB_SRC=<dir>/web/src.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const WEB_SRC = process.env.JOE_MIC_WEB_SRC || path.join(__dirname, '..', '..', '..', 'web', 'src');
const COMPOSER = path.join(WEB_SRC, 'components', 'CommandComposer.tsx');
const readWeb = (...p: string[]) => fs.readFileSync(path.join(WEB_SRC, ...p), 'utf-8');
const composerSource = () => fs.readFileSync(COMPOSER, 'utf-8');
const composerAst = () => ts.createSourceFile('CommandComposer.tsx', composerSource(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const HELPERS = ['createDictation', 'micPauseForSpeech', 'micAfterSpeech', 'micPermissionState'] as const;

/** The text of a declaration inside the component, by name (const x = …). */
function declared(sf: ts.SourceFile, name: string): string {
    let out = '';
    const visit = (n: ts.Node) => {
        if (!out && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) out = n.initializer.getText(sf);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!out) throw new Error(`CommandComposer.tsx declares no ${name}`);
    return out;
}

/** The one useEffect whose callback contains `needle`: its callback and its dependency list. */
function effectWith(sf: ts.SourceFile, needle: string): { body: string; deps: string } {
    const hits: ts.CallExpression[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect' && n.arguments[0]?.getText(sf).includes(needle)) hits.push(n);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(hits).toHaveLength(1);
    return { body: hits[0].arguments[0].getText(sf), deps: hits[0].arguments[1]?.getText(sf) || '' };
}

/**
 * The composer's helpers and its own microphone wiring, compiled and run in a
 * sandbox. `__lift(env)` gives the component's startListening and
 * toggleListening and its recognizer effect for a dictation language, closed
 * over the fakes in env (refs, state setters, window, navigator).
 */
function loadComposer(): any {
    const sf = composerAst();
    const parts: string[] = [];
    const found = new Set<string>();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && (HELPERS as readonly string[]).includes(st.name.text)) {
            parts.push(st.getText(sf));
            found.add(st.name.text);
        }
    }
    // Every helper must be a top-level declaration: if one moved into the
    // component, this file would otherwise test nothing.
    expect([...found].sort()).toEqual([...HELPERS].sort());
    const effect = effectWith(sf, 'createDictation(');
    const src = `${parts.join('\n\n')}
globalThis.__helpers = { ${HELPERS.join(', ')} };
globalThis.__lift = (env) => {
    const { window, navigator, tRef, t, recognitionRef, restartListenRef, resumeListenRef,
        setIsListening, setMicPending, setMicProblem, setText, cancelSpeech } = env;
    const isSpeaking = false;
    const startListening = ${declared(sf, 'startListening')};
    const toggleListening = ${declared(sf, 'toggleListening')};
    const effectFor = (dictationLang) => (${effect.body});
    return { startListening, toggleListening, effectFor };
};`;
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    const sandbox: any = { setTimeout, clearTimeout };
    vm.runInNewContext(js, sandbox, { filename: 'CommandComposer.microphone.js' });
    return sandbox;
}

let S: any;
let H: any;
beforeAll(() => { S = loadComposer(); H = S.__helpers; });

/** A browser recognizer that, like Chrome, refuses start() while its session is still open. */
class BrowserRecognition {
    calls: string[] = [];
    open = false;
    lang = '';
    continuous = true;
    interimResults = true;
    onstart: any = null;
    onaudiostart: any = null;
    onend: any = null;
    onresult: any = null;
    onerror: any = null;
    start() {
        if (this.open) {
            this.calls.push('start-refused');
            const e: any = new Error('recognition has already started');
            e.name = 'InvalidStateError';
            throw e;
        }
        this.open = true;
        this.calls.push('start');
    }
    stop() { this.calls.push('stop'); }
    abort() { this.calls.push('abort'); }
    /** The browser says it listens (after «Allow», or at once when allowed before). */
    began() { this.onstart?.(); }
    /** The browser closes the session: an error first if it has one, then the end. */
    ended(error?: string) {
        if (error) this.onerror?.({ error });
        this.open = false;
        this.onend?.();
    }
}

const flush = () => new Promise(r => setImmediate(r));

/** A permission question answered when the test says, one answer per question asked. */
function questions() {
    const pending: Array<(state: string) => void> = [];
    return {
        ask: () => new Promise<string>(r => { pending.push(r); }),
        asked: () => pending.length,
        answer: async (state: string) => { const r = pending.shift(); if (!r) throw new Error('nothing was asked'); r(state); await flush(); },
    };
}

/** createDictation alone, against the strict fake. */
function dictation(over: Record<string, any> = {}) {
    const log = { listening: [] as boolean[], pending: [] as string[], problems: [] as string[], said: [] as string[] };
    const made: BrowserRecognition[] = [];
    class Rec extends BrowserRecognition { constructor() { super(); made.push(this); } }
    const mic = H.createDictation({
        Recognition: Rec,
        lang: 'ar-SA',
        isSecure: () => true,
        permission: async () => 'granted',
        t: (k: string) => `«${k}»`,
        onListening: (on: boolean) => log.listening.push(on),
        onPending: (p: string) => log.pending.push(p),
        onProblem: (p: string) => log.problems.push(p),
        onTranscript: (s: string) => log.said.push(s),
        ...over,
    });
    return { mic, rec: made[0], made, log };
}

/** The composer's own wiring: React's part is played here (run the effect; a new language first runs the old cleanup). */
function composer(opts: { ask?: () => Promise<string>; lang?: string } = {}) {
    const made: BrowserRecognition[] = [];
    class Rec extends BrowserRecognition { constructor() { super(); made.push(this); } }
    const ui = { listening: [] as boolean[], pending: [] as string[], problems: [] as string[], text: '' };
    const tRef = { current: (k: string) => `«${k}»` };
    const env = {
        window: { SpeechRecognition: Rec, isSecureContext: true },
        navigator: { permissions: { query: async () => ({ state: opts.ask ? await opts.ask() : 'granted' }) } },
        tRef,
        t: (k: string) => tRef.current(k),
        recognitionRef: { current: null as any },
        restartListenRef: { current: false },
        resumeListenRef: { current: false },
        setIsListening: (on: boolean) => ui.listening.push(on),
        setMicPending: (p: string) => ui.pending.push(p),
        setMicProblem: (p: string) => ui.problems.push(p),
        setText: (f: (prev: string) => string) => { ui.text = f(ui.text); },
        cancelSpeech: () => { /* Joe is silent in these cases */ },
    };
    const c = S.__lift(env);
    let cleanup: (() => void) | undefined;
    const mount = (lang: string) => { cleanup?.(); cleanup = c.effectFor(lang)(); };
    mount(opts.lang || 'ar-SA');
    return {
        press: () => c.toggleListening(),
        listen: () => c.startListening(),
        mount,
        unmount: () => cleanup?.(),
        mic: () => env.recognitionRef.current,
        made,
        ui,
        tRef,
    };
}

const last = <T>(a: T[]) => a[a.length - 1];

describe('1. a start still waiting on the browser shows, and a second press waits for it instead of cancelling', () => {
    it('the start says where it stands: starting, then asking while «Allow?» is open, then nothing once it listens', async () => {
        const q = questions();
        const { mic, rec, log } = dictation({ permission: q.ask });
        const started = mic.start();
        expect(mic.pending()).toBe('starting');
        expect(log.pending).toEqual(['starting']);
        await q.answer('prompt');
        await started;
        expect(mic.pending()).toBe('asking');
        expect(last(log.problems)).toBe('«cc_micAskAllow»');
        expect(rec.calls).toEqual(['start']);
        rec.began(); // he pressed «Allow»
        expect(mic.pending()).toBe('');
        expect(log.pending).toEqual(['starting', 'asking', '']);
        expect(log.listening).toEqual([true]);
        expect(last(log.problems)).toBe('');
    });

    it('the composer: presses during the permission question and during «Allow?» keep the start; «Allow» then listens', async () => {
        const q = questions();
        const c = composer({ ask: q.ask });
        c.press();
        c.press(); // nothing seems to happen yet: he presses again
        expect(c.made[0].calls).toEqual([]); // the old second press called stop() here
        expect(c.mic().wanted()).toBe(true);
        expect(c.mic().pending()).toBe('starting');
        expect(last(c.ui.pending)).toBe('starting');

        await q.answer('prompt');
        expect(c.made[0].calls).toEqual(['start']);
        expect(last(c.ui.problems)).toBe('«cc_micAskAllow»');

        const said = c.ui.problems.length;
        c.press(); // and again while «Allow?» is open: the sentence is said again, nothing is cancelled
        expect(c.made[0].calls).toEqual(['start']);
        //  Cleared, then said again a moment later: the same text set twice is never announced
        //  again by role=alert (review, 2026-11-08), so it goes out and comes back.
        await new Promise(r => setTimeout(r, 60));
        expect(c.ui.problems.slice(said)).toEqual(['', '«cc_micAskAllow»']);

        c.made[0].began();
        expect(last(c.ui.listening)).toBe(true);
        expect(last(c.ui.pending)).toBe('');
        expect(c.made[0].calls).toEqual(['start']); // the old code aborted here: its second press had cleared the wish

        c.press(); // listening: a press finishes, as before
        expect(c.made[0].calls).toEqual(['start', 'stop']);
        c.made[0].onresult({ results: [[{ transcript: 'افتح المتصفح' }]] });
        c.made[0].ended();
        expect(c.ui.text).toBe('افتح المتصفح');
        expect(c.mic().wanted()).toBe(false);
        expect(last(c.ui.listening)).toBe(false);
        c.unmount();
    });

    it('every way out of a pending start clears it, so the button never waits for ever', async () => {
        const denied = dictation({ permission: async () => 'denied' });
        await denied.mic.start();
        expect([denied.mic.pending(), last(denied.log.pending), last(denied.log.problems)]).toEqual(['', '', '«cc_micBlockedHowTo»']);

        const insecure = dictation({ isSecure: () => false });
        await insecure.mic.start();
        expect([insecure.mic.pending(), last(insecure.log.pending)]).toEqual(['', '']);

        const off = dictation({ permission: async () => 'prompt' });
        await off.mic.start();
        expect(off.mic.pending()).toBe('asking');
        off.mic.abort(); // voice mode off still cancels a start waiting on «Allow»
        expect([off.mic.pending(), off.mic.wanted(), last(off.log.pending)]).toEqual(['', false, '']);

        const refused = dictation({ permission: async () => 'prompt' });
        await refused.mic.start();
        refused.rec.ended('not-allowed'); // he pressed «Block»
        expect([refused.mic.pending(), refused.mic.wanted(), last(refused.log.problems)]).toEqual(['', false, '«cc_micDenied»']);

        // The browser refuses start() although nothing of ours is open: said, not a button stuck waiting.
        class Broken extends BrowserRecognition { start() { this.calls.push('start-refused'); throw new Error('InvalidStateError'); } }
        const broken = dictation({ Recognition: Broken });
        await broken.mic.start();
        expect([broken.mic.pending(), broken.mic.wanted(), last(broken.log.problems)]).toEqual(['', false, '«cc_micFailed»']);
    });

    it('the button is pressed, busy and pulsing while a start waits, and says so in words', () => {
        const src = composerSource();
        //  While the browser's «Allow?» is open the button says so, not «Connecting…».
        expect(src).toContain("const micStatus = isListening ? t('cc_listening') : micPending === 'asking' ? t('cc_micAskAllow') : micPending ? t('connecting') : t('cc_tapToSpeak');");
        expect(src).toMatch(/className=\{`voice-record-btn\$\{isListening \? ' listening' : micPending \? ' starting' : ''\}`\}\s*\n\s*onClick=\{toggleListening\}\s*\n\s*aria-label=\{micStatus\}\s*\n\s*aria-pressed=\{isListening \|\| !!micPending\}\s*\n\s*aria-busy=\{!!micPending\}/);
        expect(src).toContain('<span className="voice-status">{micStatus}</span>');
        expect(src).toContain('onPending: setMicPending,');
        // The word exists in all six languages (no new word was needed).
        expect(readWeb('i18n.ts').match(/^\s*connecting: .*$/gm) || []).toHaveLength(6);
    });

    it('the pulse is in global.css, and without motion the state still shows as a dashed border', () => {
        const css = readWeb('global.css');
        expect(css).toMatch(/\.voice-record-btn\.starting \{[^}]*animation: voiceMicStarting 1\.2s ease-in-out infinite;[^}]*\}/);
        expect(css).toMatch(/@keyframes voiceMicStarting \{/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.voice-record-btn\.starting \{\s*animation: none;\s*border-style: dashed;\s*\}\s*\}/);
        expect(css).toMatch(/html\[data-theme="light"\] \.voice-record-btn\.starting \{/);
    });
});

describe('2. a change of the interface language neither closes the microphone nor a start waiting on «Allow»', () => {
    it('the recognizer is rebuilt for another dictation language only, and reads the current t through a ref', () => {
        const sf = composerAst();
        const effect = effectWith(sf, 'createDictation(');
        expect(effect.deps).toBe('[dictationLang]');
        expect(effect.body).toContain('t: (key) => tRef.current(key),');
        expect(composerSource()).toMatch(/const tRef = useRef\(t\);\s*\n\s*tRef\.current = t;/);
    });

    it('a start waiting on «Allow» survives a new t, and its later words come in the new language', async () => {
        const q = questions();
        const c = composer({ ask: q.ask });
        c.press();
        await q.answer('prompt');
        const before = c.mic();
        // The menus switch to French: React re-renders with a new t, the effect (deps [dictationLang]) does not re-run.
        c.tRef.current = (k: string) => `«fr:${k}»`;
        expect(c.mic()).toBe(before);
        expect(c.made).toHaveLength(1);
        expect(c.made[0].calls).toEqual(['start']);
        c.made[0].ended('not-allowed');
        expect(last(c.ui.problems)).toBe('«fr:cc_micDenied»');
        c.unmount();
    });

    it('when the dictation language itself changes while he listens, listening goes on in the new language', async () => {
        const c = composer();
        c.press();
        await flush();
        c.made[0].began();
        expect(last(c.ui.listening)).toBe(true);
        c.mount('en-US'); // the switch under the microphone, or an interface language he chose
        expect(c.made[0].calls).toEqual(['start', 'abort']);
        await flush();
        expect(c.made).toHaveLength(2);
        expect(c.made[1].lang).toBe('en-US');
        expect(c.made[1].calls).toEqual(['start']);
        c.made[1].began();
        expect(last(c.ui.listening)).toBe(true);
        c.unmount();
    });

    it('a start still waiting on «Allow» is carried to the new recognizer too; a closed microphone stays closed', async () => {
        const q = questions();
        const c = composer({ ask: q.ask });
        c.press();
        await q.answer('prompt');
        c.mount('fr-FR');
        expect(last(c.ui.pending)).toBe('starting');
        await q.answer('prompt');
        expect(c.made[1].calls).toEqual(['start']);
        expect(c.mic().pending()).toBe('asking');
        c.unmount();

        const idle = composer();
        idle.mount('en-US');
        await flush();
        expect(idle.made[1].calls).toEqual([]);
        idle.unmount();
    });
});

describe('3. a late end of a closed session touches only its own start', () => {
    it('Joe speaks and stops at once; the permission answers before the old session ends: the new start begins after it', async () => {
        const q = questions();
        const { mic, rec, log } = dictation({ permission: q.ask });
        void mic.start();
        await q.answer('granted');
        rec.began();
        const resume = { current: false };
        H.micPauseForSpeech(mic, resume); // Joe is about to speak
        expect(rec.calls).toEqual(['start', 'abort']);
        H.micAfterSpeech(resume, true, () => { void mic.start(); }); // a refused autoplay: the speech is over at once
        await q.answer('granted');
        expect(rec.calls).toEqual(['start', 'abort']); // held: the browser would refuse a second start()
        expect(mic.wanted()).toBe(true);
        const problems = log.problems.length;
        rec.ended('aborted'); // the closed session's late error and end
        expect(log.problems.length).toBe(problems); // its «aborted» says nothing for the new start
        expect(rec.calls).toEqual(['start', 'abort', 'start']);
        rec.began();
        expect(last(log.listening)).toBe(true);
        expect(mic.wanted()).toBe(true);
        expect(rec.calls).not.toContain('start-refused');
    });

    it('the old session ends while the new start still waits on the permission: the new start is kept', async () => {
        const q = questions();
        const { mic, rec, log } = dictation({ permission: q.ask });
        void mic.start();
        await q.answer('granted');
        rec.began();
        const resume = { current: false };
        H.micPauseForSpeech(mic, resume);
        H.micAfterSpeech(resume, true, () => { void mic.start(); });
        rec.ended('aborted');
        expect(mic.wanted()).toBe(true); // the old shared flag was cleared here, and the microphone never reopened
        expect(mic.pending()).toBe('starting');
        await q.answer('granted');
        expect(rec.calls).toEqual(['start', 'abort', 'start']);
        rec.began();
        expect(last(log.listening)).toBe(true);
    });

    it('he finishes and presses again at once: the first words arrive, then the new start begins', async () => {
        const { mic, rec, log } = dictation();
        await mic.start();
        rec.began();
        mic.stop();
        await mic.start();
        expect(rec.calls).toEqual(['start', 'stop']);
        rec.onresult({ results: [[{ transcript: 'الجزء الأول' }]] });
        rec.ended();
        expect(log.said).toEqual(['الجزء الأول']);
        expect(rec.calls).toEqual(['start', 'stop', 'start']);
        rec.began();
        expect(last(log.listening)).toBe(true);
    });

    it('an older session that starts late, after a newer press, is closed and does not count as listening', async () => {
        const { mic, rec, log } = dictation({ permission: async () => 'prompt' });
        await mic.start();
        mic.abort(); // voice mode off while «Allow?» is open
        await mic.start(); // and on again
        expect(rec.calls).toEqual(['start', 'abort']);
        rec.began(); // «Allow» reaches the OLD session
        expect(rec.calls).toEqual(['start', 'abort', 'abort']);
        expect(log.listening).not.toContain(true);
        rec.ended('aborted');
        expect(rec.calls).toEqual(['start', 'abort', 'abort', 'start']);
        rec.began();
        expect(last(log.listening)).toBe(true);
    });
});

describe('4. a permission question that never answers does not hold the microphone for ever', () => {
    it('the answer when there is one; nothing when it hangs, fails, throws or does not exist', async () => {
        await expect(H.micPermissionState({ query: async () => ({ state: 'prompt' }) }, 1000)).resolves.toBe('prompt');
        await expect(H.micPermissionState({ query: () => new Promise(() => { /* never */ }) }, 20)).resolves.toBeUndefined();
        await expect(H.micPermissionState({ query: async () => { throw new TypeError('microphone'); } }, 1000)).resolves.toBeUndefined();
        await expect(H.micPermissionState({ query: () => { throw new TypeError('microphone'); } }, 1000)).resolves.toBeUndefined();
        await expect(H.micPermissionState(undefined, 1000)).resolves.toBeUndefined();
    });

    it('the composer asks through it, with a bound', () => {
        const effect = effectWith(composerAst(), 'createDictation(');
        expect(effect.body).toContain('permission: () => micPermissionState((navigator as any).permissions, 3000),');
    });
});

describe('5. tidy', () => {
    it('«const EliteLogo = ({» has its space again, and the dead cc_voiceLangs is not used', () => {
        const src = composerSource();
        expect(src).toContain('const EliteLogo = ({ size = 120');
        expect(src).not.toContain('const EliteLogo =(');
        expect(src).not.toContain('cc_voiceLangs');
    });
});
