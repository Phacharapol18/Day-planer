import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CategoryId, Task } from './lib/model';
import { type DateKey, clamp, snap, MINUTES_PER_DAY } from './lib/time';

export type DragPayload =
  | { kind: 'move'; task: Task; date: DateKey; start: number; duration: number; grabOffset: number; onClick?: () => void }
  | { kind: 'resize'; task: Task; date: DateKey; start: number; duration: number; onClick?: () => void }
  | { kind: 'inbox'; task: Task; onClick?: () => void }
  | { kind: 'create'; date: DateKey; anchor: number; onClick?: () => void };

export interface DragPreview {
  start: number;
  duration: number;
  title: string;
  category: CategoryId;
  taskId: string | null;
}

export interface DragState {
  kind: DragPayload['kind'];
  taskId: string | null;
  x: number;
  y: number;
  overTimeline: boolean;
  overInbox: boolean;
  preview: DragPreview | null;
  title: string;
  category: CategoryId;
}

export interface DropResult {
  payload: DragPayload;
  /** Timeline drop. */
  start?: number;
  duration?: number;
  /** Dropped on the inbox. */
  toInbox?: boolean;
}

interface Geometry {
  /** Minute under the pointer, or null when the pointer is not over the timeline. */
  minuteAt: (x: number, y: number) => number | null;
  scrollEl: HTMLElement | null;
}

interface DragApi {
  drag: DragState | null;
  begin: (e: React.PointerEvent, payload: DragPayload) => void;
  registerTimeline: (g: Geometry | null) => void;
  registerInbox: (el: HTMLElement | null) => void;
}

const Ctx = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('DragProvider missing');
  return v;
}

const LONG_PRESS_MS = 260;
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
const EDGE = 56;
const EDGE_DWELL_MS = 180;

function compute(payload: DragPayload, minute: number | null): { preview: DragPreview | null; start?: number; duration?: number } {
  const titleOf = () => ('task' in payload ? payload.task.title : 'New block');
  const catOf = (): CategoryId => ('task' in payload ? payload.task.category : 'work');
  const idOf = () => ('task' in payload ? payload.task.id : null);
  if (minute === null) return { preview: null };
  switch (payload.kind) {
    case 'move': {
      const start = clamp(snap(minute - payload.grabOffset), 0, MINUTES_PER_DAY - payload.duration);
      return { start, duration: payload.duration, preview: { start, duration: payload.duration, title: titleOf(), category: catOf(), taskId: idOf() } };
    }
    case 'inbox': {
      const d = payload.task.duration;
      const start = clamp(snap(minute - Math.min(15, d / 2)), 0, MINUTES_PER_DAY - d);
      return { start, duration: d, preview: { start, duration: d, title: titleOf(), category: catOf(), taskId: idOf() } };
    }
    case 'resize': {
      const duration = clamp(snap(minute - payload.start), 15, MINUTES_PER_DAY - payload.start);
      return { start: payload.start, duration, preview: { start: payload.start, duration, title: titleOf(), category: catOf(), taskId: idOf() } };
    }
    case 'create': {
      const m = clamp(snap(minute), 0, MINUTES_PER_DAY);
      const a = payload.anchor;
      const start = Math.min(a, m);
      const duration = Math.max(15, Math.abs(m - a));
      const s = clamp(start, 0, MINUTES_PER_DAY - duration);
      return { start: s, duration, preview: { start: s, duration, title: 'New block', category: 'work', taskId: null } };
    }
  }
}

