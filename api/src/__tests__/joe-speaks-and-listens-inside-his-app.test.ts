/**
 * INSIDE THE JOE APP, THE CHAT HEARS AND SPEAKS WITH THE PHONE'S OWN.
 *
 * The owner, 2026-11-08: «users open Joe on their phones and tell it: Joe,
 * turn on the flashlight…». The app shows Joe's page in a WebView, which has
 * no speech recognition; it gives the page Android's own (JoeNative).
 * web/src/lib/joe-app-bridge.ts turns them into the SpeechRecognition and
 * speechSynthesis the composer already uses. Pinned with a fake JoeNative:
 * what is said arrives as the browser's result; errors keep the browser's
 * names; Joe's speech ends call the utterance's own end; cancel ends them;
 * the microphone's permission is the phone's; a browser is left alone.
 */
import { installJoeAppBridge, joeAppInfo } from '../../../web/src/lib/joe-app-bridge';

function fakeWindow(info = { app: 1, phone: 'app:abc', name: 'Fold', listen: true, speak: true }) {
    const calls: string[] = [];
    let mic = 'prompt';
    const w: any = {
        navigator: { language: 'ar-SA', permissions: { query: async (d: any) => ({ state: d?.name === 'camera' ? 'denied' : 'x' }) } },
        document: { documentElement: { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } } },
        JoeNative: {
            info: () => JSON.stringify(info),
            micState: () => mic,
            listen: (lang: string) => calls.push(`listen ${lang}`),
            stopListening: () => calls.push('stop'),
            abortListening: () => calls.push('abort'),
            speak: (id: string, text: string, lang: string) => calls.push(`speak ${id} ${text} ${lang}`),
            cancelSpeech: () => calls.push('cancel'),
            openSetup: () => calls.push('setup'),
        },
    };
    return { w, calls, allowMic: () => { mic = 'granted'; } };
}

describe('the microphone', () => {
    it('what he says arrives as the browser\'s own result, then the end', () => {
        const { w, calls } = fakeWindow();
        expect(installJoeAppBridge(w)).toBe(true);
        const rec = new w.webkitSpeechRecognition();
        expect(w.SpeechRecognition).toBe(w.webkitSpeechRecognition);
        const seen: string[] = [];
        rec.lang = 'ar-SA';
        rec.onstart = () => seen.push('start');
        rec.onresult = (e: any) => seen.push(`said ${e.results[0][0].transcript} ${e.results[0].isFinal}`);
        rec.onend = () => seen.push('end');
        rec.start();
        expect(calls).toEqual(['listen ar-SA']);
        w.__joeNativeEvent({ kind: 'listen', type: 'start' });
        w.__joeNativeEvent({ kind: 'listen', type: 'result', text: 'شغل الكشاف' });
        w.__joeNativeEvent({ kind: 'listen', type: 'end' });
        expect(seen).toEqual(['start', 'said شغل الكشاف true', 'end']);
        // After the end, another start is allowed.
        expect(() => rec.start()).not.toThrow();
    });

    it('errors keep the browser\'s names, so the page says the right thing', () => {
        const { w } = fakeWindow();
        installJoeAppBridge(w);
        const rec = new w.SpeechRecognition();
        let err = '';
        rec.onerror = (e: any) => { err = e.error; };
        rec.start();
        w.__joeNativeEvent({ kind: 'listen', type: 'error', error: 'not-allowed' });
        expect(err).toBe('not-allowed');
    });

    it('the microphone\'s permission is the phone\'s; other permissions are the browser\'s', async () => {
        const { w, allowMic } = fakeWindow();
        installJoeAppBridge(w);
        expect((await w.navigator.permissions.query({ name: 'microphone' })).state).toBe('prompt');
        allowMic();
        expect((await w.navigator.permissions.query({ name: 'microphone' })).state).toBe('granted');
        expect((await w.navigator.permissions.query({ name: 'camera' })).state).toBe('denied');
    });

    it('a phone with no speech recognizer leaves the page without one', () => {
        const { w } = fakeWindow({ app: 1, phone: 'app:abc', name: 'Fold', listen: false, speak: true });
        installJoeAppBridge(w);
        expect(w.SpeechRecognition).toBeUndefined();
    });
});

describe('Joe\'s voice', () => {
    it('speaks through the phone and ends the utterance when the phone has said it', () => {
        const { w, calls } = fakeWindow();
        installJoeAppBridge(w);
        const u = new w.SpeechSynthesisUtterance('أهلاً');
        u.lang = 'ar-SA';
        const seen: string[] = [];
        u.onstart = () => seen.push('start');
        u.onend = () => seen.push('end');
        w.speechSynthesis.speak(u);
        expect(calls[0]).toMatch(/^speak joe-1 أهلاً ar-SA$/u);
        w.__joeNativeEvent({ kind: 'speech', type: 'start', id: 'joe-1' });
        expect(w.speechSynthesis.speaking).toBe(true);
        w.__joeNativeEvent({ kind: 'speech', type: 'end', id: 'joe-1' });
        expect(seen).toEqual(['start', 'end']);
        expect(w.speechSynthesis.speaking).toBe(false);
    });

    it('cancel silences the phone and ends what was speaking, once', () => {
        const { w, calls } = fakeWindow();
        installJoeAppBridge(w);
        const u = new w.SpeechSynthesisUtterance('نص طويل');
        let ends = 0;
        u.onend = () => { ends++; };
        w.speechSynthesis.speak(u);
        w.speechSynthesis.cancel();
        expect(calls).toContain('cancel');
        w.__joeNativeEvent({ kind: 'speech', type: 'end', id: 'joe-1' });
        expect(ends).toBe(1);
    });
});

describe('outside the Joe app', () => {
    it('a browser is left exactly as it is', () => {
        const w: any = { navigator: {}, document: {} };
        expect(installJoeAppBridge(w)).toBe(false);
        expect(joeAppInfo(w)).toBeNull();
        expect(w.speechSynthesis).toBeUndefined();
    });

    it('a page the app does not trust gets nothing from it ({} from info)', () => {
        const { w } = fakeWindow();
        w.JoeNative.info = () => '{}';
        expect(installJoeAppBridge(w)).toBe(false);
    });

    it('it is the first thing the page loads', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs'), path = require('path');
        const main = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'main.tsx'), 'utf8');
        const firstImport = main.split('\n').find((l: string) => /^import\s/u.test(l));
        expect(String(firstImport).trim()).toBe("import './lib/joe-app-bridge';");
    });
});
