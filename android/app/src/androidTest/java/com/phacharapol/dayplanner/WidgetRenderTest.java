package com.phacharapol.dayplanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.Locale;

/**
 * Inflates the real widget RemoteViews on a device, checks their content, and saves PNGs
 * (pulled by CI) so the widget design can be reviewed without a launcher.
 */
@RunWith(AndroidJUnit4.class)
public class WidgetRenderTest {

    private static Context ctx() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static Context night(Context base) {
        Configuration c = new Configuration(base.getResources().getConfiguration());
        c.uiMode = (c.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | Configuration.UI_MODE_NIGHT_YES;
        return base.createConfigurationContext(c);
    }

    private static String today() {
        return PlannerStore.todayKey();
    }

    private static int nowMin() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    /** A block that started 20 min ago and runs 40 more, plus one later today. */
    private static PlannerStore.Snapshot snapshot(boolean pro) {
        int start = Math.max(0, Math.min(nowMin() - 20, 1440 - 121));
        String json = String.format(Locale.US,
                "{\"v\":1,\"use24h\":false,\"reminders\":true,\"leadMinutes\":5,\"nowCard\":%b,\"pro\":%b,\"inboxCount\":3,\"items\":["
                        + "{\"id\":\"a\",\"date\":\"%s\",\"title\":\"Deep work — Q4 roadmap\",\"start\":%d,\"end\":%d,\"done\":false,\"cat\":\"work\"},"
                        + "{\"id\":\"b\",\"date\":\"%s\",\"title\":\"Lunch with Mia\",\"start\":%d,\"end\":%d,\"done\":false,\"cat\":\"social\"}]}",
                pro, pro, today(), start, start + 60, today(), start + 80, start + 120);
        return PlannerStore.parse(json);
    }

    private static View inflate(Context c, RemoteViews rv, int wDp, int hDp, String file) throws Exception {
        final View[] out = new View[1];
        final Exception[] err = new Exception[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                FrameLayout parent = new FrameLayout(c);
                View v = rv.apply(c, parent);
                DisplayMetrics dm = c.getResources().getDisplayMetrics();
                int w = Math.round(wDp * dm.density);
                int h = Math.round(hDp * dm.density);
                v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
                v.layout(0, 0, w, h);
                Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                bmp.eraseColor(0xFF7A8C99); // stand-in wallpaper so rounded corners are visible
                v.draw(new Canvas(bmp));
                File dir = ctx().getExternalFilesDir("widgets");
                assertNotNull(dir);
                try (FileOutputStream fos = new FileOutputStream(new File(dir, file))) {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, fos);
                }
                out[0] = v;
            } catch (Exception e) {
                err[0] = e;
            }
        });
        if (err[0] != null) throw err[0];
        return out[0];
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    @Test
    public void nowWidgetShowsRunningBlockAndWhatsNext() throws Exception {
        PlannerStore.Snapshot s = snapshot(true);
        long now = System.currentTimeMillis();
        View light = inflate(ctx(), Widgets.nowViews(ctx(), s, now), 320, 150, "now-light.png");
        assertEquals("Deep work — Q4 roadmap", text(light, R.id.w_title));
        assertEquals(View.VISIBLE, light.findViewById(R.id.w_timer).getVisibility());
        assertEquals(View.VISIBLE, light.findViewById(R.id.w_done).getVisibility());
        assertTrue(text(light, R.id.w_next).startsWith("Then Lunch with Mia"));
        inflate(night(ctx()), Widgets.nowViews(night(ctx()), s, now), 320, 150, "now-dark.png");
    }

    @Test
    public void freeUsersSeeLockedWidget() throws Exception {
        View v = inflate(ctx(), Widgets.nowViews(ctx(), snapshot(false), System.currentTimeMillis()), 320, 150, "now-locked.png");
        assertEquals(ctx().getString(R.string.widget_locked_title), text(v, R.id.w_title));
        assertEquals(View.GONE, v.findViewById(R.id.w_timer).getVisibility());
    }

    @Test
    public void agendaRowRendersLiveAndDoneStates() throws Exception {
        PlannerStore.Snapshot s = snapshot(true);
        long now = System.currentTimeMillis();
        View live = inflate(ctx(), Widgets.agendaRow(ctx(), s, s.items.get(0), now), 320, 44, "agenda-row-live.png");
        assertEquals(View.VISIBLE, live.findViewById(R.id.r_live).getVisibility());
        s.items.get(1).done = true;
        View done = inflate(ctx(), Widgets.agendaRow(ctx(), s, s.items.get(1), now), 320, 44, "agenda-row-done.png");
        assertTrue((((TextView) done.findViewById(R.id.r_title)).getPaintFlags() & android.graphics.Paint.STRIKE_THRU_TEXT_FLAG) != 0);
    }
}
