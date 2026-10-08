import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { type Action, type History, historyReduce } from './lib/store';
import { type PlannerData, type Task } from './lib/model';
import { load, save, sanitizeData, STORAGE_KEY } from './lib/storage';
import { type DateKey, todayKey } from './lib/time';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'default' | 'error';
}

export type EditorTarget =
  | { mode: 'new'; draft: Task }
  | { mode: 'edit'; id: string; date: DateKey | null };

export type Panel = null | 'quickadd' | 'settings' | 'help' | 'focus';

interface PlannerApi {
  data: PlannerData;
  dispatch: (a: Action) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  now: Date;
  today: DateKey;
  selected: DateKey;
  setSelected: (d: DateKey) => void;
  editor: EditorTarget | null;
  setEditor: (e: EditorTarget | null) => void;
  panel: Panel;
  setPanel: (p: Panel) => void;
  inboxOpen: boolean;
  setInboxOpen: (v: boolean) => void;
  toasts: Toast[];
  toast: (message: string, opts?: Omit<Toast, 'id' | 'message'>) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<PlannerApi | null>(null);

export function usePlanner(): PlannerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('PlannerProvider missing');
  return v;
}

/** Ticks on the minute boundary (plus every 15s so the now-line glides) and on tab focus. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 15_000);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', tick);
    };
  }, []);
  return now;
}

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem('__probe__');
    return s;
  } catch {
    return null;
  }
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(safeStorage, []);
  const initial = useMemo(() => {
    if (!storage) return { data: sanitizeData({ tasks: [] })!, imported: 0, corrupt: false };
    return load(storage, todayKey());
  }, [storage]);

  const [history, send] = useReducer(historyReduce, { past: [], present: initial.data, future: [] } as History);
  const data = history.present;
  const now = useNow();
  const today = todayKey(now);
  const [selected, setSelected] = useState<DateKey>(today);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (message: string, opts: Omit<Toast, 'id' | 'message'> = {}) => {
      const id = ++toastSeq.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, ...opts }]);
      window.setTimeout(() => dismissToast(id), opts.action ? 6000 : 3500);
    },
    [dismissToast],
  );

  // Follow the calendar: if you were looking at "today" when midnight passes, move with it.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today) {
      setSelected((s) => (s === lastToday.current ? today : s));
      lastToday.current = today;
    }
  }, [today]);

  // Persist; remember what we wrote so our own storage events are not treated as foreign.
  const lastWritten = useRef<string>('');
  const saveFailed = useRef(false);
  useEffect(() => {
    if (!storage) return;
    const json = JSON.stringify(data);
    if (json === lastWritten.current) return;
    const t = window.setTimeout(() => {
      lastWritten.current = json;
      const ok = save(storage, data);
      if (!ok && !saveFailed.current) toast('Couldn’t save — browser storage is full or blocked.', { tone: 'error' });
      saveFailed.current = !ok;
    }, 120);
    return () => window.clearTimeout(t);
  }, [data, storage, toast]);

  // Flush on page hide so a quick close never drops the last edit.
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!storage) return;
    const flush = () => {
      const json = JSON.stringify(dataRef.current);
      if (json !== lastWritten.current) {
        lastWritten.current = json;
        save(storage, dataRef.current);
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [storage]);

  // Multi-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue || e.newValue === lastWritten.current) return;
      try {
        const next = sanitizeData(JSON.parse(e.newValue));
        if (next) {
          lastWritten.current = e.newValue;
          send({ type: 'sync', data: next });
        }
      } catch {
        /* ignore partial writes */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // One-time notices from loading.
  const noticed = useRef(false);
  useEffect(() => {
    if (noticed.current) return;
    noticed.current = true;
    if (initial.imported) toast(`Imported ${initial.imported} note${initial.imported === 1 ? '' : 's'} from your old planner into today.`);
    if (initial.corrupt) toast('Saved data was unreadable. A backup was kept and you’re starting fresh.', { tone: 'error' });
    if (!storage) toast('Private mode: your plan won’t be saved after you close this tab.', { tone: 'error' });
  }, [initial, storage, toast]);

  const dispatch = useCallback((a: Action) => send(a), []);
  const undo = useCallback(() => send({ type: 'undo' }), []);
  const redo = useCallback(() => send({ type: 'redo' }), []);

  const api: PlannerApi = {
    data,
    dispatch,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    now,
    today,
    selected,
    setSelected,
    editor,
    setEditor,
    panel,
    setPanel,
    inboxOpen,
    setInboxOpen,
    toasts,
    toast,
    dismissToast,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
