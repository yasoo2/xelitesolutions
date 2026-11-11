/**
 * JOE HEARS THE LANGUAGE HE SPEAKS, AND NEVER HIS OWN VOICE.
 *
 * Six defects of the composer's microphone, found by independent review on
 * 2026-11-08 and each traced through web/src/components/CommandComposer.tsx:
 *
 *   1. Dictation followed the interface language, which opens in English by
 *      the owner's decision, so his Arabic was recognised as en-US.
 *   2. On an http address that is not this computer, Chrome's permission
 *      answer is «denied», and he was told to press the lock icon and reload —
 *      which can never work there; the fix is an https address.
 *   3. Pressing voice mode opened the microphone while auto-speak read the
 *      last reply aloud, so the microphone wrote down Joe's own voice.
 *   4. Turning voice mode off while the browser's «Allow?» question was open
 *      stopped nothing: his «Allow» then opened a microphone nobody wanted.
 *   5. The recognizer's effect had no cleanup: a language change left the old
 *      recognizer (and its handlers) alive.
 *   6. The amber problem text was 2.15:1 on the light theme.
 *
 * The listening logic lives in module-level helpers of the composer
 * (createDictation and friends). This file lifts those exact functions out of
 * the .tsx with the TypeScript parser, runs them in a sandbox against a fake
 * browser recognizer, and checks their behaviour — not their spelling. The
 * React wiring around them (which effect calls what, in which order) is
 * pinned by reading the component's own declarations.
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

const HELPERS = [
    'DICTATION_LANGS', 'DICTATION_STORAGE_KEY', 'dictationLangOf', 'pickDictationLang', 'dictationChoices',
    'eventSpeechKey', 'newestText', 'replyToSpeak', 'createDictation', 'micPauseForSpeech', 'micAfterSpeech',
] as const;

const composerSource = () => fs.readFileSync(COMPOSER, 'utf-8');
const composerAst = () => ts.createSourceFile('CommandComposer.tsx', composerSource(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** The composer's own module-level helpers, compiled and run in a sandbox. */
function loadHelpers(): any {
    const sf = composerAst();
    const parts: string[] = [];
    const found = new Set<string>();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && (HELPERS as readonly string[]).includes(st.name.text)) {
            parts.push(st.getText(sf));
            found.add(st.name.text);
        }
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && (HELPERS as readonly string[]).includes(d.name.text)) {
                    parts.push(st.getText(sf));
                    found.add(d.name.text);
                }
            }
        }
    }
    // Every helper must be a top-level declaration: if one moved into the
    // component, this file would otherwise test nothing.
    expect([...found].sort()).toEqual([...HELPERS].sort());
    const js = ts.transpileModule(`${parts.join('\n\n')}\nglobalThis.__helpers = { ${HELPERS.join(', ')} };`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const sandbox: any = {};
    vm.runInNewContext(js, sandbox, { filename: 'CommandComposer.helpers.js' });
    return sandbox.__helpers;
}

/** The text of a declaration inside the component, by name (const x = …). */
function declared(name: string): string {
    const sf = composerAst();
    let out = '';
    const visit = (n: ts.Node) => {
        if (!out && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) out = n.initializer.getText(sf);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!out) throw new Error(`CommandComposer.tsx declares no ${name}`);
    return out;
}

