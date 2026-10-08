package com.phacharapol.dayplanner;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.Calendar;
import java.util.TimeZone;

/** JVM unit tests for the native time math (run with ./gradlew :app:testDebugUnitTest). */
public class PlannerStoreTest {
    private static int[] wall(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        return new int[] {c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE)};
    }

    @Test
    public void wallClockSurvivesDaylightSavingChanges() {
        TimeZone saved = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
            // 2026-03-08: clocks jump 02:00 -> 03:00. A 9:00 block is still 9:00.
            int[] spring = wall(PlannerStore.toMillis("2026-03-08", 9 * 60));
            assertEquals(8, spring[0]);
            assertEquals(9, spring[1]);
            assertEquals(0, spring[2]);
            // 2026-11-01: clocks fall back 02:00 -> 01:00. 18:30 stays 18:30.
            int[] fall = wall(PlannerStore.toMillis("2026-11-01", 18 * 60 + 30));
            assertEquals(18, fall[1]);
            assertEquals(30, fall[2]);
            // 24:00 is midnight of the next day.
            int[] end = wall(PlannerStore.toMillis("2026-10-08", 24 * 60));
            assertEquals(9, end[0]);
            assertEquals(0, end[1]);
        } finally {
            TimeZone.setDefault(saved);
        }
    }

    @Test
    public void currentAndNextPickTheRightBlocks() {
        String today = PlannerStore.todayKey();
        PlannerStore.Snapshot s = PlannerStore.parse("{\"items\":["
                + "{\"id\":\"a\",\"date\":\"" + today + "\",\"title\":\"A\",\"start\":600,\"end\":660},"
                + "{\"id\":\"b\",\"date\":\"" + today + "\",\"title\":\"B\",\"start\":630,\"end\":700,\"done\":true},"
                + "{\"id\":\"c\",\"date\":\"" + today + "\",\"title\":\"C\",\"start\":720,\"end\":750,\"ext\":true}]}");
        long at = PlannerStore.toMillis(today, 640);
        assertEquals("A", PlannerStore.current(s, at).title); // B is done, so A is current
        assertEquals("C", PlannerStore.next(s, at, null).title); // calendar events count as "next"
    }

    @Test
    public void malformedSnapshotIsEmptyNotACrash() {
        assertEquals(0, PlannerStore.parse("{nope").items.size());
        assertEquals(0, PlannerStore.parse(null).items.size());
    }
}
