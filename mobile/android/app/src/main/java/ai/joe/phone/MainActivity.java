package ai.joe.phone;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * One screen: Joe's address and the six-digit code (filled from a joe://link
 * address when Joe shows one), then the three things only the owner can allow,
 * each with its state: act on the screen, hear notifications, stay connected.
 */
public class MainActivity extends Activity {
    private EditText server, code;
    private TextView status, accState, notifState, battState;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() { @Override public void run() { show(); main.postDelayed(this, 2000); } };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Prefs prefs = new Prefs(this);
        int pad = dp(20);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, pad, pad, pad);
        col.setBackgroundColor(Color.parseColor("#F6F7F6"));

        TextView title = text(getString(R.string.title), 22, true);
        col.addView(title);
        status = text("", 15, false);
        status.setPadding(0, dp(8), 0, dp(16));
        col.addView(status);

        server = field(getString(R.string.server_hint), InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(prefs.server());
        col.addView(server);
        code = field(getString(R.string.code_hint), InputType.TYPE_CLASS_NUMBER);
        col.addView(code);
        Button link = button(getString(R.string.link), true);
        link.setOnClickListener(v -> link());
        col.addView(link);

        col.addView(space(24));
        accState = step(col, getString(R.string.step_accessibility), () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        notifState = step(col, getString(R.string.step_notifications), () -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        battState = step(col, getString(R.string.step_battery), this::askBattery);
        TextView hint = text(getString(R.string.restricted_hint), 13, false);
        hint.setTextColor(Color.parseColor("#6B7280"));
        hint.setPadding(0, dp(8), 0, dp(16));
        col.addView(hint);

        Button unlink = button(getString(R.string.unlink), false);
        unlink.setOnClickListener(v -> { new Prefs(this).forget(); LinkService.stop(this); show(); });
        col.addView(unlink);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(col);
        setContentView(scroll);

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        fromLink(getIntent());
        if (prefs.linked()) LinkService.start(this);
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); fromLink(i); }
    @Override protected void onResume() { super.onResume(); main.post(refresh); }
    @Override protected void onPause() { super.onPause(); main.removeCallbacks(refresh); }

    /** joe://link?server=http://…&code=123456 fills both fields. */
    private void fromLink(Intent i) {
        Uri u = i == null ? null : i.getData();
        if (u == null || !"joe".equals(u.getScheme())) return;
        if (u.getQueryParameter("server") != null) server.setText(u.getQueryParameter("server"));
        if (u.getQueryParameter("code") != null) code.setText(u.getQueryParameter("code"));
    }

    private void link() {
        String s = server.getText().toString().trim();
        String c = code.getText().toString().trim();
        if (s.isEmpty() || !c.matches("\\d{6}")) { status.setText(getString(R.string.bad_code)); return; }
        Prefs p = new Prefs(this);
        p.forget();
        p.pending(s, c);
        LinkService.stop(this);
        LinkService.start(this);
        status.setText("…");
    }

    private void show() {
        Prefs p = new Prefs(this);
        String s = p.linked() ? getString(R.string.linked_as, p.server(), p.name()) + "\n" + getString(LinkService.online ? R.string.online : R.string.offline)
                : getString(R.string.not_linked);
        if (!LinkService.online && !TextUtils.isEmpty(LinkService.lastError) && !p.pendingCode().isEmpty()) s += "\n" + LinkService.lastError;
        status.setText(s);
        accState.setText(JoeAccessibilityService.instance != null ? getString(R.string.done) : "");
        notifState.setText(listenerOn() ? getString(R.string.done) : "");
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        battState.setText(pm.isIgnoringBatteryOptimizations(getPackageName()) ? getString(R.string.done) : "");
    }

    private boolean listenerOn() {
        String on = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(this, JoeNotificationListener.class).flattenToString());
    }

    private void askBattery() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    /* ───────────── a plain, readable screen, right-to-left in Arabic ───────────── */

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private View space(int h) { View v = new View(this); v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h))); return v; }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor("#111827"));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        return t;
    }

    private EditText field(String hint, int type) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setInputType(InputType.TYPE_CLASS_TEXT | type);
        if (type == InputType.TYPE_CLASS_NUMBER) e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setSingleLine(true);
        e.setMinHeight(dp(52));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        e.setLayoutParams(lp);
        return e;
    }

    private Button button(String s, boolean primary) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setMinHeight(dp(52));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        bg.setColor(Color.parseColor(primary ? "#0F9D6E" : "#E5E7EB"));
        b.setBackground(bg);
        b.setTextColor(primary ? Color.WHITE : Color.parseColor("#111827"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    /** A step the owner taps to open Android's own setting, with its state beside it. */
    private TextView step(LinearLayout col, String label, Runnable open) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        Button b = button(label, false);
        b.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        b.setOnClickListener(v -> open.run());
        TextView state = text("", 14, true);
        state.setTextColor(Color.parseColor("#0F9D6E"));
        state.setPadding(dp(10), 0, dp(4), 0);
        row.addView(b);
        row.addView(state);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        row.setLayoutParams(lp);
        col.addView(row);
        return state;
    }
}