/** The text of the useEffect whose body contains `needle`, with its dependency list. */
function effectWith(needle: string): string {
    const sf = composerAst();
    const hits: string[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect' && n.arguments[0]?.getText(sf).includes(needle)) hits.push(n.getText(sf));
        ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(hits).toHaveLength(1);
    return hits[0];
}

let H: any;
beforeAll(() => { H = loadHelpers(); });

/** A stand-in for the browser's SpeechRecognition that records what was asked of it. */
class FakeRecognition {
    calls: string[] = [];
    lang = '';
    continuous = true;
    interimResults = true;
    onstart: any = null;
    onaudiostart: any = null;
    onend: any = null;
    onresult: any = null;
    onerror: any = null;
    start() { this.calls.push('start'); }
    stop() { this.calls.push('stop'); }
    abort() { this.calls.push('abort'); }
}

function harness(over: Record<string, any> = {}) {
    const log = { listening: [] as boolean[], problems: [] as string[], said: [] as string[], permissionAsked: 0 };
    const made: FakeRecognition[] = [];
    class Rec extends FakeRecognition { constructor() { super(); made.push(this); } }
    const mic = H.createDictation({
        Recognition: Rec,
        lang: 'ar-SA',
        isSecure: () => true,
        permission: async () => { log.permissionAsked++; return 'granted'; },
        t: (k: string) => `«${k}»`,
        onListening: (on: boolean) => log.listening.push(on),
        onProblem: (p: string) => log.problems.push(p),
        onTranscript: (s: string) => log.said.push(s),
        ...over,
    });
    return { mic, rec: made[0], log };
}

const lastProblem = (log: { problems: string[] }) => log.problems[log.problems.length - 1];

describe('1. dictation listens in the language he speaks, not in the default English of the menus', () => {
    it('his saved choice wins; then an interface language he chose; then the browser; then Arabic', () => {
        expect(H.pickDictationLang('ar-SA', 'en', 'en-US')).toBe('ar-SA');
        expect(H.pickDictationLang(null, 'fr', 'ar')).toBe('fr-FR');
        expect(H.pickDictationLang(null, null, 'en-US')).toBe('en-US');
        expect(H.pickDictationLang(null, null, 'ar-EG')).toBe('ar-SA');
        expect(H.pickDictationLang(null, null, 'ja-JP')).toBe('ar-SA');
        expect(H.pickDictationLang(null, null, '')).toBe('ar-SA');
        // A value nobody can listen in is skipped, not trusted.
        expect(H.pickDictationLang('xx-YY', null, 'de-DE')).toBe('de-DE');
        expect(H.pickDictationLang('es', null, 'ar')).toBe('es-ES');
    });

    it('the interface counts only when he chose it: localStorage «lang», never i18n.language', () => {
        const memo = declared('dictationLang');
        expect(memo).toMatch(/uiSaved = localStorage\.getItem\('lang'\)/);
        expect(memo).toMatch(/pickDictationLang\(dictationPick, uiSaved, typeof navigator !== 'undefined' \? navigator\.language : ''\)/);
        expect(memo).not.toMatch(/pickDictationLang\([^)]*i18n\.language/);
        expect(composerSource()).toContain("const DICTATION_STORAGE_KEY = 'joe-dictation-lang';");
        expect(composerSource()).toMatch(/useState<string \| null>\(\(\) => \{\s*try \{ return localStorage\.getItem\(DICTATION_STORAGE_KEY\); \}/);
        expect(declared('chooseDictationLang')).toMatch(/localStorage\.setItem\(DICTATION_STORAGE_KEY, tag\)/);
    });

    it('the recognizer is built with that language, and rebuilt when it changes', () => {
        const { rec } = harness({ lang: 'en-US' });
        expect(rec.lang).toBe('en-US');
        expect(rec.continuous).toBe(false);
        expect(rec.interimResults).toBe(false);
        const effect = effectWith('createDictation(');
        expect(effect).toMatch(/lang: dictationLang,/);
        // Rebuilt for another dictation language only, never for the menus' (t is read through a ref).
        expect(effect).toMatch(/\}, \[dictationLang\]\);?$/);
        // The old mapping from the interface language is gone.
        expect(composerSource()).not.toMatch(/recognition\.lang = \(\{ ar: 'ar-SA'/);
    });

    it('the switch offers Arabic and English, plus the interface language and the one in use', () => {
        const codes = (cur: string, ui: string) => JSON.parse(JSON.stringify(H.dictationChoices(cur, ui))).map((l: any) => l.code);
        expect(codes('ar-SA', 'en')).toEqual(['ar', 'en']);
        expect(codes('en-US', 'ar')).toEqual(['ar', 'en']);
        expect(codes('ar-SA', 'fr')).toEqual(['ar', 'en', 'fr']);
        expect(codes('de-DE', 'fr')).toEqual(['ar', 'en', 'fr', 'de']);
    });

    it('the label under the microphone names the real recognition language, not a fixed pair', () => {
        const src = composerSource();
        expect(src).toContain("t('cc_dictationLang', { lang: dictation.label, tag: dictation.tag })");
        expect(src).not.toContain("t('cc_voiceLangs')");
        expect(src).toMatch(/className="voice-lang-switch" role="group" aria-label=\{t\('cc_dictationSwitch'\)\}/);
        expect(src).toMatch(/aria-pressed=\{l\.tag === dictationLang\}\s*\n\s*onClick=\{\(\) => chooseDictationLang\(l\.tag\)\}/);
    });

    it('both new words exist in all six languages, with the language and its tag', () => {
        const dict = readWeb('i18n.ts');
        const lang = dict.match(/^\s*cc_dictationLang: .*$/gm) || [];
        expect(lang).toHaveLength(6);
        for (const line of lang) {
            expect(line).toContain('{{lang}}');
            expect(line).toContain('{{tag}}');
        }
        expect(dict.match(/^\s*cc_dictationSwitch: .*$/gm) || []).toHaveLength(6);
    });
});

describe('2. an http address that is not this computer is told to use https, not the lock icon', () => {
    it('checks the secure page first: no permission question, no start, the https sentence', async () => {
        const { mic, rec, log } = harness({ isSecure: () => false, permission: async () => { log.permissionAsked++; return 'denied'; } });
        await mic.start();
        expect(lastProblem(log)).toBe('«cc_micInsecure»');
        expect(log.permissionAsked).toBe(0);
        expect(rec.calls).toEqual([]);
        expect(mic.wanted()).toBe(false);
    });

    it('on a secure page a refusal still says how to undo it, and a first time says «Allow»', async () => {
        const denied = harness({ permission: async () => 'denied' });
        await denied.mic.start();
        expect(lastProblem(denied.log)).toBe('«cc_micBlockedHowTo»');
        expect(denied.rec.calls).toEqual([]);

        const prompt = harness({ permission: async () => 'prompt' });
        await prompt.mic.start();
        expect(lastProblem(prompt.log)).toBe('«cc_micAskAllow»');
        expect(prompt.rec.calls).toEqual(['start']);
    });

    it('a refusal reported by the recognizer itself follows the same rule', () => {
        const insecure = harness({ isSecure: () => false });
        insecure.rec.onerror({ error: 'not-allowed' });
        expect(lastProblem(insecure.log)).toBe('«cc_micInsecure»');
        const secure = harness();
        secure.rec.onerror({ error: 'not-allowed' });
        expect(lastProblem(secure.log)).toBe('«cc_micDenied»');
    });

    it('the composer feeds the real secure-context flag', () => {
        expect(effectWith('createDictation(')).toContain('isSecure: () => window.isSecureContext !== false,');
    });
});

describe('3. Joe reads aloud only replies that arrive after voice mode, and never into his own microphone', () => {
    const user = { type: 'user_input', id: 'u1', data: 'hi' };
    const replyA = { type: 'text', id: 'a', data: { text: 'old reply already on screen' } };
    const replyB = { type: 'text', id: 'b', data: { text: 'new reply' } };

    it('the reply on the screen when voice mode turns on is not read; the next one is, once', () => {
        const atStart = [user, replyA];
        const remembered = H.newestText(atStart).key;
        expect(H.replyToSpeak(atStart, remembered)).toBeNull();
        const grown = [...atStart, { type: 'user_input', id: 'u2', data: 'more' }, replyB];
        expect(JSON.parse(JSON.stringify(H.replyToSpeak(grown, remembered)))).toEqual({ key: 'b', text: 'new reply' });
        // Spoken once: the same list re-rendered says nothing more.
        expect(H.replyToSpeak(grown, 'b')).toBeNull();
    });

    it('a run_finished landing after the reply does not hide it', () => {
        const list = [user, replyA, replyB, { type: 'run_finished', id: 'rf' }];
        expect(H.replyToSpeak(list, 'a')?.key).toBe('b');
    });

    it('a reply without an id keeps one identity however many events follow it', () => {
        const noId = { type: 'text', ts: 5, data: { text: 'x' } };
        const k = H.newestText([user, noId]).key;
        expect(k).toBe('text:5:2');
        expect(H.newestText([user, noId, { type: 'step_done', ts: 6 }]).key).toBe(k);
        // A local note whose data is a plain string is not read aloud (as before).
        expect(H.replyToSpeak([user, { type: 'text', ts: 7, data: 'note' }], '')).toBeNull();
    });

    it('the microphone closes before Joe speaks and opens again only after the speech ends', async () => {
        const { mic, rec, log } = harness();
        await mic.start();
        rec.onstart();
        expect(log.listening).toEqual([true]);

        const resume = { current: false };
        H.micPauseForSpeech(mic, resume);
        expect(rec.calls).toEqual(['start', 'abort']);
        expect(resume.current).toBe(true);
        rec.onerror({ error: 'aborted' });
        rec.onend();
        expect(mic.wanted()).toBe(false);

        // While Joe speaks nothing reopens it; when he has finished, it listens again.
        let listened = 0;
        let started: Promise<void> | undefined;
        H.micAfterSpeech(resume, true, () => { listened++; started = mic.start(); });
        await started;
        expect(listened).toBe(1);
        expect(resume.current).toBe(false);
        expect(rec.calls).toEqual(['start', 'abort', 'start']);
    });

    it('a microphone that was not open is not opened by Joe speaking, and voice mode off keeps it closed', () => {
        const { mic, rec } = harness();
        const resume = { current: false };
        H.micPauseForSpeech(mic, resume);
        expect(rec.calls).toEqual([]);
        let listened = 0;
        H.micAfterSpeech(resume, true, () => { listened++; });
        expect(listened).toBe(0);
        resume.current = true;
        H.micAfterSpeech(resume, false, () => { listened++; });
        expect(listened).toBe(0);
        expect(resume.current).toBe(false);
    });

    it('voice mode remembers the newest reply BEFORE it turns on; the effect speaks only replyToSpeak', () => {
        const toggle = declared('toggleVoiceMode');
        const remember = toggle.indexOf('lastSpokenKeyRef.current = newestText(events)?.key');
        const turnOn = toggle.indexOf('setIsVoiceMode(true)');
        expect(remember).toBeGreaterThan(0);
        expect(turnOn).toBeGreaterThan(remember);
        const effect = effectWith('replyToSpeak(');
        expect(effect).toContain('const next = replyToSpeak(events, lastSpokenKeyRef.current);');
        expect(effect).toContain('lastSpokenKeyRef.current = next.key;');
        expect(effect).toMatch(/\}, \[events, isVoiceMode\]\);?$/);
        // The scroll effect no longer speaks whatever is last.
        expect(composerSource()).not.toContain('speak(last.data.text)');
    });

    it('speak() closes the microphone before its first await, and only an end of speech reopens it', () => {
        const speak = declared('speak');
        const pause = speak.indexOf('micPauseForSpeech(recognitionRef.current, resumeListenRef);');
        expect(pause).toBeGreaterThan(0);
        expect(speak.indexOf('await')).toBeGreaterThan(pause);
        expect(speak).not.toContain('startListening');
        for (const end of ['utterance.onend = finish;', 'utterance.onerror = finish;', 'audio.onended = done;', 'audio.onerror = done;', 'audio.play().catch(done);']) {
            expect(speak).toContain(end);
        }
        expect(speak).toContain('const finish = () => { if (id === speechIdRef.current) speechEnded(); };');
        expect(declared('speechEnded')).toContain('micAfterSpeech(resumeListenRef, isVoiceModeRef.current, () => { void startListening(); });');
        // Cancelling is not an end: speak() replacing a speech must not reopen the microphone.
        expect(declared('cancelSpeech')).not.toContain('speechEnded');
        expect(declared('cancelSpeech')).toContain('speechIdRef.current++;');
    });
});

describe('4. voice mode off stops a microphone that is still waiting on the browser', () => {
    it('off during the permission question: start() never reaches the browser', async () => {
        let answer!: (s: string) => void;
        const { mic, rec } = harness({ permission: () => new Promise<string>(r => { answer = r; }) });
        const pending = mic.start();
        expect(mic.wanted()).toBe(true); // set BEFORE the await
        mic.abort();
        expect(rec.calls).toEqual(['abort']);
        answer('prompt');
        await pending;
        expect(rec.calls).toEqual(['abort']);
        expect(mic.wanted()).toBe(false);
    });

    it('off while «Allow?» is open after start(): it aborts, and a late start is closed at once', async () => {
        const { mic, rec, log } = harness({ permission: async () => 'prompt' });
        await mic.start();
        expect(rec.calls).toEqual(['start']);
        mic.abort(); // not listening yet — the old off branch did nothing here
        expect(rec.calls).toEqual(['start', 'abort']);
        rec.onstart(); // he pressed «Allow» after turning voice mode off
        expect(rec.calls).toEqual(['start', 'abort', 'abort']);
        expect(log.listening).not.toContain(true);
    });

    it('end and error clear the wish to listen, so the next press starts again', async () => {
        const { mic, rec } = harness();
        await mic.start();
        expect(mic.wanted()).toBe(true);
        rec.onend();
        expect(mic.wanted()).toBe(false);
        await mic.start();
        rec.onerror({ error: 'no-speech' });
        expect(mic.wanted()).toBe(false);
        expect(rec.calls).toEqual(['start', 'start']);
    });

    it('the off branch always aborts — no isListening condition — and silences Joe', () => {
        const toggle = declared('toggleVoiceMode');
        const off = toggle.slice(toggle.indexOf('setIsVoiceMode(false)'));
        expect(off).toContain('recognitionRef.current?.abort();');
        expect(off).toContain('resumeListenRef.current = false;');
        expect(off).toContain('cancelSpeech();');
        expect(toggle).not.toMatch(/isListening\)\s*recognitionRef/);
        expect(toggle).toContain('isVoiceModeRef.current = on;');
    });

    it('a second press on a listening microphone finishes it (a start still waiting is not cancelled: the-microphone-waits-for-allow.test.ts)', () => {
        const toggle = declared('toggleListening');
        expect(toggle).toMatch(/if \(mic\?\.wanted\(\)\) \{\s*mic\.stop\(\);\s*return;\s*\}/);
    });
});

