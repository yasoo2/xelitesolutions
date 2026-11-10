package ai.joe.phone;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone's notifications, as Joe's email-reply watch reads them
 * (api/src/core/devices/mail-watch.ts): the app, the sender (title), the
 * subject (text), the first lines, the account (subText). Pushed to Joe the
 * moment one arrives or goes, once the owner allows notification access.
 */
public class JoeNotificationListener extends NotificationListenerService {
    static volatile JoeNotificationListener instance;

    @Override public void onListenerConnected() { instance = this; }
    @Override public void onListenerDisconnected() { instance = null; }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        JSONObject n = describe(sbn);
        if (n != null) LinkService.pushNotice(n);
    }

    @Override public void onNotificationRemoved(StatusBarNotification sbn) {
        JSONObject n = describe(sbn);
        if (n != null) { try { n.put("removed", true); } catch (Exception ignored) { } LinkService.pushNotice(n); }
    }

    /** Every notification on the phone now (sent to Joe on each connection). */
    static JSONArray snapshot() {
        JSONArray list = new JSONArray();
        JoeNotificationListener l = instance;
        if (l == null) return list;
        try {
            for (StatusBarNotification s : l.getActiveNotifications()) { JSONObject n = describe(s); if (n != null) list.put(n); }
        } catch (Exception ignored) { }
        return list;
    }

    private static JSONObject describe(StatusBarNotification sbn) {
        try {
            Notification n = sbn.getNotification();
            Bundle e = n.extras;
            JSONArray lines = new JSONArray();
            CharSequence[] tl = e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (tl != null) for (CharSequence c : tl) lines.put(String.valueOf(c));
            return new JSONObject()
                    .put("pkg", sbn.getPackageName())
                    .put("key", sbn.getKey())
                    .put("title", str(e.getCharSequence(Notification.EXTRA_TITLE)))
                    .put("text", str(e.getCharSequence(Notification.EXTRA_TEXT)))
                    .put("bigText", str(e.getCharSequence(Notification.EXTRA_BIG_TEXT)))
                    .put("subText", str(e.getCharSequence(Notification.EXTRA_SUB_TEXT)))
                    .put("lines", lines)
                    .put("at", sbn.getPostTime());
        } catch (Exception ex) { return null; }
    }

    private static String str(CharSequence c) { return c == null ? "" : c.toString(); }
}
