import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlanner } from '../state';
import { useDrag } from '../drag';
import { usePlanActions } from '../actions';
import { type Task, type Priority, PRIORITY_LABEL, inboxTasks, missedTasks } from '../lib/model';
import { diffDays, formatDuration, formatTime, monthDay, relativeDayName, shortDueLabel } from '../lib/time';
import { Icon } from './Icon';
import { usePro } from '../pro/ProProvider';

export function Inbox({ id }: { id?: string }) {
  const { data, today, setEditor, dispatch, inboxOpen, setInboxOpen } = usePlanner();
  const { drag, registerInbox } = useDrag();
  const { addFromText, autoPlanDay } = usePlanActions();
  const { isPro } = usePro();
  const [text, setText] = useState('');
  const rootRef = useRef<HTMLElement>(null);

  const inbox = useMemo(() => inboxTasks(data.tasks), [data.tasks]);
  const missed = useMemo(() => missedTasks(data.tasks, today), [data.tasks, today]);

  useEffect(() => {
    registerInbox(rootRef.current);
    return () => registerInbox(null);
  }, [registerInbox]);

  const dropping = !!drag && drag.kind === 'move';
  const dropActive = dropping && drag.overInbox;

  return (
    <>
    {inboxOpen && <button type="button" className="sheet-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setInboxOpen(false)} />}
    <aside
      id={id}
      ref={rootRef}
      className={`inbox${inboxOpen ? ' is-open' : ''}${dropping ? ' is-droppable' : ''}${dropActive ? ' is-drop-target' : ''}`}
      aria-label="Inbox"
    >
      <div className="inbox-head">
        <h2 className="inbox-title">
          Inbox <span className="count" aria-label={`${inbox.length} tasks`}>{inbox.length}</span>
        </h2>
        <button type="button" className="btn btn--quiet btn--sm" onClick={autoPlanDay} disabled={!inbox.length} title="Fit inbox tasks into free time, highest priority first">
          <Icon name="sparkle" size={15} /> Auto-plan
          {!isPro && <span className="pro-chip">Pro</span>}
        </button>
        <button type="button" className="icon-btn inbox-close" onClick={() => setInboxOpen(false)} aria-label="Close inbox">
          <Icon name="x" />
        </button>
      </div>

      <form
        className="inbox-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (addFromText(text)) setText('');
        }}
      >
        <Icon name="plus" size={16} className="inbox-add-icon" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…  e.g. Taxes 1h !!"
          aria-label="Add a task to the inbox"
          enterKeyHint="done"
          data-testid="inbox-input"
        />
      </form>

      <div className="inbox-scroll">
        {dropping && (
          <div className="inbox-drop" aria-hidden="true">
            <Icon name="inbox" size={20} /> Drop to unschedule
          </div>
        )}
        {inbox.length === 0 && !dropping && (
          <p className="inbox-empty">
            Everything has a time. <br />
            Capture new ideas above — plan them when you’re ready.
          </p>
        )}
        <ul className="task-list" data-testid="inbox-list">
          {inbox.map((t) => (
            <InboxItem key={t.id} task={t} onOpen={() => setEditor({ mode: 'edit', id: t.id, date: null })} onDone={() => dispatch({ type: 'toggleDone', id: t.id, date: today })} />
          ))}
        </ul>

        {missed.length > 0 && (
          <section className="missed" aria-label="Missed from earlier days">
            <h3 className="section-label">
              From earlier <span className="count">{missed.length}</span>
            </h3>
            <ul className="task-list">
              {missed.map((t) => (
                <InboxItem
                  key={t.id}
                  task={t}
                  missedOn={`${monthDay(t.date as string)}, ${formatTime(t.start as number, data.settings.use24h)}`}
                  onOpen={() => setEditor({ mode: 'edit', id: t.id, date: t.date })}
                  onDone={() => dispatch({ type: 'toggleDone', id: t.id, date: t.date as string })}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
      <p className="inbox-tip">
        <span className="tip-fine">
          Drag a task onto the timeline, or click{' '}
          <span role="img" aria-label="the schedule button">
            <Icon name="calPlus" size={13} />
          </span>{' '}
          for the next free slot
        </span>
        <span className="tip-coarse">
          Long-press a task to drag it onto the timeline, or tap{' '}
          <span role="img" aria-label="the schedule button">
            <Icon name="calPlus" size={13} />
          </span>{' '}
          for the next free slot
        </span>
      </p>
    </aside>
    </>
  );
}

function InboxItem({ task, missedOn, onOpen, onDone }: { task: Task; missedOn?: string; onOpen: () => void; onDone: () => void }) {
  const { today } = usePlanner();
  const { begin, drag } = useDrag();
  const { scheduleNext } = usePlanActions();
  const ghosted = drag?.taskId === task.id;

  return (
    <li
      className={`task${ghosted ? ' is-ghosted' : ''}`}
      data-cat={task.category}
      data-testid="inbox-item"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        begin(e, { kind: 'inbox', task, onClick: onOpen });
      }}
    >
      <button type="button" className="task-check" aria-label={`Complete “${task.title}”`} onClick={onDone}>
        <Icon name="check" size={12} />
      </button>
      <div
        className="task-body"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`${task.title}. ${formatDuration(task.duration)}${task.due ? `. ${spokenDue(task.due, today)}` : ''}${task.priority > 0 ? `. ${PRIORITY_LABEL[task.priority as Priority]} priority` : ''}. Open details`}
      >
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <span className="task-dot" aria-hidden="true" />
          {formatDuration(task.duration)}
          {missedOn && <span className="chip chip--late">{missedOn}</span>}
          {!missedOn && task.due && <span className={`chip${task.due < today ? ' chip--late' : ''}`}>{task.due < today ? shortDueLabel(task.due, today) : `Due ${shortDueLabel(task.due, today)}`}</span>}
          {task.priority > 0 && (
            <span className={`prio prio--${task.priority}`} aria-label={`Priority ${task.priority}`}>
              {'!'.repeat(task.priority)}
            </span>
          )}
        </span>
      </div>
      <button type="button" className="icon-btn task-schedule" onClick={() => scheduleNext(task)} aria-label={`Schedule “${task.title}” in the next free slot`} title="Next free slot">
        <Icon name="calPlus" size={16} />
      </button>
    </li>
  );
}

/** The due date as it should be read aloud (the chip uses abbreviations like "Tmrw"). */
function spokenDue(due: string, today: string): string {
  const diff = diffDays(due, today);
  if (diff < 0) return `Overdue since ${monthDay(due)}`;
  return `Due ${diff < 7 ? relativeDayName(due, today) : monthDay(due)}`;
}
