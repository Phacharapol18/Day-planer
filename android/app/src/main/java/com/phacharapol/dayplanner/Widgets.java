package com.phacharapol.dayplanner;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Paint;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import java.util.Calendar;
import java.util.Locale;

public final class Widgets {
    private Widgets() {}

    public static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        int[] now = mgr.getAppWidgetIds(new ComponentName(ctx, NowWidget.class));
        if (now.length > 0) updateNow(ctx, mgr, now);
        int[] agenda = mgr.getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class));
        if (agenda.length > 0) updateAgenda(ctx, mgr, agenda);
    }

    static int catColor(Context ctx, PlannerStore.Item it) {
        if (it.external && it.color != 0) return 0xFF000000 | it.color;
        int res;
        switch (it.cat) {
            case "meeting": res = R.color.cat_meeting; break;
            case "health": res = R.color.cat_health; break;
            case "personal": res = R.color.cat_personal; break;
            case "social": res = R.color.cat_social; break;
            case "errand": res = R.color.cat_errand; break;
            default: res = R.color.cat_work;
        }
        return ContextCompat.getColor(ctx, res);
    }

    // ───────────── Now / Next ─────────────

    static void updateNow(Context ctx, AppWidgetManager mgr, int[] ids) {
        PlannerStore.Snapshot s = PlannerStore.load(ctx);
        long now = System.currentTimeMillis();
        PlannerStore.Item cur = PlannerStore.current(s, now);
        PlannerStore.Item next = PlannerStore.next(s, now, cur);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_now);
            v.setOnClickPendingIntent(R.id.w_root, Notifier.openApp(ctx, cur != null ? "focus" : "today", 20));
            v.setOnClickPendingIntent(R.id.w_add, Notifier.openApp(ctx, "quickadd", 21));
            if (cur != null) {
                v.setTextViewText(R.id.w_kicker, ctx.getString(R.string.now_label).toUpperCase(Locale.getDefault()));
                v.setTextViewText(R.id.w_title, cur.title.isEmpty() ? ctx.getString(R.string.untitled) : cur.title);
                v.setInt(R.id.w_rail, "setBackgroundColor", catColor(ctx, cur));
                // Chronometer counts down to the block's end using the elapsed-realtime clock.
                long base = SystemClock.elapsedRealtime() + (cur.endMs - now);
                v.setChronometer(R.id.w_timer, base, null, true);
                v.setChronometerCountDown(R.id.w_timer, true);
                v.setViewVisibility(R.id.w_timer, View.VISIBLE);
                v.setViewVisibility(R.id.w_progress, View.VISIBLE);
                int pct = (int) Math.max(0, Math.min(100, (now - cur.startMs) * 100 / Math.max(1, cur.endMs - cur.startMs)));
                v.setProgressBar(R.id.w_progress, 100, pct, false);
                v.setTextViewText(R.id.w_meta, ctx.getString(R.string.now_until, PlannerStore.formatTime(cur.endMs, s.use24h)));
                v.setViewVisibility(R.id.w_done, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.w_done, Notifier.action(ctx, AlarmReceiver.ACTION_DONE, cur));
            } else {
                v.setViewVisibility(R.id.w_timer, View.GONE);
                v.setViewVisibility(R.id.w_progress, View.GONE);
                v.setViewVisibility(R.id.w_done, View.GONE);
                if (next != null) {
                    v.setTextViewText(R.id.w_kicker, ctx.getString(R.string.up_next).toUpperCase(Locale.getDefault()));
                    v.setTextViewText(R.id.w_title, next.title.isEmpty() ? ctx.getString(R.string.untitled) : next.title);
                    v.setInt(R.id.w_rail, "setBackgroundColor", catColor(ctx, next));
                    v.setTextViewText(R.id.w_meta, relativeStart(ctx, next.startMs, now, s.use24h));
                } else {
                    v.setTextViewText(R.id.w_kicker, ctx.getString(R.string.all_clear).toUpperCase(Locale.getDefault()));
                    v.setTextViewText(R.id.w_title, ctx.getString(R.string.nothing_left));
                    v.setInt(R.id.w_rail, "setBackgroundColor", ContextCompat.getColor(ctx, R.color.faint));
                    v.setTextViewText(R.id.w_meta, ctx.getString(R.string.tap_to_plan));
                }
            }
            PlannerStore.Item after = cur != null ? next : (next != null ? PlannerStore.next(s, next.startMs, next) : null);
            if (after != null) {
                v.setViewVisibility(R.id.w_next, View.VISIBLE);
                v.setTextViewText(R.id.w_next, ctx.getString(R.string.now_then, after.title, PlannerStore.formatTime(after.startMs, s.use24h)));
            } else {
                v.setViewVisibility(R.id.w_next, View.GONE);
            }
            mgr.updateAppWidget(id, v);
        }
    }

    static String relativeStart(Context ctx, long start, long now, boolean use24h) {
        long mins = Math.max(0, (start - now) / 60_000L);
        String at = PlannerStore.formatTime(start, use24h);
        if (mins < 60) return ctx.getString(R.string.starts_in_min, mins + 1, at);
        Calendar a = Calendar.getInstance();
        a.setTimeInMillis(start);
        Calendar b = Calendar.getInstance();
        b.setTimeInMillis(now);
        boolean sameDay = a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
        return sameDay ? ctx.getString(R.string.starts_at, at) : ctx.getString(R.string.starts_tomorrow, at);
    }

    // ───────────── Today agenda ─────────────

    static void updateAgenda(Context ctx, AppWidgetManager mgr, int[] ids) {
        PlannerStore.Snapshot s = PlannerStore.load(ctx);
        Calendar c = Calendar.getInstance();
        String header = String.format(Locale.getDefault(), "%1$tA, %1$tb %1$te", c);
        int todays = PlannerStore.itemsOn(s, PlannerStore.todayKey()).size();
        int done = 0;
        for (PlannerStore.Item it : PlannerStore.itemsOn(s, PlannerStore.todayKey())) if (it.done && !it.external) done++;
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
            v.setTextViewText(R.id.a_date, header);
            v.setTextViewText(R.id.a_meta, todays == 0 ? ctx.getString(R.string.nothing_planned) : ctx.getString(R.string.done_of, done, todays)
                    + (s.inboxCount > 0 ? " · " + ctx.getString(R.string.inbox_count, s.inboxCount) : ""));
            v.setOnClickPendingIntent(R.id.a_header, Notifier.openApp(ctx, "today", 30));
            v.setOnClickPendingIntent(R.id.a_add, Notifier.openApp(ctx, "quickadd", 31));

            Intent svc = new Intent(ctx, AgendaWidgetService.class);
            svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            v.setRemoteAdapter(R.id.a_list, svc);
            v.setEmptyView(R.id.a_list, R.id.a_empty);
            v.setOnClickPendingIntent(R.id.a_empty, Notifier.openApp(ctx, "quickadd", 32));

            Intent tmpl = new Intent(Intent.ACTION_VIEW);
            tmpl.setClass(ctx, MainActivity.class);
            tmpl.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            // Mutable so each row can fill in its own deep link.
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            v.setPendingIntentTemplate(R.id.a_list, PendingIntent.getActivity(ctx, 33, tmpl, flags));
            mgr.updateAppWidget(id, v);
        }
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.a_list);
    }

    static RemoteViews agendaRow(Context ctx, PlannerStore.Snapshot s, PlannerStore.Item it, long now) {
        RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda_row);
        row.setTextViewText(R.id.r_time, PlannerStore.formatTime(it.startMs, s.use24h));
        row.setTextViewText(R.id.r_title, it.title.isEmpty() ? ctx.getString(R.string.untitled) : it.title);
        row.setInt(R.id.r_rail, "setBackgroundColor", catColor(ctx, it));
        boolean past = it.endMs <= now;
        boolean live = it.startMs <= now && it.endMs > now && !it.done;
        int flags = Paint.ANTI_ALIAS_FLAG | (it.done ? Paint.STRIKE_THRU_TEXT_FLAG : 0);
        row.setInt(R.id.r_title, "setPaintFlags", flags);
        row.setFloat(R.id.r_title, "setAlpha", it.done || past ? 0.5f : 1f);
        row.setFloat(R.id.r_time, "setAlpha", it.done || past ? 0.5f : 1f);
        row.setViewVisibility(R.id.r_live, live ? View.VISIBLE : View.GONE);
        row.setViewVisibility(R.id.r_cal, it.external ? View.VISIBLE : View.GONE);
        Intent fill = new Intent();
        fill.setData(Uri.parse("dayplanner://day/" + it.date));
        row.setOnClickFillInIntent(R.id.r_root, fill);
        return row;
    }
}
