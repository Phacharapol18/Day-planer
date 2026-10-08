package com.phacharapol.dayplanner;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.Set;

/** Read-only access to the calendars already synced on the phone (Google, Outlook, Samsung…). */
final class CalendarReader {
    private CalendarReader() {}

    static JSArray calendars(Context ctx) {
        JSArray out = new JSArray();
        String[] cols = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.VISIBLE,
        };
        try (Cursor c = ctx.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols, null, null,
                CalendarContract.Calendars.ACCOUNT_NAME + " ASC")) {
            if (c == null) return out;
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("color", c.getInt(3) & 0xFFFFFF);
                o.put("visible", c.getInt(4) == 1);
                out.put(o);
            }
        }
        return out;
    }

    /** Event instances (recurrences expanded) overlapping [from, to), excluding ones you declined. */
    static JSArray events(Context ctx, long from, long to, Set<String> calendarIds) {
        JSArray out = new JSArray();
        if (calendarIds.isEmpty()) return out;
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from);
        ContentUris.appendId(b, to);
        String[] cols = {
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.CALENDAR_ID,
                CalendarContract.Instances.DISPLAY_COLOR,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.SELF_ATTENDEE_STATUS,
                CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
        };
        ContentResolver cr = ctx.getContentResolver();
        try (Cursor c = cr.query(b.build(), cols, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            if (c == null) return out;
            while (c.moveToNext()) {
                String cal = String.valueOf(c.getLong(5));
                if (!calendarIds.contains(cal)) continue;
                if (c.getInt(8) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue;
                JSObject o = new JSObject();
                o.put("id", c.getLong(0) + ":" + c.getLong(2));
                o.put("title", c.getString(1) == null ? "" : c.getString(1));
                o.put("begin", c.getLong(2));
                o.put("end", c.getLong(3));
                o.put("allDay", c.getInt(4) == 1);
                o.put("calendarId", cal);
                o.put("color", c.getInt(6) & 0xFFFFFF);
                o.put("location", c.getString(7) == null ? "" : c.getString(7));
                o.put("calendar", c.getString(9) == null ? "" : c.getString(9));
                out.put(o);
            }
        }
        return out;
    }
}