export function DragProvider({ children, onDrop, onActivate }: { children: ReactNode; onDrop: (r: DropResult) => void; onActivate?: (p: DragPayload) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const geo = useRef<Geometry | null>(null);
  const inboxEl = useRef<HTMLElement | null>(null);
  const session = useRef<{
    payload: DragPayload;
    pointerId: number;
    type: string;
    sx: number;
    sy: number;
    x: number;
    y: number;
    active: boolean;
    timer: number | null;
    raf: number | null;
    edgeSince: number;
    last: ReturnType<typeof compute> & { overInbox: boolean };
  } | null>(null);
  const onDropRef = useRef(onDrop);
  const onActivateRef = useRef(onActivate);
  onDropRef.current = onDrop;
  onActivateRef.current = onActivate;

  const update = useCallback(() => {
    const s = session.current;
    if (!s || !s.active) return;
    const minute = geo.current?.minuteAt(s.x, s.y) ?? null;
    const r = inboxEl.current?.getBoundingClientRect();
    const overInbox = !!r && r.width > 0 && s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom && s.payload.kind !== 'resize' && s.payload.kind !== 'create';
    const res = compute(s.payload, overInbox ? null : minute);
    s.last = { ...res, overInbox };
    const p = s.payload;
    setDrag({
      kind: p.kind,
      taskId: 'task' in p ? p.task.id : null,
      x: s.x,
      y: s.y,
      overTimeline: !!res.preview,
      overInbox,
      preview: res.preview,
      title: 'task' in p ? p.task.title : 'New block',
      category: 'task' in p ? p.task.category : 'work',
    });
  }, []);

  const cleanup = useCallback(() => {
    const s = session.current;
    if (s?.timer) window.clearTimeout(s.timer);
    if (s?.raf) cancelAnimationFrame(s.raf);
    session.current = null;
    document.documentElement.classList.remove('is-dragging');
    setDrag(null);
  }, []);

  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s || !s.active) return;
    const el = geo.current?.scrollEl;
    if (el) {
      const r = el.getBoundingClientRect();
      let dy = 0;
      const inColumn = s.x >= r.left && s.x <= r.right;
      if (!inColumn) dy = 0;
      else if (s.y < r.top + EDGE && s.y > r.top - 40) dy = -Math.ceil(((r.top + EDGE - s.y) / EDGE) * 14);
      else if (s.y > r.bottom - EDGE && s.y < r.bottom + 40) dy = Math.ceil(((s.y - (r.bottom - EDGE)) / EDGE) * 14);
      // Only scroll after the pointer rests in the edge zone briefly, so passing through it doesn't jolt the view.
      if (!dy) s.edgeSince = 0;
      else if (!s.edgeSince) s.edgeSince = performance.now();
      else if (performance.now() - s.edgeSince > EDGE_DWELL_MS) {
        el.scrollTop += dy;
        update();
      }
    }
    s.raf = requestAnimationFrame(autoScroll);
  }, [update]);

  const activate = useCallback(() => {
    const s = session.current;
    if (!s || s.active) return;
    s.active = true;
    document.documentElement.classList.add('is-dragging');
    if (s.type === 'touch') navigator.vibrate?.(8);
    onActivateRef.current?.(s.payload);
    update();
    s.raf = requestAnimationFrame(autoScroll);
  }, [update, autoScroll]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.x = e.clientX;
      s.y = e.clientY;
      if (!s.active) {
        const dist = Math.hypot(s.x - s.sx, s.y - s.sy);
        if (s.type === 'touch') {
          if (dist > TOUCH_SLOP) cleanup(); // it's a scroll, not a drag
        } else if (dist > MOUSE_SLOP) activate();
        return;
      }
      update();
    };
    const up = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (!s.active) {
        const p = s.payload;
        cleanup();
        if ('onClick' in p) p.onClick?.();
        return;
      }
      const { payload, last } = s;
      cleanup();
      if (last.overInbox) onDropRef.current({ payload, toInbox: true });
      else if (last.start !== undefined) onDropRef.current({ payload, start: last.start, duration: last.duration });
    };
    const cancel = (e: PointerEvent) => {
      const s = session.current;
      if (s && e.pointerId === s.pointerId) cleanup();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && session.current?.active) {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    };
    // Once a touch drag is active, stop the page from panning underneath the finger.
    const touchmove = (e: TouchEvent) => {
      if (session.current?.active) e.preventDefault();
    };
    const ctxmenu = (e: Event) => {
      if (session.current) e.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    document.addEventListener('touchmove', touchmove, { passive: false });
    window.addEventListener('contextmenu', ctxmenu);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('touchmove', touchmove);
      window.removeEventListener('contextmenu', ctxmenu);
    };
  }, [activate, cleanup, update]);

  const begin = useCallback(
    (e: React.PointerEvent, payload: DragPayload) => {
      if (e.button !== 0 || session.current) return;
      if (payload.kind === 'create' && e.pointerType === 'touch') {
        // Touch users scroll the timeline; a tap there opens the editor instead of drawing a block.
        if ('onClick' in payload) {
          const sx = e.clientX;
          const sy = e.clientY;
          const t0 = Date.now();
          const end = (ev: PointerEvent) => {
            window.removeEventListener('pointerup', end);
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < TOUCH_SLOP && Date.now() - t0 < 500) payload.onClick?.();
          };
          window.addEventListener('pointerup', end);
        }
        return;
      }
      session.current = {
        payload,
        pointerId: e.pointerId,
        type: e.pointerType,
        sx: e.clientX,
        sy: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
        timer: null,
        raf: null,
        edgeSince: 0,
        last: { preview: null, overInbox: false },
      };
      if (payload.kind === 'resize' && e.pointerType !== 'mouse') {
        // The handle has touch-action: none, so a touch on it is unambiguous.
        e.preventDefault();
        activate();
      } else if (e.pointerType === 'touch') {
        session.current.timer = window.setTimeout(activate, LONG_PRESS_MS);
      }
    },
    [activate],
  );

  const registerTimeline = useCallback((g: Geometry | null) => {
    geo.current = g;
  }, []);
  const registerInbox = useCallback((el: HTMLElement | null) => {
    inboxEl.current = el;
  }, []);

  const api = useMemo(() => ({ drag, begin, registerTimeline, registerInbox }), [drag, begin, registerTimeline, registerInbox]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