describe('5. a replaced recognizer is closed and forgotten', () => {
    it('dispose() clears every handler, aborts, and refuses to start again', async () => {
        const { mic, rec } = harness();
        await mic.start();
        mic.dispose();
        for (const h of ['onstart', 'onaudiostart', 'onend', 'onresult', 'onerror'] as const) expect(rec[h]).toBeNull();
        expect(rec.calls).toEqual(['start', 'abort']);
        expect(mic.wanted()).toBe(false);
        await mic.start();
        expect(rec.calls).toEqual(['start', 'abort']);
    });

    it('the effect returns that cleanup, and resets the ref and the listening flag', () => {
        const effect = effectWith('createDictation(');
        // A start still wanted is carried to the next recognizer first (the-microphone-waits-for-allow.test.ts).
        expect(effect).toMatch(/return \(\) => \{[\s\S]*?mic\.dispose\(\);\s*if \(recognitionRef\.current === mic\) recognitionRef\.current = null;\s*setIsListening\(false\);\s*setMicPending\(''\);\s*\};/);
    });

    it('what he says still reaches the box', () => {
        const { rec, log } = harness();
        rec.onresult({ results: [[{ transcript: 'مرحبا جو' }]] });
        rec.onresult({ results: [] });
        expect(log.said).toEqual(['مرحبا جو']);
    });
});

describe('6. the problem sentence is readable on the light theme', () => {
    const lum = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    it('the light theme gives .voice-problem a dark amber', () => {
        expect(readWeb('global.css')).toMatch(/html\[data-theme="light"\] \.voice-problem \{\s*color: #92400E;\s*\}/);
    });

    it('that amber reads at 4.5:1 or more on every light surface; the old one did not', () => {
        // White cards, the canvas (--bg-dark) and --bg-secondary of theme.css's light block.
        for (const bg of ['#FFFFFF', '#F6F7F6', '#EFF2F0']) expect(contrast('#92400E', bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast('#f59e0b', '#FFFFFF')).toBeLessThan(2.5);
    });
});
