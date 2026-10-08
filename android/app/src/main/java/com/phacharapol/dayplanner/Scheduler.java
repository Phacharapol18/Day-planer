package com.phacharapol.dayplanner;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

/**
 * Keeps exactly one alarm armed: the next moment anything visible changes (a reminder is due, a
 * block starts or ends, the day rolls over). When it fires, AlarmReceiver refreshes everything and
 * calls back here to arm the following one. One alarm instead of dozens keeps it battery-friendly
 * and impossible to leave stale alarms behind.
 */
public final class Scheduler {
    private static final long PROGRESS_REFRESH_MS = 5 * 60_000L;
    private static final long GRACE_MS = 1_000L;

    private Scheduler() {}

    public static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Refresh notifications + widgets for "now" and arm the next alarm. */
    public static void refresh(Context ctx) {
        Notifier.ensureChannels(ctx);
        PlannerStore.Snapshot s = PlannerStore.load(ctx);
        Notifier.syncNow(ctx, s);
        Widgets.updateAll(ctx);
        arm(ctx, s);
    }

    static void arm(Context ctx, PlannerStore.Snapshot s) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        long now = System.currentTimeMillis();
        long next = nextMidnight(now);
        boolean exactNeeded = false;
        for (PlannerStore.Item it : s.items) {
            if (it.done) continue;
            if (!it.external && s.reminders) {
                if (s.leadMinutes > 0) {
                    long lead = it.startMs - s.leadMinutes * 60_000L;
                    if (lead > now + GRACE_MS && lead < next) { next = lead; exactNeeded = true; }
                }
                if (it.startMs > now + GRACE_MS && it.startMs < next) { next = it.startMs; exactNeeded = true; }
            }
            if (it.startMs > now + GRACE_MS && it.startMs < next) next = it.startMs;
            if (it.endMs > now + GRACE_MS && it.endMs < next) next = it.endMs;
        }
        // While a block is running, nudge the progress bar in the Now card / widget now and then.
        if (PlannerStore.current(s, now) != null) next = Math.min(next, now + PROGRESS_REFRESH_MS);

        PendingIntent pi = tickIntent(ctx, next);
        am.cancel(pi);
        try {
            if (exactNeeded && canExact(ctx)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
        }
    }

    static PendingIntent tickIntent(Context ctx, long at) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.setAction(AlarmReceiver.ACTION_TICK);
        i.putExtra("at", at);
        return PendingIntent.getBroadcast(ctx, 1000, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static long nextMidnight(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 5);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** Post any reminders whose time falls in (now - window, now]. Each fires at most once. */
    static void fireDueReminders(Context ctx, PlannerStore.Snapshot s) {
        if (!s.reminders) return;
        long now = System.currentTimeMillis();
        long window = 10 * 60_000L; // tolerate inexact/late alarms, but never nag about old blocks
        for (PlannerStore.Item it : s.items) {
            if (it.done || it.external) continue;
            if (s.leadMinutes > 0) {
                long lead = it.startMs - s.leadMinutes * 60_000L;
                if (lead <= now + GRACE_MS && lead > now - window && it.startMs > now
                        && PlannerStore.markFired(ctx, "L:" + it.id + ":" + it.date + ":" + it.startMs)) {
                    Notifier.reminder(ctx, s, it, true);
                }
            }
            if (it.startMs <= now + GRACE_MS && it.startMs > now - window && it.endMs > now
                    && PlannerStore.markFired(ctx, "S:" + it.id + ":" + it.date + ":" + it.startMs)) {
                Notifier.reminder(ctx, s, it, false);
            }
        }
    }
}
