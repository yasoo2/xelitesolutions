package ai.joe.phone;

import android.content.Context;
import android.content.SharedPreferences;

/** What the app keeps: Joe's address, and once linked, this phone's id and key (the key lives only here). */
final class Prefs {
    private static final String FILE = "joe_link";
    private final SharedPreferences p;

    Prefs(Context c) { p = c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE); }

    String server() { return p.getString("server", ""); }
    String id() { return p.getString("id", ""); }
    String key() { return p.getString("key", ""); }
    String name() { return p.getString("name", ""); }
    /** A code typed but not used yet: the next connection links with it. */
    String pendingCode() { return p.getString("code", ""); }

    boolean linked() { return !id().isEmpty() && !key().isEmpty() && !server().isEmpty(); }

    void pending(String server, String code) { p.edit().putString("server", server).putString("code", code).apply(); }

    void linkedAs(String id, String key, String name) { p.edit().putString("id", id).putString("key", key).putString("name", name).remove("code").apply(); }

    void forget() { p.edit().remove("id").remove("key").remove("name").remove("code").apply(); }

    /** «192.168.1.89:5047», «http://…», «https://joe.example.com/» → the WebSocket address of Joe's phone link. */
    static String socketUrl(String server) {
        String s = server.trim().replaceAll("/+$", "");
        if (!s.matches("(?i)^https?://.*")) s = "http://" + s;
        return s.replaceFirst("(?i)^http", "ws") + "/ws/phone-link";
    }
}
