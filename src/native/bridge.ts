import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { usePlanner } from '../state';
import { useCalendar } from '../calendar';
import { usePlanActions } from '../actions';
import { buildSnapshot } from '../lib/snapshot';
import { occursOn } from '../lib/model';
import { Planner, isNative, type PendingAction } from './planner';

export const haptic = {
  pick: () => isNative && void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined),
  drop: () => isNative && void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined),
  done: () => isNative && void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined),
};

/** Parse dayplanner:// links from widgets, the Quick Settings tile and notifications. */
export function routeFromUrl(url: string): { kind: 'quickadd' | 'focus' | 'today' } | { kind: 'day'; date: string } | null {
  const m = /^dayplanner:\/\/([a-z]+)(?:\/(\d{4}-\d{2}-\d{2}))?/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (host === 'day' && m[2]) return { kind: 'day', date: m[2] };
  if (host === 'quickadd' || host === 'focus' || host === 'today') return { kind: host };
  return null;
}

/** Everything that connects the web app to Android. No-ops on the web build. */
export function useNativeBridge() {
  const planner = usePlanner();
  const { data, today } = planner;
  const { eventsOn } = useCalendar();
  const { addFromText } = usePlanActions();

  // Latest values for long-lived native listeners.
  const live = useRef({ planner, addFromText });
  live.current = { planner, addFromText };

  // 1) Mirror the next few days to native storage for widgets, alarms and the Now card.
  const lastSent = useRef('');
  useEffect(() => {
    if (!isNative) return;
    const json = JSON.stringify(buildSnapshot(data.tasks, data.settings, today, eventsOn));
    if (json === lastSent.current) return;
    const t = window.setTimeout(() => {
      lastSent.current = json;
      Planner.setSnapshot({ json }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [data.tasks, data.settings, today, eventsOn]);

  // 2) Replay actions taken outside the app (notification buttons, widget Done, share sheet).
  useEffect(() => {
    if (!isNative) return;
    let busy = false;
    const drain = async () => {
      if (busy) return;
      busy = true;
      try {
        const { actions } = await Planner.takePendingActions();
        applyPending(actions);
      } catch {
        /* plugin unavailable */
      } finally {
        busy = false;
      }
    };
    const applyPending = (actions: PendingAction[]) => {
      const { planner: p, addFromText: add } = live.current;
      for (const a of actions) {
        if (a.type === 'done') {
          p.dispatch({ type: 'setDone', id: a.id, date: a.date, done: true });
        } else if (a.type === 'extend') {
          const t = p.data.tasks.find((x) => x.id === a.id);
          if (t && t.start !== null && occursOn(t, a.date)) {
            p.dispatch({ type: 'schedule', id: t.id, date: a.date, start: t.start, duration: t.duration + (a.minutes || 15) });
          }
        } else if (a.type === 'share') {
          const text = [a.subject, a.text].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300);
          const task = add(text);
          if (task) p.toast(`Added “${task.title}” from share`);
        }
      }
    };
    void drain();
    const handles: { remove: () => void }[] = [];
    void Planner.addListener('pendingActions', () => void drain()).then((h) => handles.push(h));
    void CapApp.addListener('resume', () => void drain()).then((h) => handles.push(h));
    return () => handles.forEach((h) => h.remove());
  }, []);

  // 3) Deep links.
  useEffect(() => {
    if (!isNative) return;
    const go = (url: string | undefined) => {
      const r = url ? routeFromUrl(url) : null;
      if (!r) return;
      const p = live.current.planner;
      p.setEditor(null);
      p.setInboxOpen(false);
      if (r.kind === 'quickadd') p.setPanel('quickadd');
      else if (r.kind === 'focus') {
        p.setSelected(p.today);
        p.setPanel('focus');
      } else if (r.kind === 'today') {
        p.setPanel(null);
        p.setSelected(p.today);
      } else if (r.kind === 'day') {
        p.setPanel(null);
        p.setSelected(r.date);
      }
    };
    void CapApp.getLaunchUrl().then((r) => go(r?.url)).catch(() => undefined);
    let h: { remove: () => void } | undefined;
    void CapApp.addListener('appUrlOpen', (e) => go(e.url)).then((x) => (h = x));
    return () => h?.remove();
  }, []);

  // 4) Android back button: close the top-most layer, then go back to today, then leave.
  useEffect(() => {
    if (!isNative) return;
    let h: { remove: () => void } | undefined;
    void CapApp.addListener('backButton', () => {
      const p = live.current.planner;
      if (document.documentElement.classList.contains('is-dragging')) return;
      if (p.editor) p.setEditor(null);
      else if (p.panel) p.setPanel(null);
      else if (p.inboxOpen) p.setInboxOpen(false);
      else if (p.selected !== p.today) p.setSelected(p.today);
      else void CapApp.minimizeApp();
    }).then((x) => (h = x));
    return () => h?.remove();
  }, []);

  // 5) System bar icons follow the app theme.
  const theme = data.settings.theme;
  useEffect(() => {
    if (!isNative) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

}
