package com.phacharapol.dayplanner;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public final class Notifier {
    public static final String CH_REMINDERS = "reminders";
    public static final String CH_NOW = "now";
    private static final int NOW_ID = 1;

    private Notifier() {}

    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel rem = new NotificationChannel(CH_REMINDERS, ctx.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH);
        rem.setDescription(ctx.getString(R.string.channel_reminders_desc));
        nm.createNotificationChannel(rem);
        NotificationChannel now = new NotificationChannel(CH_NOW, ctx.getString(R.string.channel_now), NotificationManager.IMPORTANCE_LOW);
        now.setDescription(ctx.getString(R.string.channel_now_desc));
        now.setShowBadge(false);
        nm.createNotificationChannel(now);
    }

    static boolean canPost(Context ctx) {
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    static PendingIntent openApp(Context ctx, String path, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("dayplanner://" + path));
        i.setClass(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent action(Context ctx, String action, PlannerStore.Item it) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.setAction(action);
        i.putExtra("id", it.id);
        i.putExtra("date", it.date);
        int code = (action + it.id + it.date).hashCode();
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String range(PlannerStore.Item it, boolean use24h) {
        return PlannerStore.formatTime(it.startMs, use24h) + " – " + PlannerStore.formatTime(it.endMs, use24h);
    }

    /** Heads-up reminder: either "in N min" (lead) or "starts now". */
    public static void reminder(Context ctx, PlannerStore.Snapshot s, PlannerStore.Item it, boolean lead) {
        if (!canPost(ctx)) return;
        String text = lead
                ? ctx.getString(R.string.reminder_in, s.leadMinutes, range(it, s.use24h))
                : ctx.getString(R.string.reminder_now, range(it, s.use24h));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_REMINDERS)
                .setSmallIcon(R.drawable.ic_stat_planner)
                .setColor(ContextCompat.getColor(ctx, R.color.accent))
                .setContentTitle(it.title.isEmpty() ? ctx.getString(R.string.untitled) : it.title)
                .setContentText(text)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setTimeoutAfter(Math.max(60_000L, it.endMs - System.currentTimeMillis()))
                .setContentIntent(openApp(ctx, "today", 10));
        if (!lead) {
            b.addAction(R.drawable.ic_check, ctx.getString(R.string.action_done), action(ctx, AlarmReceiver.ACTION_DONE, it));
            b.addAction(R.drawable.ic_plus, ctx.getString(R.string.action_extend), action(ctx, AlarmReceiver.ACTION_EXTEND, it));
        }
        try {
            NotificationManagerCompat.from(ctx).notify((it.id + it.date + (lead ? "L" : "S")).hashCode(), b.build());
        } catch (SecurityException ignored) {
            // permission revoked between check and post
        }
    }

    /** Keep the ongoing "Now" card in sync with the current block (or remove it). */
    public static void syncNow(Context ctx, PlannerStore.Snapshot s) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        long now = System.currentTimeMillis();
        PlannerStore.Item cur = s.nowCard ? PlannerStore.current(s, now) : null;
        if (cur == null || !canPost(ctx)) {
            nm.cancel(NOW_ID);
            return;
        }
        PlannerStore.Item next = PlannerStore.next(s, now, cur);
        String sub = next != null
                ? ctx.getString(R.string.now_then, next.title, PlannerStore.formatTime(next.startMs, s.use24h))
                : ctx.getString(R.string.now_until, PlannerStore.formatTime(cur.endMs, s.use24h));
        int pct = (int) Math.max(0, Math.min(100, (now - cur.startMs) * 100 / Math.max(1, cur.endMs - cur.startMs)));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_NOW)
                .setSmallIcon(R.drawable.ic_stat_planner)
                .setColor(ContextCompat.getColor(ctx, R.color.accent))
                .setContentTitle(cur.title.isEmpty() ? ctx.getString(R.string.untitled) : cur.title)
                .setContentText(sub)
                .setSubText(ctx.getString(R.string.now_label))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(true)
                .setWhen(cur.endMs)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setProgress(100, pct, false)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openApp(ctx, "focus", 11))
                .addAction(R.drawable.ic_check, ctx.getString(R.string.action_done), action(ctx, AlarmReceiver.ACTION_DONE, cur))
                .addAction(R.drawable.ic_plus, ctx.getString(R.string.action_extend), action(ctx, AlarmReceiver.ACTION_EXTEND, cur));
        try {
            nm.notify(NOW_ID, b.build());
        } catch (SecurityException ignored) {
            // permission revoked
        }
    }
}
