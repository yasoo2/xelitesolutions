package ai.joe.phone;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Joe's hands on this phone, once the owner turns the service on: the screen's
 * controls as numbered entries (the same fields as adb's uiautomator, so Joe
 * reads them the same way), a tap or a swipe at a point, text into the focused
 * field, the system keys, and a picture of the screen (Android 11+).
 */
public class JoeAccessibilityService extends AccessibilityService {
    static volatile JoeAccessibilityService instance;

    @Override protected void onServiceConnected() { instance = this; }
    @Override public boolean onUnbind(android.content.Intent intent) { instance = null; return super.onUnbind(intent); }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }

    /** Every control a person could act on or read, numbered, with its centre in screen pixels. */
    JSONArray controls() throws Exception {
        JSONArray out = new JSONArray();
        List<AccessibilityNodeInfo> roots = new ArrayList<>();
        for (AccessibilityWindowInfo w : getWindows()) { AccessibilityNodeInfo r = w.getRoot(); if (r != null) roots.add(r); }
        if (roots.isEmpty() && getRootInActiveWindow() != null) roots.add(getRootInActiveWindow());
        for (AccessibilityNodeInfo r : roots) walk(r, out, 0);
        return out;
    }

    private void walk(AccessibilityNodeInfo n, JSONArray out, int depth) throws Exception {
        if (n == null || out.length() >= 400 || depth > 60) return;
        if (n.isVisibleToUser()) {
            CharSequence text = n.getText();
            CharSequence desc = n.getContentDescription();
            boolean act = n.isClickable() || n.isLongClickable() || n.isEditable() || n.isScrollable() || n.isCheckable();
            boolean hint = Build.VERSION.SDK_INT >= 26 && n.isShowingHintText();
            if (act || (text != null && text.length() > 0) || (desc != null && desc.length() > 0)) {
                Rect b = new Rect();
                n.getBoundsInScreen(b);
                if (b.width() > 1 && b.height() > 1) {
                    String id = n.getViewIdResourceName();
                    String cls = n.getClassName() == null ? "View" : n.getClassName().toString();
                    out.put(new JSONObject()
                            .put("index", out.length())
                            .put("kind", cls.substring(cls.lastIndexOf('.') + 1))
                            .put("text", text == null || hint ? "" : text.toString())
                            .put("description", desc == null ? (hint && text != null ? text.toString() : "") : desc.toString())
                            .put("id", id == null ? "" : id.substring(id.indexOf('/') + 1))
                            .put("packageName", n.getPackageName() == null ? "" : n.getPackageName().toString())
                            .put("x", b.left).put("y", b.top).put("width", b.width()).put("height", b.height())
                            .put("clickable", n.isClickable() || n.isLongClickable())
                            .put("scrollable", n.isScrollable())
                            .put("editable", n.isEditable())
                            .put("checked", n.isCheckable() ? n.isChecked() : JSONObject.NULL)
                            .put("enabled", n.isEnabled())
                            .put("focused", n.isFocused()));
                }
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChild(i), out, depth + 1);
    }

    /** A finger on the screen: a tap, a press held, or a swipe from one point to another. */
    boolean gesture(float x, float y, float toX, float toY, long ms) throws Exception {
        Path path = new Path();
        path.moveTo(x, y);
        if (toX != x || toY != y) path.lineTo(toX, toY);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path, 0, Math.max(1, ms))).build();
        CountDownLatch done = new CountDownLatch(1);
        AtomicBoolean ok = new AtomicBoolean(false);
        boolean sent = dispatchGesture(g, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription d) { ok.set(true); done.countDown(); }
            @Override public void onCancelled(GestureDescription d) { done.countDown(); }
        }, null);
        if (!sent) return false;
        done.await(ms + 3000, TimeUnit.MILLISECONDS);
        return ok.get();
    }

    /** The field the cursor is in, or the only editable field on the screen. */
    private AccessibilityNodeInfo focusedField() {
        AccessibilityNodeInfo f = findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f != null && f.isEditable()) return f;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        return root == null ? null : firstEditable(root);
    }

    private AccessibilityNodeInfo firstEditable(AccessibilityNodeInfo n) {
        if (n == null) return null;
        if (n.isEditable() && n.isVisibleToUser()) return n;
        for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo e = firstEditable(n.getChild(i)); if (e != null) return e; }
        return null;
    }

    /** Types where the cursor is: the text is added after what the field holds (any language). */
    boolean type(String text, boolean replace) {
        AccessibilityNodeInfo f = focusedField();
        if (f == null) return false;
        boolean hint = Build.VERSION.SDK_INT >= 26 && f.isShowingHintText();
        String now = replace || hint || f.getText() == null ? "" : f.getText().toString();
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, now + text);
        return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    /** Enter in the focused field (Android 11+): sends a message, runs a search. */
    boolean enter() {
        AccessibilityNodeInfo f = focusedField();
        if (f == null || Build.VERSION.SDK_INT < 30) return false;
        return f.performAction(android.R.id.accessibilityActionImeEnter);
    }

    /** Deletes the last character of the focused field. */
    boolean deleteOne() {
        AccessibilityNodeInfo f = focusedField();
        if (f == null || f.getText() == null) return false;
        String t = f.getText().toString();
        if (t.isEmpty()) return true;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t.substring(0, t.offsetByCodePoints(t.length(), -1)));
        return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    /** A picture of the whole screen as PNG in base64 (Android 11+), at most 1080 wide. */
    String screenshotPng() throws Exception {
        if (Build.VERSION.SDK_INT < 30) throw new Exception("pictures of the screen need Android 11 or newer; read the screen instead");
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> png = new AtomicReference<>(null);
        AtomicReference<String> err = new AtomicReference<>("no picture");
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            @Override public void onSuccess(ScreenshotResult r) {
                try {
                    Bitmap hw = Bitmap.wrapHardwareBuffer(r.getHardwareBuffer(), r.getColorSpace());
                    Bitmap bmp = hw.copy(Bitmap.Config.ARGB_8888, false);
                    r.getHardwareBuffer().close();
                    if (bmp.getWidth() > 1080) bmp = Bitmap.createScaledBitmap(bmp, 1080, Math.round(bmp.getHeight() * 1080f / bmp.getWidth()), true);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
                    png.set(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                } catch (Exception e) { err.set(String.valueOf(e.getMessage())); }
                done.countDown();
            }
            @Override public void onFailure(int code) { err.set("the phone refused the picture (" + code + ")"); done.countDown(); }
        });
        done.await(10, TimeUnit.SECONDS);
        if (png.get() == null) throw new Exception(err.get());
        return png.get();
    }
}
