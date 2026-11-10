package ai.joe.phone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Keeps this phone connected to the owner's Joe (api/src/api/phone-link-socket.ts):
 * says hello with its key (or links with the code he typed), answers Joe's
 * requests one by one, pushes the phone's notifications, and calls again every
 * fifteen seconds when the line drops. Runs as a foreground service with a quiet
 * notice, so Android does not stop it and the owner always sees it is on.
 */
public class LinkService extends Service {
    static final String CHANNEL = "joe_link";
    static volatile boolean online = false;
    static volatile String lastError = "";
    private static volatile LinkService instance;

    private final OkHttpClient http = new OkHttpClient.Builder()
            .pingInterval(25, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build();
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebSocket socket;
    private boolean stopping = false;

    static void start(Context c) {
        Intent i = new Intent(c, LinkService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void stop(Context c) { c.stopService(new Intent(c, LinkService.class)); }

    /** A notification changed on the phone: Joe hears it at once (JoeNotificationListener). */
    static void pushNotice(JSONObject notice) {
        LinkService s = instance;
        if (s != null && s.socket != null && online) {
            try { notice.put("t", "notif"); s.socket.send(notice.toString()); } catch (Exception ignored) { }
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.service_title), NotificationManager.IMPORTANCE_MIN));
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification n = b.setContentTitle(getString(R.string.service_title)).setContentText(getString(R.string.service_text))
                .setSmallIcon(R.drawable.ic_joe).setOngoing(true).setContentIntent(open).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        stopping = false;
        if (socket == null) connect();
        return START_STICKY;
    }

    @Override public void onDestroy() {
        stopping = true;
        instance = null;
        online = false;
        if (socket != null) socket.close(1000, "stopped");
        socket = null;
        work.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void connect() {
        Prefs prefs = new Prefs(this);
        if (prefs.server().isEmpty() || (!prefs.linked() && prefs.pendingCode().isEmpty())) { stopSelf(); return; }
        String url = Prefs.socketUrl(prefs.server()) + (prefs.linked() ? "?phone=" + prefs.id() : "?code=" + prefs.pendingCode());
        socket = http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response r) {
                try {
                    JSONObject hello = new JSONObject().put("t", "hello").put("model", Build.MANUFACTURER + " " + Build.MODEL)
                            .put("android", Build.VERSION.RELEASE);
                    if (prefs.linked()) hello.put("key", prefs.key());
                    ws.send(hello.toString());
                    online = true;
                    lastError = "";
                    // Joe hears every notification on the phone now, then each change.
                    JSONArray list = JoeNotificationListener.snapshot();
                    ws.send(new JSONObject().put("t", "notifs").put("list", list).toString());
                } catch (Exception e) { lastError = String.valueOf(e.getMessage()); }
            }

            @Override public void onMessage(WebSocket ws, String text) {
                try {
                    JSONObject m = new JSONObject(text);
                    String t = m.optString("t");
                    if ("welcome".equals(t)) {
                        prefs.linkedAs(m.getString("id"), m.getString("key"), m.optString("name"));
                    } else if ("forget".equals(t)) {
                        prefs.forget();
                        stopping = true;
                        main.post(() -> stopSelf());
                    } else if ("req".equals(t)) {
                        work.submit(() -> answer(ws, m));
                    }
                } catch (Exception ignored) { }
            }

            @Override public void onClosed(WebSocket ws, int code, String reason) { dropped(code, reason); }

            @Override public void onFailure(WebSocket ws, Throwable e, Response r) {
                dropped(r != null ? r.code() : 0, String.valueOf(e.getMessage()));
            }
        });
    }

    private void answer(WebSocket ws, JSONObject m) {
        JSONObject res = new JSONObject();
        try {
            res.put("t", "res").put("id", m.optString("id"));
            JSONObject data = Ops.run(this, m.optString("op"), m.optJSONObject("args") == null ? new JSONObject() : m.optJSONObject("args"));
            res.put("ok", true).put("data", data);
        } catch (Exception e) {
            try { res.put("ok", false).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        }
        ws.send(res.toString());
    }

    private void dropped(int code, String reason) {
        online = false;
        socket = null;
        lastError = reason == null ? "" : reason;
        // 4404: the owner unlinked this phone in Joe. 4401: the code or key opens nothing.
        if (code == 4404) { new Prefs(this).forget(); stopping = true; }
        if (code == 4401 && !new Prefs(this).linked()) stopping = true;
        if (!stopping) main.postDelayed(this::connect, 15_000);
        else main.post(this::stopSelf);
    }
}
