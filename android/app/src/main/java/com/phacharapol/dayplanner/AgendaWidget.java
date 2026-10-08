package com.phacharapol.dayplanner;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class AgendaWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Widgets.updateAgenda(ctx, mgr, ids);
        Scheduler.arm(ctx, PlannerStore.load(ctx));
    }
}
