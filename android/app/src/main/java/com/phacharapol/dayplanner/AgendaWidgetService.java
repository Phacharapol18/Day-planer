package com.phacharapol.dayplanner;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class AgendaWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private PlannerStore.Snapshot snapshot = new PlannerStore.Snapshot();
        private List<PlannerStore.Item> rows = new ArrayList<>();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            snapshot = PlannerStore.load(ctx);
            rows = PlannerStore.itemsOn(snapshot, PlannerStore.todayKey());
        }

        @Override public void onDestroy() { rows.clear(); }

        @Override public int getCount() { return rows.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            return Widgets.agendaRow(ctx, snapshot, rows.get(position), System.currentTimeMillis());
        }

        @Override public RemoteViews getLoadingView() { return null; }

        @Override public int getViewTypeCount() { return 1; }

        @Override
        public long getItemId(int position) {
            PlannerStore.Item it = rows.get(position);
            return (it.id + it.date).hashCode();
        }

        @Override public boolean hasStableIds() { return true; }
    }
}
