package com.phacharapol.dayplanner;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Native-side view of the plan. The web app owns the data (localStorage) and pushes a compact
 * snapshot of the next few days here, so widgets, alarms and notifications work while the app is
 * closed. Anything the user does natively (Done, +15 min, shared text) is appended to a pending
 * queue that the web app drains and applies the next time it runs.
 */
public final class PlannerStore {
    private static final String PREFS = "planner_native";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_FIRED = "fired";
    private static final Object LOCK = new Object();

    private PlannerStore() {}

    public static final class Item {
        public String id;
        public String date;
        public String title;
        public int start;
        public int end;
        public boolean done;
        public String cat;
        public boolean external;
        public int color;
        public long startMs;
        public long endMs;
    }

    public static final class Snapshot {
        public boolean use24h;
        public boolean reminders;
        public int leadMinutes;
        public boolean nowCard;
        public int inboxCount;
        public final List<Item> items = new ArrayList<>();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveSnapshot(Context ctx, String json) {
        synchronized (LOCK) {
            prefs(ctx).edit().putString(KEY_SNAPSHOT, json).apply();
        }
    }

    public static Snapshot load(Context ctx) {
        synchronized (LOCK) {
            return parse(prefs(ctx).getString(KEY_SNAPSHOT, null));
        }
    }

    static Snapshot parse(String json) {
        Snapshot s = new Snapshot();
        if (json == null) return s;
        try {
            JSONObject o = new JSONObject(json);
            s.use24h = o.optBoolean("use24h", false);
            s.reminders = o.optBoolean("reminders", false);
            s.leadMinutes = Math.max(0, o.optInt("leadMinutes", 0));
            s.nowCard = o.optBoolean("nowCard", false);
            s.inboxCount = o.optInt("inboxCount", 0);
            JSONArray arr = o.optJSONArray("items");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject it = arr.optJSONObject(i);
                    if (it == null) continue;
                    Item item = new Item();
                    item.id = it.optString("id");
                    item.date = it.optString("date");
                    item.title = it.optString("title", "");
                    item.start = it.optInt("start");
                    item.end = it.optInt("end");
                    item.done = it.optBoolean("done", false);
                    item.cat = it.optString("cat", "work");
                    item.external = it.optBoolean("ext", false);
                    item.color = it.has("color") ? it.optInt("color") : 0;
                    item.startMs = toMillis(item.date, item.start);
                    item.endMs = toMillis(item.date, item.end);
                    if (item.startMs > 0 && item.endMs >= item.startMs) s.items.add(item);
                }
            }
        } catch (JSONException ignored) {
            // A malformed snapshot is treated as an empty plan; the app will push a fresh one.
        }
        Collections.sort(s.items, (a, b) -> Long.compare(a.startMs, b.startMs));
        return s;
    }

    /** Local wall-clock time for a calendar key ("YYYY-MM-DD") plus minutes from midnight. */
    public static long toMillis(String dateKey, int minutes) {
        try {
            String[] p = dateKey.split("-");
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
            c.add(Calendar.MINUTE, minutes);
            return c.getTimeInMillis();
        } catch (RuntimeException e) {
            return -1;
        }
    }

    public static String todayKey() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** The block happening now (latest-started, not done, not an external calendar event). */
    public static Item current(Snapshot s, long now) {
        Item best = null;
        for (Item it : s.items) {
            if (it.external || it.done) continue;
            if (it.startMs <= now && it.endMs > now && (best == null || it.startMs >= best.startMs)) best = it;
        }
        return best;
    }

    /** Next thing starting after `now` (planner blocks and calendar events), skipping `except`. */
    public static Item next(Snapshot s, long now, Item except) {
        for (Item it : s.items) {
            if (it.done || it == except) continue;
            if (it.startMs > now) return it;
        }
        return null;
    }

    public static List<Item> itemsOn(Snapshot s, String dateKey) {
        List<Item> out = new ArrayList<>();
        for (Item it : s.items) if (dateKey.equals(it.date)) out.add(it);
        return out;
    }

    // ───────────── optimistic native edits ─────────────

    /** Apply an edit to the stored snapshot so widgets/notifications reflect it before the app runs. */
    public static void mutate(Context ctx, String id, String date, boolean markDone, int extendMinutes) {
        synchronized (LOCK) {
            String json = prefs(ctx).getString(KEY_SNAPSHOT, null);
            if (json == null) return;
            try {
                JSONObject o = new JSONObject(json);
                JSONArray arr = o.optJSONArray("items");
                if (arr == null) return;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject it = arr.getJSONObject(i);
                    if (!id.equals(it.optString("id")) || !date.equals(it.optString("date"))) continue;
                    if (markDone) it.put("done", true);
                    if (extendMinutes != 0) it.put("end", Math.min(24 * 60, it.optInt("end") + extendMinutes));
                }
                prefs(ctx).edit().putString(KEY_SNAPSHOT, o.toString()).apply();
            } catch (JSONException ignored) {
                // leave the snapshot untouched
            }
        }
    }

    // ───────────── pending action queue ─────────────

    public static void addPending(Context ctx, JSONObject action) {
        synchronized (LOCK) {
            JSONArray arr;
            try {
                arr = new JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"));
            } catch (JSONException e) {
                arr = new JSONArray();
            }
            try {
                action.put("at", System.currentTimeMillis());
            } catch (JSONException ignored) {
                // timestamp is informational
            }
            arr.put(action);
            prefs(ctx).edit().putString(KEY_PENDING, arr.toString()).apply();
        }
    }

    public static JSONArray takePending(Context ctx) {
        synchronized (LOCK) {
            JSONArray arr;
            try {
                arr = new JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"));
            } catch (JSONException e) {
                arr = new JSONArray();
            }
            prefs(ctx).edit().putString(KEY_PENDING, "[]").apply();
            return arr;
        }
    }

    // ───────────── duplicate-notification guard ─────────────

    /** Returns true the first time a key is seen; remembers the last ~200 keys. */
    public static boolean markFired(Context ctx, String key) {
        synchronized (LOCK) {
            String raw = prefs(ctx).getString(KEY_FIRED, "");
            List<String> keys = new ArrayList<>();
            if (!raw.isEmpty()) Collections.addAll(keys, raw.split("\n"));
            if (keys.contains(key)) return false;
            keys.add(key);
            while (keys.size() > 200) keys.remove(0);
            prefs(ctx).edit().putString(KEY_FIRED, String.join("\n", keys)).apply();
            return true;
        }
    }

    public static String formatTime(long millis, boolean use24h) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        int h = c.get(Calendar.HOUR_OF_DAY);
        int m = c.get(Calendar.MINUTE);
        if (use24h) return String.format(Locale.US, "%02d:%02d", h, m);
        String suffix = h < 12 ? "am" : "pm";
        int h12 = h % 12 == 0 ? 12 : h % 12;
        return m == 0 ? h12 + suffix : String.format(Locale.US, "%d:%02d%s", h12, m, suffix);
    }
}
