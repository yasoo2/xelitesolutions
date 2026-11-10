/**
 * JOE'S CHAT INSIDE THE JOE APP: THE MICROPHONE AND THE VOICE OF THE PHONE.
 *
 * The owner, 2026-11-08: «users download Joe on their phones, open Joe there
 * and tell it: Joe, turn on the flashlight…». The Joe app for Android
 * (mobile/android, MainActivity) opens this page in a WebView, which has no
 * speech recognition and no reliable voice of its own; it gives the page
 * Android's own as `window.JoeNative` (JoeBridge.java). Here they become the
 * very objects the composer already uses — SpeechRecognition and
 * speechSynthesis — so the big microphone, voice mode and Joe speaking work
 * the same in a browser and in the app, with no other change.
 *
 * Imported first in main.tsx: it must run before any module reads them.
 * Outside the Joe app (no JoeNative) it does nothing.
 */

type NativeEvent = { kind: 'listen' | 'speech'; type: string; text?: string; error?: string; id?: string };

export interface JoeNativeApi {
    info(): string;
    micState(): string;
    listen(lang: string): void;
    stopListening(): void;
    abortListening(): void;
    speak(id: string, text: string, lang: string): void;
    cancelSpeech(): void;
    openSetup(): void;
}

export type JoeAppInfo = { app: number; phone: string; name: string; listen: boolean; speak: boolean };

/** What the Joe app says about itself, or null in a browser. */
export function joeAppInfo(w: any = typeof window !== 'undefined' ? window : undefined): JoeAppInfo | null {
    const native: JoeNativeApi | undefined = w?.JoeNative;
    if (!native || typeof native.info !== 'function') return null;
    try {
        const i = JSON.parse(String(native.info() || '{}'));
        return i && i.app ? i as JoeAppInfo : null;
    } catch { return null; }
}

/** Installs the phone's microphone and voice on the page; true when it did. */
export function installJoeAppBridge(w: any = typeof window !== 'undefined' ? window : undefined): boolean {
    const native: JoeNativeApi | undefined = w?.JoeNative;
    if (!native || w.__joeNativeEvent) return false;
    const info = joeAppInfo(w);
    if (!info) return false;

    let listening: any = null;
    const speaking = new Map<string, any>();
    let seq = 0;

    w.__joeNativeEvent = (e: NativeEvent) => {
        if (!e || typeof e !== 'object') return;
        if (e.kind === 'listen') {
            const rec = listening;
            if (!rec) return;
            if (e.type === 'start') rec.onstart?.({ type: 'start' });
            else if (e.type === 'audiostart') rec.onaudiostart?.({ type: 'audiostart' });
            else if (e.type === 'result') {
                const alt = { transcript: String(e.text || ''), confidence: 1 };
                const result: any = [alt];
                result.isFinal = true;
                const results: any = [result];
                rec.onresult?.({ type: 'result', resultIndex: 0, results });
            } else if (e.type === 'error') rec.onerror?.({ type: 'error', error: String(e.error || 'failed') });
            else if (e.type === 'end') { listening = null; rec.onend?.({ type: 'end' }); }
            return;
        }
        if (e.kind === 'speech') {
            const u = speaking.get(String(e.id || ''));
            if (!u) return;
            if (e.type === 'start') { synth.speaking = true; u.onstart?.({ type: 'start', utterance: u }); return; }
            speaking.delete(String(e.id || ''));
            synth.speaking = speaking.size > 0;
            if (e.type === 'error') u.onerror?.({ type: 'error', error: 'synthesis-failed', utterance: u });
            else u.onend?.({ type: 'end', utterance: u });
        }
    };

    /* ── the microphone: SpeechRecognition, answered by Android's recognizer ── */
    if (info.listen) {
        class PhoneRecognition {
            lang = '';
            continuous = false;
            interimResults = false;
            maxAlternatives = 1;
            onstart: any = null; onaudiostart: any = null; onresult: any = null; onerror: any = null; onend: any = null;
            start() {
                if (listening && listening !== this) throw new Error('InvalidStateError: already listening');
                listening = this;
                native!.listen(this.lang || (w.navigator?.language ?? ''));
            }
            stop() { if (listening === this) native!.stopListening(); }
            abort() { if (listening === this) native!.abortListening(); }
            addEventListener(type: string, fn: any) { (this as any)[`on${type}`] = fn; }
            removeEventListener(type: string) { (this as any)[`on${type}`] = null; }
        }
        for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
            try { Object.defineProperty(w, name, { value: PhoneRecognition, configurable: true, writable: true }); } catch { /* keeps the browser's */ }
        }
        // «Allow the microphone?» is Android's question, asked by the app the first time.
        const perms = w.navigator?.permissions;
        if (perms && typeof perms.query === 'function') {
            const query = perms.query.bind(perms);
            try {
                perms.query = (d: any) => (d && d.name === 'microphone'
                    ? Promise.resolve({ state: native!.micState() === 'granted' ? 'granted' : 'prompt', onchange: null, addEventListener() { /* none */ }, removeEventListener() { /* none */ } })
                    : query(d));
            } catch { /* a read-only permissions object: the start itself will ask */ }
        }
    }

    /* ── the voice: speechSynthesis, spoken by Android's own ── */
    class PhoneUtterance {
        text: string; lang = ''; voice: any = null; rate = 1; pitch = 1; volume = 1;
        onstart: any = null; onend: any = null; onerror: any = null; onpause: any = null; onresume: any = null; onboundary: any = null; onmark: any = null;
        constructor(text = '') { this.text = String(text); }
        addEventListener(type: string, fn: any) { (this as any)[`on${type}`] = fn; }
        removeEventListener(type: string) { (this as any)[`on${type}`] = null; }
    }
    const synth: any = {
        speaking: false, pending: false, paused: false, onvoiceschanged: null,
        getVoices: () => [],
        speak(u: any) {
            const id = `joe-${++seq}`;
            speaking.set(id, u);
            native!.speak(id, String(u?.text || ''), String(u?.lang || ''));
        },
        cancel() {
            const all = [...speaking.values()];
            speaking.clear();
            synth.speaking = false;
            native!.cancelSpeech();
            for (const u of all) { try { u.onend?.({ type: 'end', utterance: u }); } catch { /* the page's own */ } }
        },
        pause() { /* Android's voice has no pause: nothing */ },
        resume() { /* nothing paused */ },
        addEventListener() { /* no voices change */ },
        removeEventListener() { /* none */ },
    };
    try { Object.defineProperty(w, 'speechSynthesis', { value: synth, configurable: true, writable: true }); } catch { /* keeps the browser's */ }
    if (typeof w.SpeechSynthesisUtterance !== 'function' || !w.speechSynthesis?.getVoices) {
        try { Object.defineProperty(w, 'SpeechSynthesisUtterance', { value: PhoneUtterance, configurable: true, writable: true }); } catch { /* none */ }
    }
    w.document?.documentElement?.setAttribute?.('data-joe-app', 'android');
    return true;
}

installJoeAppBridge();
