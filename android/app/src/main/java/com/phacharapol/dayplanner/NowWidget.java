package com.phacharapol.dayplanner;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class NowWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Widgets.updateNow(ctx, mgr, ids);
        Scheduler.arm(ctx, PlannerStore.load(ctx));
    }
}
