import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { usePlanner } from '../state';
import { useDrag } from '../drag';
import { type Occurrence, makeTask, occurrencesOn } from '../lib/model';
import { layoutColumns, freeGaps } from '../lib/layout';
import { formatDuration, formatHourLabel, formatTime, minutesNow, diffDays, MINUTES_PER_DAY, SNAP, clamp } from '../lib/time';
import { Icon } from './Icon';
import { useCalendar } from '../calendar';
import { haptic } from '../native/bridge';
import { type ExternalEvent, colorHex } from '../lib/external';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function Timeline() {
  const { data, selected, today, now, setEditor, dispatch, toast, undo } = usePlanner();
  const { drag, begin, registerTimeline } = useDrag();
  const { hourHeight, use24h, dayStart, dayEnd } = data.settings;
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const pxPerMin = hourHeight / 60;

  const occs = useMemo(() => occurrencesOn(data.tasks, selected), [data.tasks, selected]);
  const { eventsOn, allDayOn } = useCalendar();
  const events = eventsOn(selected);
  const allDay = allDayOn(selected);
  const columns = useMemo(
    () => layoutColumns([...occs.map((o) => ({ id: o.task.id, start: o.start, end: o.end })), ...events.map((e) => ({ id: e.id, start: e.start, end: e.end }))]),
    [occs, events],
  );
  const isToday = selected === today;
  const isPast = diffDays(selected, today) < 0;
  const nowMin = minutesNow(now);

  const gaps = useMemo(() => {
    if (isPast) return [];
    const from = isToday ? Math.max(dayStart, Math.ceil(nowMin / SNAP) * SNAP) : dayStart;
    return freeGaps([...occs, ...events], from, dayEnd, 30);
  }, [occs, events, isPast, isToday, dayStart, dayEnd, nowMin]);

  // Pointer → minute mapping for the drag engine.
  useEffect(() => {
    registerTimeline({
      scrollEl: scrollRef.current,
      minuteAt: (x, y) => {
        const lane = laneRef.current;
        const scroller = scrollRef.current;
        if (!lane || !scroller) return null;
        const lr = lane.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        if (x < sr.left || x > sr.right || y < sr.top - 24 || y > sr.bottom + 24) return null;
        return clamp((y - lr.top) / pxPerMin, 0, MINUTES_PER_DAY);
      },
    });
    return () => registerTimeline(null);
  }, [registerTimeline, pxPerMin]);

  // Land somewhere useful: just before "now" today, at the start of the working day otherwise.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = isToday ? (nowMin < dayStart ? dayStart - 60 : nowMin - 90) : Math.min(dayStart, occs[0]?.start ?? dayStart) - 30;
    el.scrollTop = Math.max(0, target * pxPerMin);
  }, [selected, hourHeight]);

  const openNew = useCallback(
    (start: number, duration = 30) => {
      setEditor({ mode: 'new', draft: makeTask({ title: '', date: selected, start, duration }) });
    },
    [selected, setEditor],
  );

  const onLanePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const lr = e.currentTarget.getBoundingClientRect();
    const minute = clamp(Math.floor((e.clientY - lr.top) / pxPerMin / SNAP) * SNAP, 0, MINUTES_PER_DAY - SNAP);
    begin(e, { kind: 'create', date: selected, anchor: minute, onClick: () => openNew(minute) });
  };

  const draggingId = drag?.preview ? drag.taskId : drag?.overInbox ? drag.taskId : null;

  return (
    <section className="timeline" aria-label="Day timeline">
      {allDay.length > 0 && (
        <ul className="tl-allday" aria-label="All-day events">
          {allDay.map((ev) => (
            <li key={ev.id} className="tl-allday-chip" style={ev.color !== null ? ({ '--cat': colorHex(ev.color) } as React.CSSProperties) : undefined}>
              <Icon name="calendar" size={12} /> {ev.title}
            </li>
          ))}
        </ul>
      )}
      <div className="tl-scroll" ref={scrollRef} data-testid="timeline-scroll">
        <div className="tl-grid" style={{ height: 24 * hourHeight }}>
          <div className="tl-gutter" aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className="tl-hour-label" style={{ top: h * hourHeight }}>
                {h === 0 ? '' : formatHourLabel(h, use24h)}
              </div>
            ))}
          </div>
          <div className="tl-lane" ref={laneRef} onPointerDown={onLanePointerDown} data-testid="timeline-lane">
            {HOURS.map((h) => (
              <div key={h} className="tl-hour-line" style={{ top: h * hourHeight }} aria-hidden="true" />
            ))}
            <div className="tl-offhours" style={{ top: 0, height: dayStart * pxPerMin }} aria-hidden="true" />
            <div className="tl-offhours" style={{ top: dayEnd * pxPerMin, height: (MINUTES_PER_DAY - dayEnd) * pxPerMin }} aria-hidden="true" />
            {isToday && <div className="tl-past" style={{ height: nowMin * pxPerMin }} aria-hidden="true" />}
            {isPast && <div className="tl-past" style={{ height: '100%' }} aria-hidden="true" />}

            {!drag &&
              gaps.map((g) => (
                <div key={g.start} className="tl-gap" style={{ top: g.start * pxPerMin + 3, height: (g.end - g.start) * pxPerMin - 6 }}>
                  <button
                    type="button"
                    className="tl-gap-label"
                    onClick={() => openNew(g.start, Math.min(60, g.end - g.start))}
                    aria-label={`Free ${formatDuration(g.end - g.start)} from ${formatTime(g.start, use24h)}. Add a block here.`}
                  >
                    <Icon name="plus" size={13} /> Free · {formatDuration(g.end - g.start)}
                  </button>
                </div>
              ))}

            {events.map((ev) => (
              <EventBlock
                key={ev.id}
                ev={ev}
                col={columns.get(ev.id) ?? { col: 0, cols: 1 }}
                pxPerMin={pxPerMin}
                use24h={use24h}
                past={isPast || (isToday && nowMin >= ev.end)}
                onOpen={() => toast(`${ev.title} · ${formatTime(ev.start, use24h)}–${formatTime(ev.end, use24h)}${ev.calendar ? ` · ${ev.calendar}` : ''}`)}
              />
            ))}

            {occs.map((o) => (
              <Block
                key={o.task.id}
                occ={o}
                highlight={data.journal[selected]?.highlight === o.task.id}
                col={columns.get(o.task.id) ?? { col: 0, cols: 1 }}
                pxPerMin={pxPerMin}
                use24h={use24h}
                nowMin={isToday ? nowMin : isPast ? MINUTES_PER_DAY + 1 : -1}
                ghosted={draggingId === o.task.id}
                onEdit={() => setEditor({ mode: 'edit', id: o.task.id, date: selected })}
                onPointerDown={(e, kind) => {
                  if (kind === 'resize') {
                    e.stopPropagation();
                    begin(e, { kind: 'resize', task: o.task, date: selected, start: o.start, duration: o.task.duration, onClick: () => setEditor({ mode: 'edit', id: o.task.id, date: selected }) });
                    return;
                  }
                  const lr = laneRef.current!.getBoundingClientRect();
                  const minute = (e.clientY - lr.top) / pxPerMin;
                  begin(e, {
                    kind: 'move',
                    task: o.task,
                    date: selected,
                    start: o.start,
                    duration: o.task.duration,
                    grabOffset: minute - o.start,
                    onClick: () => setEditor({ mode: 'edit', id: o.task.id, date: selected }),
                  });
                }}
                onToggle={() => {
                  if (!o.done) haptic.done();
                  dispatch({ type: 'toggleDone', id: o.task.id, date: selected });
                }}
                onNudge={(dStart, dDur) => {
                  if (dDur) dispatch({ type: 'schedule', id: o.task.id, date: selected, start: o.start, duration: Math.max(15, o.task.duration + dDur) });
                  else dispatch({ type: 'schedule', id: o.task.id, date: selected, start: o.start + dStart });
                }}
                onDelete={() => {
                  dispatch({ type: 'delete', id: o.task.id });
                  toast(`Deleted “${o.task.title || 'Untitled'}”`, { action: { label: 'Undo', run: undo } });
                }}
              />
            ))}

            {drag?.preview && (
              <div
                className={`block block--preview${drag.kind === 'create' ? ' block--create' : ''}`}
                data-cat={drag.category}
                style={{ top: drag.preview.start * pxPerMin, height: Math.max(drag.preview.duration * pxPerMin, 18), left: 4, right: 8 }}
                aria-hidden="true"
              >
                <div className="block-body">
                  <span className="block-title">{drag.preview.title}</span>
                  <span className="block-time">
                    {formatTime(drag.preview.start, use24h)} – {formatTime(drag.preview.start + drag.preview.duration, use24h)} · {formatDuration(drag.preview.duration)}
                  </span>
                </div>
              </div>
            )}

            {isToday && (
              <div className="now-line" style={{ top: nowMin * pxPerMin }} aria-hidden="true">
                <span className="now-pill">{formatTime(nowMin, use24h)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {occs.length === 0 && events.length === 0 && !drag && <EmptyDay past={isPast} />}
    </section>
  );
}

function EmptyDay({ past }: { past: boolean }) {
  const { setPanel } = usePlanner();
  return (
    <div className="tl-empty" role="note">
      <p className="tl-empty-title">{past ? 'Nothing was planned this day.' : 'A blank page.'}</p>
      {!past && (
        <p className="tl-empty-hint">
          Drag across the timeline to block time, drop tasks from your inbox, or{' '}
          <button type="button" className="link" onClick={() => setPanel('quickadd')}>
            type it in plain words
          </button>
          .
        </p>
      )}
    </div>
  );
}

/** Read-only event from a phone calendar: shown for context, counted as busy, never dragged. */
const EventBlock = memo(function EventBlock({ ev, col, pxPerMin, use24h, past, onOpen }: { ev: ExternalEvent; col: { col: number; cols: number }; pxPerMin: number; use24h: boolean; past: boolean; onOpen: () => void }) {
  const height = Math.max((ev.end - ev.start) * pxPerMin, 18);
  const widthPct = 100 / col.cols;
  const time = `${formatTime(ev.start, use24h)} – ${formatTime(ev.end, use24h)}`;
  return (
    <button
      type="button"
      className={`event${height < 40 ? ' event--compact' : ''}${past ? ' is-past' : ''}`}
      data-testid="event"
      style={{
        top: ev.start * pxPerMin,
        height,
        left: `calc(${col.col * widthPct}% + 4px)`,
        width: `calc(${widthPct}% - ${col.cols > 1 ? 6 : 12}px)`,
        ...(ev.color !== null ? { ['--cat' as string]: colorHex(ev.color) } : {}),
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
      aria-label={`${ev.title}, ${time}, from ${ev.calendar || 'your calendar'}`}
    >
      <span className="event-title">
        <Icon name="calendar" size={12} className="event-icon" /> {ev.title}
      </span>
      <span className="event-time">{time}</span>
    </button>
  );
});

interface BlockProps {
  occ: Occurrence;
  highlight: boolean;
  col: { col: number; cols: number };
  pxPerMin: number;
  use24h: boolean;
  nowMin: number;
  ghosted: boolean;
  onEdit: () => void;
  onPointerDown: (e: React.PointerEvent, kind: 'move' | 'resize') => void;
  onToggle: () => void;
  onNudge: (dStart: number, dDuration: number) => void;
  onDelete: () => void;
}

const Block = memo(function Block({ occ, highlight, col, pxPerMin, use24h, nowMin, ghosted, onEdit, onPointerDown, onToggle, onNudge, onDelete }: BlockProps) {
  const { task, start, end, done } = occ;
  const height = Math.max((end - start) * pxPerMin, 18);
  const compact = height < 40;
  const past = nowMin >= end;
  const current = nowMin >= start && nowMin < end;
  const progress = current ? (nowMin - start) / (end - start) : 0;
  const widthPct = 100 / col.cols;
  const timeLabel = `${formatTime(start, use24h)} – ${formatTime(end, use24h)}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onEdit();
        break;
      case ' ':
        e.preventDefault();
        onToggle();
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const d = e.key === 'ArrowUp' ? -SNAP : SNAP;
        if (e.shiftKey) onNudge(0, d);
        else onNudge(d, 0);
        break;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onDelete();
        break;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={['block', highlight && 'is-highlight', compact && 'block--compact', done && 'is-done', past && !done && 'is-past', current && 'is-current', ghosted && 'is-ghosted'].filter(Boolean).join(' ')}
      data-cat={task.category}
      data-testid="block"
      data-id={task.id}
      style={{
        top: start * pxPerMin,
        height,
        left: `calc(${col.col * widthPct}% + 4px)`,
        width: `calc(${widthPct}% - ${col.cols > 1 ? 6 : 12}px)`,
        ['--progress' as string]: progress,
      }}
      aria-label={`${task.title || 'Untitled'}, ${timeLabel}${done ? ', done' : ''}${current ? ', happening now' : ''}${highlight ? ', today’s highlight' : ''}`}
      aria-keyshortcuts="Enter Space ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Delete"
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="block-check"
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        aria-pressed={done}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <Icon name="check" size={12} />
      </button>
      <div className="block-body">
        <span className="block-title">
          {highlight && <Icon name="flag" size={12} className="block-flag" />}
          {task.title || 'Untitled'}
        </span>
        <span className="block-time">
          {timeLabel} · {formatDuration(end - start)}
          {task.repeat !== 'none' && <Icon name="repeat" size={11} className="block-meta-icon" />}
          {task.priority === 3 && <span className="block-prio" aria-label="High priority">!</span>}
        </span>
        {!compact && height > 64 && task.notes && <span className="block-notes">{task.notes}</span>}
      </div>
      <div className="block-resize" onPointerDown={(e) => onPointerDown(e, 'resize')} aria-hidden="true" />
    </div>
  );
});
