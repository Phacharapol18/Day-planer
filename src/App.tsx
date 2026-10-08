import { useCallback, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { PlannerProvider, usePlanner } from './state';
import { DragProvider, useDrag, type DropResult, type DragPayload } from './drag';
import { makeTask, occurrencesOn, inboxTasks } from './lib/model';
import { addDays, formatTime, minutesNow } from './lib/time';
import { Header } from './components/Header';
import { Timeline } from './components/Timeline';
import { Inbox } from './components/Inbox';
import { Editor } from './components/Editor';
import { QuickAdd } from './components/QuickAdd';
import { Settings } from './components/Settings';
import { Help } from './components/Help';
import { Focus } from './components/Focus';
import { Toasts } from './components/Toasts';
import { Icon } from './components/Icon';
import { CalendarProvider } from './calendar';
import { ProProvider } from './pro/ProProvider';
import { Paywall } from './pro/Paywall';
import { useNativeBridge, haptic } from './native/bridge';
import { isNative } from './native/planner';

export default function App() {
  return (
    <PlannerProvider>
      <ProProvider>
        <CalendarProvider>
          <Shell />
        </CalendarProvider>
      </ProProvider>
    </PlannerProvider>
  );
}

function Shell() {
  const planner = usePlanner();
  const { dispatch, selected, setEditor, setInboxOpen, toast, undo } = planner;

  const onDrop = useCallback(
    ({ payload, start, duration, toInbox }: DropResult) => {
      if (toInbox) {
        if (payload.kind !== 'move') return;
        if (payload.task.repeat !== 'none') {
          toast('Repeating blocks can’t go to the inbox — open it to change the repeat first.', { tone: 'error' });
          return;
        }
        dispatch({ type: 'unschedule', id: payload.task.id });
        toast(`Moved “${payload.task.title}” to inbox`, { action: { label: 'Undo', run: undo } });
        return;
      }
      if (start === undefined) return;
      haptic.drop();
      switch (payload.kind) {
        case 'move':
          if (start !== payload.start) dispatch({ type: 'schedule', id: payload.task.id, date: selected, start });
          break;
        case 'resize':
          if (duration !== payload.duration) dispatch({ type: 'schedule', id: payload.task.id, date: selected, start: payload.start, duration });
          break;
        case 'inbox':
          dispatch({ type: 'schedule', id: payload.task.id, date: selected, start });
          break;
        case 'create':
          setEditor({ mode: 'new', draft: makeTask({ title: '', date: selected, start, duration: duration ?? 30 }) });
          break;
      }
    },
    [dispatch, selected, setEditor, toast, undo],
  );

  const onActivate = useCallback((p: DragPayload) => {
    haptic.pick();
    if (p.kind === 'inbox') setInboxOpen(false);
  }, [setInboxOpen]);

  useTheme();
  useShortcuts();
  useReminders();
  useNativeBridge();

  return (
    <DragProvider onDrop={onDrop} onActivate={onActivate}>
      <a className="skip-link" href="#timeline-main">
        Skip to timeline
      </a>
      <div className="app">
        <Inbox id="inbox" />
        <main className="main" id="timeline-main">
          <Header />
          <Timeline />
        </main>
      </div>
      <MobileBar />
      <DragGhost />
      <Editor />
      <QuickAdd />
      <Settings />
      <Help />
      <Focus />
      <Paywall />
      <Toasts />
      <UpdatePrompt />
    </DragProvider>
  );
}

function MobileBar() {
  const { data, setPanel, setInboxOpen, inboxOpen } = usePlanner();
  const count = inboxTasks(data.tasks).length;
  return (
    <nav className="mobile-bar" aria-label="Quick actions">
      <button type="button" className={`mobile-tab${inboxOpen ? ' is-on' : ''}`} onClick={() => setInboxOpen(!inboxOpen)} aria-expanded={inboxOpen} aria-controls="inbox">
        <Icon name="inbox" size={20} />
        <span>Inbox{count > 0 ? ` · ${count}` : ''}</span>
      </button>
      <button type="button" className="mobile-fab" onClick={() => setPanel('quickadd')} aria-label="Add">
        <Icon name="plus" size={26} />
      </button>
      <button type="button" className="mobile-tab" onClick={() => setPanel('focus')}>
        <Icon name="target" size={20} />
        <span>Focus</span>
      </button>
    </nav>
  );
}

/** Floating chip that follows the pointer while dragging outside the timeline. */
function DragGhost() {
  const { drag } = useDrag();
  if (!drag || drag.overTimeline || drag.kind === 'resize' || drag.kind === 'create') return null;
  return (
    <div className="drag-ghost" data-cat={drag.category} style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 8}px)` }} aria-hidden="true">
      {drag.overInbox ? <Icon name="inbox" size={14} /> : null}
      {drag.title}
    </div>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="alert">
      <span>A new version is ready.</span>
      <button type="button" className="btn btn--primary btn--sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="icon-btn" onClick={() => setNeedRefresh(false)} aria-label="Later">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function useTheme() {
  const { data } = usePlanner();
  const theme = data.settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const apply = () => {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#f6f3ee');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function useShortcuts() {
  const { panel, setPanel, editor, selected, setSelected, today, undo, redo, inboxOpen, setInboxOpen } = usePlanner();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const modal = !!panel || !!editor;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!modal) setPanel('quickadd');
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && !typing && !modal) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing && !modal) {
        e.preventDefault();
        redo();
        return;
      }
      if (modal || typing || mod || e.altKey) return;
      switch (e.key) {
        case 'n':
        case 'N':
        case '/':
          e.preventDefault();
          setPanel('quickadd');
          break;
        case 't':
        case 'T':
          setSelected(today);
          break;
        case 'ArrowLeft':
        case 'j':
          if (el?.closest('[role="radiogroup"], input[type="range"]')) return;
          setSelected(addDays(selected, -1));
          break;
        case 'ArrowRight':
        case 'k':
          if (el?.closest('[role="radiogroup"], input[type="range"]')) return;
          setSelected(addDays(selected, 1));
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          // Drawer on small screens; the sidebar is always there on large ones, so jump into its input.
          if (window.matchMedia('(max-width: 899px)').matches) setInboxOpen(!inboxOpen);
          else document.querySelector<HTMLInputElement>('[data-testid="inbox-input"]')?.focus();
          break;
        case 'f':
        case 'F':
          setPanel('focus');
          break;
        case '?':
          setPanel('help');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, editor, selected, today, setPanel, setSelected, undo, redo, inboxOpen, setInboxOpen]);
}

/** Fires a notification when a block starts, while the app is open (or installed and alive in the background). */
function useReminders() {
  const { data, today, now } = usePlanner();
  const { notify, use24h } = data.settings;
  const minuteKey = Math.floor(minutesNow(now));
  useEffect(() => {
    // On Android, native alarms handle reminders (even with the app closed).
    if (isNative || !notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const nowMin = minutesNow(new Date());
    const timers = occurrencesOn(data.tasks, today)
      .filter((o) => !o.done && o.start > nowMin && o.start - nowMin < 180)
      .map((o) =>
        window.setTimeout(async () => {
          const title = o.task.title || 'Next block';
          const body = `${formatTime(o.start, use24h)} – ${formatTime(o.end, use24h)}`;
          try {
            const reg = await navigator.serviceWorker?.getRegistration();
            if (reg) await reg.showNotification(title, { body, tag: `${o.task.id}:${today}`, icon: 'icon-192.png' });
            else new Notification(title, { body, tag: `${o.task.id}:${today}` });
          } catch {
            /* notification blocked mid-session */
          }
        }, (o.start - nowMin) * 60_000),
      );
    return () => timers.forEach(clearTimeout);
    // Re-arm on plan changes and roughly hourly so long sessions keep a 3-hour horizon.
  }, [data.tasks, today, notify, use24h, Math.floor(minuteKey / 60)]);
}
