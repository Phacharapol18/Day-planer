package com.phacharapol.dayplanner;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

import java.lang.ref.WeakReference;
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
        Intent i;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
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
        Double from = call.getDouble("from");
        Double to = call.getDouble("to");
        JSArray ids = call.getArray("calendarIds", new JSArray());
        if (from == null || to == null) {
            call.reject("from/to required");
            return;
        }
        Set<String> set = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) set.add(ids.optString(i));
        JSObject ret = new JSObject();
        ret.put("events", CalendarReader.events(getContext(), from.longValue(), to.longValue(), set));
        call.resolve(ret);
    }
}
