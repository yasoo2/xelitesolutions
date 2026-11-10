package ai.joe.phone;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * JOE ON THE PHONE: THE CHAT, OPENED ON THE PHONE JOE ACTS ON.
 *
 * The owner, 2026-11-08: «users download Joe on their phones, open Joe there
 * and tell it: Joe, turn on the flashlight; Joe, look at my emails; Joe, go,
 * come…». The app opens on Joe's own chat (his web page, from the address the
 * phone is linked to), and the same app is Joe's hands on this phone
 * (LinkService, JoeAccessibilityService): what he asks here is done here.
 *
 *   - Speaking and hearing: Android's own speech recognizer and voice, given to
 *     the page as JoeNative (JoeBridge), since a WebView has neither; the page
 *     uses them through its usual microphone (web/src/lib/joe-app-bridge.ts).
 *   - The page knows which phone it is on: «JoePhone/<id>» in its user agent.
 *   - Only Joe's own address opens here; any other link opens in the browser.
 *   - A strip on top says when something only he can allow is still off, and
 *     opens the setup; the page can open it too (JoeNative.openSetup).
 */
public class MainActivity extends Activity {
    static final int ASK_MIC = 7, PICK_FILE = 9;
    private WebView web;
    private JoeBridge bridge;
    private TextView strip;
    private ValueCallback<Uri[]> picking;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() { @Override public void run() { showStrip(); main.postDelayed(this, 3000); } };

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Prefs prefs = new Prefs(this);
        if (!prefs.linked()) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        LinkService.start(this);
        final String home = prefs.server().trim().replaceAll("/+$", "");
        final String origin = JoeBridge.originOf(home.matches("(?i)^https?://.*") ? home : "http://" + home);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackgroundColor(Color.WHITE);

        strip = new TextView(this);
        strip.setTextSize(14);
        strip.setTextColor(Color.parseColor("#7C2D12"));
        strip.setBackgroundColor(Color.parseColor("#FFEDD5"));
        strip.setPadding(dp(14), dp(10), dp(14), dp(10));
        strip.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        strip.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        strip.setOnClickListener(v -> startActivity(new Intent(this, SetupActivity.class)));
        strip.setVisibility(View.GONE);
        col.addView(strip, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " JoeApp/1 JoePhone/" + prefs.id());
        bridge = new JoeBridge(this, web, origin);
        web.addJavascriptInterface(bridge, "JoeNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (origin.equals(JoeBridge.originOf(u.toString()))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap icon) { bridge.page(url); }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { bridge.page(url); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // The page's own microphone and camera are not used here: Joe listens through JoeNative.
            @Override public void onPermissionRequest(PermissionRequest r) { r.deny(); }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (picking != null) picking.onReceiveValue(null);
                picking = cb;
                try { startActivityForResult(p.createIntent(), PICK_FILE); return true; }
                catch (Exception e) { picking = null; return false; }
            }
        });
        // A file Joe hands over (a report, an app he built) opens where the phone keeps downloads.
        web.setDownloadListener((url, ua, disposition, mime, length) -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
        });
        col.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(col);

        if (b != null) web.restoreState(b);
        else web.loadUrl(home.matches("(?i)^https?://.*") ? home + "/" : "http://" + home + "/");
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (web != null) web.saveState(out); }
    @Override protected void onResume() { super.onResume(); main.post(refresh); }
    @Override protected void onPause() { super.onPause(); main.removeCallbacks(refresh); }

    @Override protected void onDestroy() {
        if (bridge != null) bridge.close();
        if (web != null) { web.removeJavascriptInterface("JoeNative"); web.destroy(); }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == ASK_MIC && bridge != null) bridge.micAnswered(results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED);
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == PICK_FILE && picking != null) {
            picking.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            picking = null;
        }
    }

    boolean micAllowed() { return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }

    void askMic() { requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, ASK_MIC); }

    /** What is still off that only he can allow, said on top; nothing when all is on. */
    private void showStrip() {
        String missing = JoeAccessibilityService.instance == null ? getString(R.string.strip_accessibility)
                : !SetupActivity.listenerOn(this) ? getString(R.string.strip_notifications)
                : !LinkService.online ? getString(R.string.strip_offline) : "";
        strip.setText(missing);
        strip.setVisibility(missing.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
