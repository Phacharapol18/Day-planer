import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as CapApp } from '@capacitor/app';
import { usePlanner } from './state';
import { type ExternalEvent, type RawDeviceEvent, toExternalEvents, groupByDate } from './lib/external';
import { type DateKey, addDays, fromKey, weekday } from './lib/time';
import { Planner, isNative } from './native/planner';
import { usePro } from './pro/ProProvider';

declare global {
  interface Window {
    /** Test/dev hook: supply device-calendar events on the web build. */
    __dpMockCalendar?: (from: number, to: number) => RawDeviceEvent[];
  }
}

interface CalendarApi {
  /** Timed events (not all-day) on a date. */
  eventsOn: (d: DateKey) => ExternalEvent[];
  allDayOn: (d: DateKey) => ExternalEvent[];
  enabled: boolean;
  refresh: () => void;
}

const EMPTY: ExternalEvent[] = [];
const Ctx = createContext<CalendarApi>({ eventsOn: () => EMPTY, allDayOn: () => EMPTY, enabled: false, refresh: () => undefined });

export const useCalendar = () => useContext(Ctx);

const REFRESH_MS = 5 * 60_000;

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { data, selected, today } = usePlanner();
  const ids = data.settings.calendarIds;
  const mock = typeof window !== 'undefined' && typeof window.__dpMockCalendar === 'function';
  const { isPro } = usePro();
  const enabled = mock || (isNative && isPro && ids.length > 0);
  const [events, setEvents] = useState<ExternalEvent[]>([]);
  const [tick, setTick] = useState(0);

  // Window covering the selected week plus today-1…today+2 (what widgets/notifications need).
  const weekStart = addDays(selected, -((weekday(selected) + 6) % 7));
  const fromKeyD = [weekStart, addDays(today, -1)].sort()[0];
  const toKeyD = [addDays(weekStart, 7), addDays(today, 3)].sort()[1];
  const idsKey = ids.join(',');
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    const from = fromKey(fromKeyD).getTime();
    const to = fromKey(toKeyD).getTime();
    const mine = ++seq.current;
    const load = async (): Promise<RawDeviceEvent[]> => {
      if (mock) return window.__dpMockCalendar!(from, to);
      const r = await Planner.listEvents({ from, to, calendarIds: ids });
      return r.events;
    };
    load()
      .then((raw) => {
        if (mine === seq.current) setEvents(toExternalEvents(raw));
      })
      .catch(() => {
        // Permission revoked or provider unavailable: show nothing rather than stale data.
        if (mine === seq.current) setEvents([]);
      });
  }, [enabled, fromKeyD, toKeyD, idsKey, tick, mock]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    let handle: { remove: () => void } | undefined;
    if (isNative) void CapApp.addListener('resume', () => setTick((t) => t + 1)).then((h) => (handle = h));
    return () => {
      window.clearInterval(id);
      handle?.remove();
    };
  }, [enabled]);

  const byDate = useMemo(() => groupByDate(events), [events]);
  const timed = useMemo(() => {
    const m = new Map<DateKey, ExternalEvent[]>();
    for (const [d, list] of byDate) m.set(d, list.filter((e) => !e.allDay));
    return m;
  }, [byDate]);
  const allDay = useMemo(() => {
    const m = new Map<DateKey, ExternalEvent[]>();
    for (const [d, list] of byDate) m.set(d, list.filter((e) => e.allDay));
    return m;
  }, [byDate]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const api = useMemo<CalendarApi>(
    () => ({
      eventsOn: (d) => timed.get(d) ?? EMPTY,
      allDayOn: (d) => allDay.get(d) ?? EMPTY,
      enabled,
      refresh,
    }),
    [timed, allDay, enabled, refresh],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
