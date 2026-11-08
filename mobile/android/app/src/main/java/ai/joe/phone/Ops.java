package ai.joe.phone;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Each operation Joe asks for (the same ones a phone on the cable has:
 * api/src/modules/tools/definitions/EngineAndroidTool.ts), answered with the
 * same fields. Anything that touches the screen wakes it first and needs the
 * accessibility service the owner turned on.
 */
final class Ops {
    private Ops() { }

    static JSONObject run(Context c, String op, JSONObject a) throws Exception {
        boolean woke = false;
        if (op.matches("tap|swipe|type|clear|key|open|uri|email|panel|read|look")) woke = wake(c);
        JSONObject out;
        switch (op) {
            case "screen": out = new JSONObject().put("screen", screen(c)); break;
            case "read": out = new JSONObject().put("controls", hands().controls()).put("screen", screen(c)); break;
            case "look": out = new JSONObject().put("png", hands().screenshotPng()).put("screen", screen(c)); break;
            case "tap": {
                float x = (float) a.getDouble("x"), y = (float) a.getDouble("y");
                long hold = a.optLong("holdMs", 0);
                if (!hands().gesture(x, y, x, y, hold > 0 ? Math.min(Math.max(hold, 400), 5000) : 60)) throw new Exception("the tap did not go through");
                out = text(hold > 0 ? "Pressed and held." : "Tapped.");
                break;
            }
            case "swipe": {
                if (!hands().gesture((float) a.getDouble("x"), (float) a.getDouble("y"), (float) a.getDouble("toX"), (float) a.getDouble("toY"), Math.max(100, a.optLong("ms", 300))))
                    throw new Exception("the swipe did not go through");
                out = text("Swiped.");
                break;
            }
            case "type": if (!hands().type(a.optString("text"), false)) throw new Exception("no field to type in: tap the field first"); out = text("Typed."); break;
            case "clear": if (!hands().type("", true)) throw new Exception("no field to empty: tap the field first"); out = text("The field is empty."); break;
            case "key": out = text(key(c, a.optString("key").toLowerCase(Locale.ROOT))); break;
            case "panel": {
                String p = a.optString("panel");
                int action = "quick_settings".equals(p) ? AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS
                        : "notifications".equals(p) ? AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
                        : Build.VERSION.SDK_INT >= 31 ? AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE : AccessibilityService.GLOBAL_ACTION_BACK;
                if (!hands().performGlobalAction(action)) throw new Exception("the panel did not open");
                out = text("OK");
                break;
            }
            case "open": {
                Intent i = c.getPackageManager().getLaunchIntentForPackage(a.optString("package"));
                if (i == null) throw new Exception("no app «" + a.optString("package") + "» on this phone: android_apps lists them");
                start(i);
                out = text("Opened.");
                break;
            }
            case "uri": {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(a.optString("uri")));
                if (a.optString("package").length() > 0) i.setPackage(a.optString("package"));
                start(i);
                out = text("Opened.");
                break;
            }
            case "email": out = text(email(c, a)); break;
            case "apps": out = new JSONObject().put("apps", apps(c)); break;
            case "torch": out = text(torch(c, a)); break;
            case "volume": out = text(volume(c, a)); break;
            default: throw new Exception("unknown action «" + op + "»");
        }
        if (woke) out.put("woke", true);
        return out;
    }

    private static JSONObject text(String t) throws Exception { return new JSONObject().put("text", t); }

    /** The accessibility service, or the plain reason it is not there. */
    private static JoeAccessibilityService hands() throws Exception {
        JoeAccessibilityService s = JoeAccessibilityService.instance;
        if (s == null) throw new Exception("the owner has not turned on Joe's accessibility service on this phone yet: open the Joe app and allow it (step 1)");
        return s;
    }

    /** Started from the accessibility service: Android lets it open apps from the background. */
    private static void start(Intent i) throws Exception {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        hands().startActivity(i);
    }

    static JSONObject screen(Context c) throws Exception {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
        return new JSONObject().put("awake", pm.isInteractive()).put("locked", km.isKeyguardLocked()).put("secure", km.isDeviceSecure());
    }

    /** A sleeping screen is turned on before anything touches it. */
    @SuppressWarnings("deprecation")
    private static boolean wake(Context c) {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        if (pm.isInteractive()) return false;
        PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "joe:wake");
        w.acquire(3000);
        try { Thread.sleep(500); } catch (InterruptedException ignored) { }
        return true;
    }

    private static String key(Context c, String k) throws Exception {
        JoeAccessibilityService h = hands();
        switch (k) {
            case "back": h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK); return "Pressed back.";
            case "home": h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME); return "Pressed home.";
            case "recent": case "recents": h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS); return "Opened the recent apps.";
            case "notifications": h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS); return "Opened the notifications.";
            case "power": h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_POWER_DIALOG); return "Opened the power menu.";
            case "sleep": case "lock":
                if (Build.VERSION.SDK_INT >= 28) { h.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN); return "Locked the screen."; }
                throw new Exception("locking the screen needs Android 9 or newer");
            case "wakeup": wake(c); return "The screen is on.";
            case "enter": if (!h.enter()) throw new Exception("no field to press Enter in (Android 11+)"); return "Pressed Enter.";
            case "delete": case "del": case "backspace": if (!h.deleteOne()) throw new Exception("no field to delete in"); return "Deleted one character.";
            default: throw new Exception("«" + k + "» is not a key Joe presses on this phone: back, home, recent, notifications, power, sleep, wakeup, enter, delete");
        }
    }

    /** A new email already filled in the mail app asked for (gmail / outlook package), else any mail app. */
    private static String email(Context c, JSONObject a) throws Exception {
        List<String> to = list(a.opt("to"));
        if (to.isEmpty()) throw new Exception("no recipient");
        StringBuilder q = new StringBuilder();
        List<String> cc = list(a.opt("cc"));
        if (!cc.isEmpty()) q.append("cc=").append(Uri.encode(String.join(",", cc)));
        if (a.optString("subject").length() > 0) q.append(q.length() > 0 ? "&" : "").append("subject=").append(Uri.encode(a.optString("subject")));
        if (a.optString("body").length() > 0) q.append(q.length() > 0 ? "&" : "").append("body=").append(Uri.encode(a.optString("body")));
        Uri uri = Uri.parse("mailto:" + Uri.encode(String.join(",", to), "@,.") + (q.length() > 0 ? "?" + q : ""));
        Intent i = new Intent(Intent.ACTION_SENDTO, uri);
        String pkg = a.optString("app");
        if (pkg.length() > 0 && installed(c, pkg)) i.setPackage(pkg);
        start(i);
        return "A new email to " + String.join(", ", to) + " is open and filled. Nothing is sent yet.";
    }

    private static boolean installed(Context c, String pkg) {
        try { c.getPackageManager().getPackageInfo(pkg, 0); return true; } catch (PackageManager.NameNotFoundException e) { return false; }
    }

    private static List<String> list(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof JSONArray) { JSONArray a = (JSONArray) v; for (int i = 0; i < a.length(); i++) out.add(a.optString(i)); }
        else if (v instanceof String) for (String s : ((String) v).split("[,;\\s]+")) if (!s.isEmpty()) out.add(s);
        return out;
    }

    /*
     * «يا جو شغل الكشاف» (the owner, 2026-11-08): the flashlight itself, through
     * Android's camera service (no camera permission, no picture), not a tile
     * looked for on the screen. on: true / false; absent: the other way round.
     */
    private static volatile Boolean torchOn = null;
    private static boolean torchWatched = false;

    private static String torch(Context c, JSONObject a) throws Exception {
        CameraManager cm = (CameraManager) c.getSystemService(Context.CAMERA_SERVICE);
        String id = null;
        for (String cam : cm.getCameraIdList()) {
            Boolean flash = cm.getCameraCharacteristics(cam).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            if (Boolean.TRUE.equals(flash)) { id = cam; break; }
        }
        if (id == null) throw new Exception("this phone has no flashlight");
        if (!torchWatched) {
            torchWatched = true;
            cm.registerTorchCallback(new CameraManager.TorchCallback() {
                @Override public void onTorchModeChanged(String cam, boolean enabled) { torchOn = enabled; }
            }, new Handler(Looper.getMainLooper()));
            try { Thread.sleep(150); } catch (InterruptedException ignored) { }
        }
        boolean on = a.has("on") ? a.optBoolean("on") : !Boolean.TRUE.equals(torchOn);
        cm.setTorchMode(id, on);
        return on ? "The flashlight is on." : "The flashlight is off.";
    }

    /** A sound's level: stream media | ring | alarm | notification | call; level 0–100, or change up | down | mute | unmute. */
    private static String volume(Context c, JSONObject a) throws Exception {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        String name = a.optString("stream", "media").toLowerCase(Locale.ROOT);
        int stream = "ring".equals(name) ? AudioManager.STREAM_RING : "alarm".equals(name) ? AudioManager.STREAM_ALARM
                : "notification".equals(name) ? AudioManager.STREAM_NOTIFICATION : "call".equals(name) ? AudioManager.STREAM_VOICE_CALL : AudioManager.STREAM_MUSIC;
        int max = am.getStreamMaxVolume(stream);
        String change = a.optString("change").toLowerCase(Locale.ROOT);
        try {
            if (a.has("level")) {
                int pct = Math.max(0, Math.min(100, a.getInt("level")));
                am.setStreamVolume(stream, Math.round(pct / 100f * max), AudioManager.FLAG_SHOW_UI);
            } else if (change.equals("up") || change.equals("down")) {
                am.adjustStreamVolume(stream, change.equals("up") ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
            } else if (change.equals("mute") || change.equals("unmute")) {
                am.adjustStreamVolume(stream, change.equals("mute") ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI);
            } else if (!change.isEmpty()) throw new Exception("change is up, down, mute or unmute");
        } catch (SecurityException e) {
            throw new Exception("Android allows that only with «Do not disturb» access for Joe (the ring turned fully off): " + e.getMessage());
        }
        int now = am.getStreamVolume(stream);
        return "The " + name + " volume is " + Math.round(now * 100f / Math.max(1, max)) + "% (" + now + " of " + max + ").";
    }

    /** The apps the owner can open: «package — label». */
    private static JSONArray apps(Context c) {
        JSONArray out = new JSONArray();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        PackageManager pm = c.getPackageManager();
        for (ResolveInfo r : pm.queryIntentActivities(main, 0)) out.put(r.activityInfo.packageName + " — " + r.loadLabel(pm));
        return out;
    }
}
