package ai.joe.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the phone restarts (or the app is updated), a linked phone calls Joe again by itself. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (new Prefs(c).linked()) LinkService.start(c);
    }
}
