package com.phacharapol.dayplanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;
import org.json.JSONObject;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_TICK = "com.phacharapol.dayplanner.TICK";
    public static final String ACTION_DONE = "com.phacharapol.dayplanner.DONE";
    public static final String ACTION_EXTEND = "com.phacharapol.dayplanner.EXTEND";
    public static final String ACTION_REFRESH = "com.phacharapol.dayplanner.REFRESH";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        PendingResult async = goAsync();
        try {
            switch (action) {
                case ACTION_TICK:
                    Scheduler.fireDueReminders(ctx, PlannerStore.load(ctx));
                    break;
                case ACTION_DONE:
                case ACTION_EXTEND:
                    handleBlockAction(ctx, action, intent);
                    break;
                default:
                    // BOOT_COMPLETED, TIME_SET, TIMEZONE_CHANGED, MY_PACKAGE_REPLACED,
                    // exact-alarm permission changes, REFRESH: just re-derive state below.
                    break;
            }
            Scheduler.refresh(ctx);
        } finally {
            async.finish();
        }
    }

    private void handleBlockAction(Context ctx, String action, Intent intent) {
        String id = intent.getStringExtra("id");
        String date = intent.getStringExtra("date");
        if (id == null || date == null) return;
        boolean done = ACTION_DONE.equals(action);
        PlannerStore.mutate(ctx, id, date, done, done ? 0 : 15);
        JSONObject pending = new JSONObject();
        try {
            pending.put("type", done ? "done" : "extend");
            pending.put("id", id);
            pending.put("date", date);
            if (!done) pending.put("minutes", 15);
        } catch (JSONException ignored) {
            return;
        }
        PlannerStore.addPending(ctx, pending);
        // Clear the reminder that carried the button (the Now card is re-synced by refresh()).
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        nm.cancel((id + date + "S").hashCode());
        PlannerPlugin.emitPending();
    }
}
