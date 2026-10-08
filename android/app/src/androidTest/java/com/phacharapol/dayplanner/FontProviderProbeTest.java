package com.phacharapol.dayplanner;

import android.app.Instrumentation;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Diagnostic, never fails: which part of the app opens a connection to Google Play services' font
 * provider? (A live connection gets the app killed whenever Play services restarts.) Records the app's
 * connections and new font requests after each stage; CI prints the report (fonts.txt).
 */
@RunWith(AndroidJUnit4.class)
public class FontProviderProbeTest {

    private static Instrumentation inst() {
        return InstrumentationRegistry.getInstrumentation();
    }

    private static String shell(String cmd) throws Exception {
        ParcelFileDescriptor pfd = inst().getUiAutomation().executeShellCommand(cmd);
        try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(pfd)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    /** This process's connection lines on the FontsProvider record, e.g. "-> 1234:com.x/u0a1 s1/1 u0/2 +3s". */
    private static String myLinks() throws Exception {
        String dump = shell("dumpsys activity providers");
        int at = dump.indexOf("fonts.provider.FontsProvider");
        if (at < 0) return "(provider not running)";
        int end = dump.indexOf("* ContentProviderRecord", at);
        String block = dump.substring(at, end < 0 ? dump.length() : end);
        String me = android.os.Process.myPid() + ":";
        StringBuilder sb = new StringBuilder();
        for (String line : block.split("\n")) {
            if (line.contains("->") && line.contains(me)) sb.append(line.trim()).append(' ');
        }
        return sb.length() == 0 ? "none" : sb.toString().trim();
    }

    private int seen = 0;

    private String newQueries() throws Exception {
        String[] lines = shell("logcat -d -v time -s FontLog").split("\n");
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (String l : lines) {
            if (!l.contains("Received query")) continue;
            if (count++ < seen) continue;
            sb.append("\n      ").append(l.trim());
        }
        seen = count;
        return sb.toString();
    }

    private void stage(StringBuilder r, String name) throws Exception {
        Thread.sleep(2500);
        r.append(name).append(": ").append(myLinks()).append(newQueries()).append('\n');
    }

    private static void loadAndDraw(WebView w, String html) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        inst().runOnMainSync(() -> {
            w.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    done.countDown();
                }
            });
            w.loadDataWithBaseURL("https://localhost/", html, "text/html", "utf-8", null);
        });
        done.await(15, TimeUnit.SECONDS);
        inst().runOnMainSync(() -> {
            w.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY));
            w.layout(0, 0, 1080, 1920);
            Bitmap b = Bitmap.createBitmap(1080, 1920, Bitmap.Config.ARGB_8888);
            w.draw(new Canvas(b));
        });
    }

    @Test
    public void reportWhoConnectsToPlayServicesFonts() throws Exception {
        Context ctx = inst().getTargetContext();
        StringBuilder r = new StringBuilder("App process ").append(android.os.Process.myPid()).append('\n');
        shell("logcat -c");
        newQueries();
        stage(r, "1 fresh process (Application + startup initializers)");

        inst().runOnMainSync(() -> {
            TextView t = new TextView(ctx);
            t.setText("Native text with emoji 😀 and symbols ↵ ⇧");
            t.measure(0, 0);
        });
        stage(r, "2 native TextView with emoji");

        WebView[] web = new WebView[1];
        inst().runOnMainSync(() -> web[0] = new WebView(ctx));
        stage(r, "3 WebView created, nothing loaded");

        loadAndDraw(web[0], "<!doctype html><p style='font-family:sans-serif'>Plain text, rendered.</p>");
        stage(r, "4 WebView rendered plain text");

        loadAndDraw(web[0], "<!doctype html><p>Emoji 😀 🎉 and symbols ↵ ⇧ ⌘</p>");
        stage(r, "5 WebView rendered emoji and symbols");

        loadAndDraw(web[0], "<!doctype html><select><option>One</option></select><input value='text'>");
        stage(r, "6 WebView rendered form controls");

        inst().runOnMainSync(() -> web[0].destroy());
        stage(r, "7 WebView destroyed");

        File dir = ctx.getExternalFilesDir("widgets");
        if (dir != null) {
            dir.mkdirs();
            try (FileOutputStream out = new FileOutputStream(new File(dir, "fonts.txt"))) {
                out.write(r.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        System.out.println(r);
    }
}
