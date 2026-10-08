package com.phacharapol.dayplanner;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

import androidx.core.app.NotificationManagerCompat;

@CapacitorPlugin(
        name = "Planner",
        permissions = {
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
                @Permission(alias = "calendar", strings = {Manifest.permission.READ_CALENDAR}),
        }
)
public class PlannerPlugin extends Plugin {
    private static WeakReference<PlannerPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        Notifier.ensureChannels(getContext());
    }

    /** Called from receivers/activity when the pending queue grows while the app is alive. */
    static void emitPending() {
        PlannerPlugin p = instance.get();
        if (p != null) p.notifyListeners("pendingActions", new JSObject(), true);
    }

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json required");
            return;
        }
        PlannerStore.saveSnapshot(getContext(), json);
        Scheduler.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takePendingActions(PluginCall call) {
        JSONArray arr = PlannerStore.takePending(getContext());
        JSObject ret = new JSObject();
        try {
            ret.put("actions", new JSArray(arr.toString()));
        } catch (JSONException e) {
            ret.put("actions", new JSArray());
        }
        call.resolve(ret);
    }

    // ───────────── capabilities & permissions ─────────────

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        ret.put("exactAlarms", Scheduler.canExact(getContext()));
        ret.put("calendar", getPermissionState("calendar") == PermissionState.GRANTED);
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("debug", (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotifications");
    }

    @PermissionCallback
    private void onNotifications(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestCalendar(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("calendar", call, "onCalendar");
    }

    @PermissionCallback
    private void onCalendar(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("calendar") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        Intent i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()))
                : appDetails();
        launch(i, call);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            i = appDetails();
        }
        launch(i, call);
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
    }

    /** Some OEM builds lack a settings screen; fall back to app details rather than crashing. */
    private void launch(Intent i, PluginCall call) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (ActivityNotFoundException e) {
            Intent fallback = appDetails();
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(fallback);
            } catch (ActivityNotFoundException ignored) {
                call.reject("settings screen unavailable");
                return;
            }
        }
        call.resolve();
    }

    // ───────────── voice capture ─────────────

    /** System speech UI (no RECORD_AUDIO permission needed); resolves with the best transcript. */
    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "What’s on your mind?"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "onSpeech");
        } catch (ActivityNotFoundException e) {
            call.reject("Speech recognition isn’t available on this device", "UNAVAILABLE");
        }
    }

    @ActivityCallback
    private void onSpeech(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) text = matches.get(0);
        }
        ret.put("text", text);
        call.resolve(ret);
    }

    // ───────────── device calendars ─────────────

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("calendar permission not granted", "NO_PERMISSION");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("calendars", CalendarReader.calendars(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("calendar permission not granted", "NO_PERMISSION");
            return;
        }
        // Epoch millis arrive as Long (too big for Integer); PluginCall.getDouble ignores Longs.
        long from = call.getData().optLong("from", -1);
        long to = call.getData().optLong("to", -1);
        JSArray ids = call.getArray("calendarIds", new JSArray());
        if (from < 0 || to <= from) {
            call.reject("from/to required");
            return;
        }
        Set<String> set = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) set.add(ids.optString(i));
        JSObject ret = new JSObject();
        ret.put("events", CalendarReader.events(getContext(), from, to, set));
        call.resolve(ret);
    }
}
