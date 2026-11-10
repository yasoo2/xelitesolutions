package ai.joe.phone;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * What a WebView lacks and Joe's chat needs, given to his page as JoeNative:
 * Android's own speech recognizer (the page's microphone) and voice (Joe
 * speaking). The page turns these into the speech objects it already uses
 * (web/src/lib/joe-app-bridge.ts), so the chat works the same in a browser
 * and here. Events come back as window.__joeNativeEvent({kind, …}).
 *
 * Only Joe's own address may use it: on any other page every call does
 * nothing, and the key that links this phone never leaves Prefs.
 */
final class JoeBridge {
    private final MainActivity act;
    private final WebView web;
    private final String origin;
    private volatile String page = "";
    private SpeechRecognizer rec;
    private String waitingLang = null;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final List<String[]> toSay = new ArrayList<>();

    JoeBridge(MainActivity act, WebView web, String origin) {
        this.act = act;
        this.web = web;
        this.origin = origin;
    }

    /** «http://127.0.0.1:5047/chat?x» → «http://127.0.0.1:5047»; "" for anything that is not http(s). */
    static String originOf(String url) {
        try {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https") || u.getHost() == null) return "";
            return scheme + "://" + u.getHost().toLowerCase(Locale.ROOT) + (u.getPort() > 0 ? ":" + u.getPort() : "");
        } catch (Exception e) { return ""; }
    }

    void page(String url) { page = url == null ? "" : url; }

    private boolean trusted() { return !origin.isEmpty() && origin.equals(originOf(page)); }

    /* ───────────── what the page asks ───────────── */

    @JavascriptInterface public String info() {
        if (!trusted()) return "{}";
        try {
            Prefs p = new Prefs(act);
            return new JSONObject().put("app", 1).put("phone", "app:" + p.id()).put("name", p.name())
                    .put("listen", SpeechRecognizer.isRecognitionAvailable(act)).put("speak", true).toString();
        } catch (Exception e) { return "{}"; }
    }

    /** granted, or prompt: Android asks him the first time the microphone is used. */
    @JavascriptInterface public String micState() { return act.micAllowed() ? "granted" : "prompt"; }

    @JavascriptInterface public void listen(String lang) {
        if (!trusted()) return;
        act.runOnUiThread(() -> startListening(lang == null ? "" : lang));
    }

    @JavascriptInterface public void stopListening() { act.runOnUiThread(() -> { if (rec != null) rec.stopListening(); }); }

    @JavascriptInterface public void abortListening() {
        act.runOnUiThread(() -> {
            waitingLang = null;
            if (rec != null) { rec.cancel(); emit("listen", "end", null); }
        });
    }

    @JavascriptInterface public void speak(String id, String text, String lang) {
        if (!trusted() || text == null) return;
        act.runOnUiThread(() -> say(id == null ? "" : id, text, lang == null ? "" : lang));
    }

    @JavascriptInterface public void cancelSpeech() { act.runOnUiThread(() -> { toSay.clear(); if (tts != null) tts.stop(); }); }

    @JavascriptInterface public void openSetup() {
        if (!trusted()) return;
        act.runOnUiThread(() -> act.startActivity(new Intent(act, SetupActivity.class)));
    }

    /* ───────────── listening ───────────── */

    private void startListening(String lang) {
        if (!act.micAllowed()) { waitingLang = lang; act.askMic(); return; }
        if (!SpeechRecognizer.isRecognitionAvailable(act)) { emit("listen", "error", "service-not-allowed"); emit("listen", "end", null); return; }
        if (rec == null) {
            rec = SpeechRecognizer.createSpeechRecognizer(act);
            rec.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { emit("listen", "start", null); }
                @Override public void onBeginningOfSpeech() { emit("listen", "audiostart", null); }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onError(int code) { emit("listen", "error", errorName(code)); emit("listen", "end", null); }
                @Override public void onResults(Bundle b) {
                    ArrayList<String> said = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = said != null && !said.isEmpty() ? said.get(0) : "";
                    if (!text.isEmpty()) emitText(text); else emit("listen", "error", "no-speech");
                    emit("listen", "end", null);
                }
                @Override public void onPartialResults(Bundle b) { }
                @Override public void onEvent(int t, Bundle b) { }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if (!lang.isEmpty()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        rec.startListening(i);
    }

    /** His answer to Android's «allow the microphone?». */
    void micAnswered(boolean yes) {
        String lang = waitingLang;
        waitingLang = null;
        if (lang == null) return;
        if (yes) startListening(lang);
        else { emit("listen", "error", "not-allowed"); emit("listen", "end", null); }
    }

    /** Android's recognizer errors, named as the page's speech recognition names them. */
    private static String errorName(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "no-speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "not-allowed";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER: return "network";
            case SpeechRecognizer.ERROR_AUDIO: return "audio-capture";
            case SpeechRecognizer.ERROR_CLIENT: return "aborted";
            default: return "failed";
        }
    }

    /* ───────────── speaking ───────────── */

    private void say(String id, String text, String lang) {
        if (tts == null) {
            tts = new TextToSpeech(act, status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                List<String[]> queued = new ArrayList<>(toSay);
                toSay.clear();
                for (String[] q : queued) {
                    if (ttsReady) say(q[0], q[1], q[2]); else emitSpeech(q[0], "error");
                }
            });
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String u) { emitSpeech(u, "start"); }
                @Override public void onDone(String u) { emitSpeech(u, "end"); }
                @Override public void onError(String u) { emitSpeech(u, "error"); }
                @Override public void onStop(String u, boolean interrupted) { emitSpeech(u, "end"); }
            });
        }
        if (!ttsReady) { toSay.add(new String[]{id, text, lang}); return; }
        Locale want = lang.isEmpty() ? (text.matches("(?s).*[\\u0600-\\u06FF].*") ? Locale.forLanguageTag("ar") : Locale.getDefault()) : Locale.forLanguageTag(lang);
        int set = tts.setLanguage(want);
        if (set == TextToSpeech.LANG_MISSING_DATA || set == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.forLanguageTag(want.getLanguage()));
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id.isEmpty() ? "joe" : id);
    }

    void close() {
        if (rec != null) { rec.destroy(); rec = null; }
        if (tts != null) { tts.shutdown(); tts = null; }
    }

    /* ───────────── events to the page ───────────── */

    private void emit(String kind, String type, String error) {
        try {
            JSONObject e = new JSONObject().put("kind", kind).put("type", type);
            if (error != null) e.put("error", error);
            send(e);
        } catch (Exception ignored) { }
    }

    private void emitText(String text) {
        try { send(new JSONObject().put("kind", "listen").put("type", "result").put("text", text)); } catch (Exception ignored) { }
    }

    private void emitSpeech(String id, String type) {
        try { send(new JSONObject().put("kind", "speech").put("type", type).put("id", id)); } catch (Exception ignored) { }
    }

    private void send(JSONObject e) {
        final String js = "window.__joeNativeEvent&&window.__joeNativeEvent(" + e + ")";
        act.runOnUiThread(() -> { if (trusted()) web.evaluateJavascript(js, null); });
    }
}
