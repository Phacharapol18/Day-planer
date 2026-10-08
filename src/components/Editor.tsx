import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../state';
import { type Task, type Priority, type Repeat, CATEGORIES, REPEAT_LABEL, PRIORITY_LABEL, isScheduled, newId } from '../lib/model';
import { formatDuration, inputToTime, timeToInput, monthDay, todayKey } from '../lib/time';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { usePro } from '../pro/ProProvider';
import { canAddRepeat } from '../pro/entitlement';

const DURATIONS = [15, 30, 45, 60, 90, 120];

export function Editor() {
  const { editor, setEditor, data } = usePlanner();
  const source: Task | null =
    editor?.mode === 'new' ? editor.draft : editor ? (data.tasks.find((t) => t.id === editor.id) ?? null) : null;
  const open = !!editor && !!source;

  // If the task disappears underneath us (another tab, undo), close quietly.
  useEffect(() => {
    if (editor && !source) setEditor(null);
  }, [editor, source, setEditor]);

  return (
    <Dialog open={open} onClose={() => setEditor(null)} label={editor?.mode === 'new' ? 'New block' : 'Edit task'} className="editor" initialFocus={(el) => focusTitle(el, editor?.mode === 'new')}>
      {open && <EditorForm key={editor.mode === 'new' ? editor.draft.id : editor.id} source={source} isNew={editor.mode === 'new'} occurrenceDate={editor.mode === 'edit' ? editor.date : null} />}
    </Dialog>
  );
}

/** New blocks start in the title. Existing ones select it only with a mouse; on touch nothing opens the keyboard. */
function focusTitle(el: HTMLDialogElement, isNew: boolean) {
  const title = el.querySelector<HTMLInputElement>('[data-testid="editor-title"]');
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  if (title && (isNew || fine)) {
    title.focus();
    if (!isNew) title.select();
  } else el.focus();
}

function EditorForm({ source, isNew, occurrenceDate }: { source: Task; isNew: boolean; occurrenceDate: string | null }) {
  const { dispatch, setEditor, toast, undo, selected, data } = usePlanner();
  const { isPro, openPaywall } = usePro();
  const [t, setT] = useState<Task>(source);
  const [scheduled, setScheduled] = useState(isScheduled(source));
  const [timeText, setTimeText] = useState(timeToInput(source.start ?? data.settings.dayStart));
  const [customDur, setCustomDur] = useState(!DURATIONS.includes(source.duration));
  const titleRef = useRef<HTMLInputElement>(null);
  const [focusStep, setFocusStep] = useState<string | null>(null);
  // Focus a just-added step once React has rendered its input.
  useEffect(() => {
    if (!focusStep) return;
    document.querySelector<HTMLInputElement>(`[data-step="${focusStep}"]`)?.focus();
    setFocusStep(null);
  }, [focusStep]);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));

  const close = () => setEditor(null);

  const submit = () => {
    const title = t.title.trim();
    if (!title) {
      titleRef.current?.focus();
      titleRef.current?.setAttribute('aria-invalid', 'true');
      return;
    }
    const start = scheduled ? inputToTime(timeText) : null;
    if (scheduled && start === null) return;
    const next: Task = {
      ...t,
      steps: t.steps.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text),
      title,
      date: scheduled ? (t.date ?? selected) : null,
      start: scheduled ? start : null,
      repeat: scheduled ? t.repeat : 'none',
    };
    if (isNew) {
      dispatch({ type: 'add', task: next });
      toast(scheduled ? `Added “${title}”` : `Added “${title}” to inbox`, { action: { label: 'Undo', run: undo } });
    } else {
      const { id, ...patch } = next;
      dispatch({ type: 'update', id, patch });
    }
    close();
  };

  const remove = (mode: 'all' | 'one') => {
    if (mode === 'one' && occurrenceDate) {
      dispatch({ type: 'skipOccurrence', id: t.id, date: occurrenceDate });
      toast(`Removed ${monthDay(occurrenceDate)} from “${t.title}”`, { action: { label: 'Undo', run: undo } });
    } else {
      dispatch({ type: 'delete', id: t.id });
      toast(`Deleted “${t.title || 'Untitled'}”`, { action: { label: 'Undo', run: undo } });
    }
    close();
  };

  const repeating = !isNew && source.repeat !== 'none';
  const isHighlight = !isNew && data.journal[occurrenceDate ?? source.date ?? selected]?.highlight === source.id;

  return (
    <form
      className="editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="editor-head" data-cat={t.category}>
        <span className="editor-swatch" aria-hidden="true" />
        <input
          ref={titleRef}
          className="editor-title"
          value={t.title}
          onChange={(e) => {
            e.currentTarget.removeAttribute('aria-invalid');
            set('title', e.target.value);
          }}
          placeholder={scheduled ? 'What are you blocking time for?' : 'What needs doing?'}
          aria-label="Title"
          maxLength={200}
          data-testid="editor-title"
        />
        <button type="button" className="icon-btn" onClick={close} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>

      <div className="field-row">
        <div className="seg" role="radiogroup" aria-label="Where it lives">
          <button type="button" role="radio" aria-checked={scheduled} className={scheduled ? 'is-on' : ''} onClick={() => setScheduled(true)}>
            <Icon name="clock" size={14} /> On the timeline
          </button>
          <button type="button" role="radio" aria-checked={!scheduled} className={!scheduled ? 'is-on' : ''} onClick={() => setScheduled(false)}>
            <Icon name="inbox" size={14} /> Inbox
          </button>
        </div>
      </div>

      {scheduled ? (
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={t.date ?? selected} onChange={(e) => e.target.value && set('date', e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Starts</span>
            <input type="time" value={timeText} step={300} onChange={(e) => setTimeText(e.target.value)} required data-testid="editor-time" />
          </label>
        </div>
      ) : (
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Due (optional)</span>
            <input type="date" value={t.due ?? ''} min={todayKey()} onChange={(e) => set('due', e.target.value || null)} />
          </label>
        </div>
      )}

      <fieldset className="field">
        <legend className="field-label">Duration</legend>
        <div className="chips">
          {DURATIONS.map((d) => (
            <button
              type="button"
              key={d}
              className={`chip-btn${!customDur && t.duration === d ? ' is-on' : ''}`}
              aria-pressed={!customDur && t.duration === d}
              onClick={() => {
                setCustomDur(false);
                set('duration', d);
              }}
            >
              {formatDuration(d)}
            </button>
          ))}
          {customDur ? (
            <label className="chip-input">
              <input type="number" min={5} max={1440} step={5} value={t.duration} onChange={(e) => set('duration', Math.max(5, Math.min(1440, Number(e.target.value) || 5)))} aria-label="Minutes" autoFocus />
              <span>min</span>
            </label>
          ) : (
            <button type="button" className="chip-btn" onClick={() => setCustomDur(true)}>
              Custom
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Category</legend>
        <div className="swatches" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              role="radio"
              key={c.id}
              aria-checked={t.category === c.id}
              data-cat={c.id}
              className={`swatch${t.category === c.id ? ' is-on' : ''}`}
              onClick={() => set('category', c.id)}
            >
              <span className="swatch-dot" aria-hidden="true" />
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field-grid field-grid--stack-sm">
        <fieldset className="field">
          <legend className="field-label">Priority</legend>
          <div className="seg seg--small" role="radiogroup" aria-label="Priority">
            {([0, 1, 2, 3] as Priority[]).map((p) => (
              <button type="button" role="radio" key={p} aria-checked={t.priority === p} className={t.priority === p ? 'is-on' : ''} onClick={() => set('priority', p)}>
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </fieldset>
        {scheduled && (
          <label className="field">
            <span className="field-label">Repeat</span>
            <select
              value={t.repeat}
              onChange={(e) => {
                const r = e.target.value as Repeat;
                if (r !== 'none' && !canAddRepeat(data.tasks, isNew ? null : t.id, isPro)) {
                  openPaywall('repeats');
                  return;
                }
                set('repeat', r);
              }}
            >
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset className="field">
        <legend className="field-label">Steps {t.steps.length > 0 && <span className="field-count">{t.steps.length}</span>}</legend>
        <ol className="steps-edit">
          {t.steps.map((st, i) => (
            <li key={st.id}>
              <span className="steps-num" aria-hidden="true">{i + 1}</span>
              <input
                value={st.text}
                onChange={(e) => set('steps', t.steps.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const id = newId();
                    set('steps', [...t.steps.slice(0, i + 1), { id, text: '' }, ...t.steps.slice(i + 1)]);
                    setFocusStep(id);
                  } else if (e.key === 'Backspace' && !st.text) {
                    e.preventDefault();
                    set('steps', t.steps.filter((x) => x.id !== st.id));
                  }
                }}
                data-step={st.id}
                aria-label={`Step ${i + 1}`}
                maxLength={200}
              />
              <button type="button" className="icon-btn" onClick={() => set('steps', t.steps.filter((x) => x.id !== st.id))} aria-label={`Remove step ${i + 1}`}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn btn--quiet btn--sm steps-add"
          onClick={() => {
            const id = newId();
            set('steps', [...t.steps, { id, text: '' }]);
            setFocusStep(id);
          }}
        >
          <Icon name="plus" size={14} /> Add a step
        </button>
      </fieldset>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea value={t.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Links, agenda, the first small step…" />
      </label>

      {repeating && <p className="editor-note"><Icon name="repeat" size={14} /> Changes apply to every occurrence.</p>}

      {!isNew && (
          <div className="editor-secondary">
            {repeating && occurrenceDate ? (
              <>
                <button type="button" className="btn btn--danger-quiet btn--sm" onClick={() => remove('one')}>
                  <Icon name="trash" size={15} /> This day only
                </button>
                <button type="button" className="btn btn--danger-quiet btn--sm" onClick={() => remove('all')}>
                  All
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--danger-quiet btn--sm" onClick={() => remove('all')} data-testid="editor-delete">
                <Icon name="trash" size={15} /> Delete
              </button>
            )}
            {scheduled && (
              <button
                type="button"
                className={`btn btn--quiet btn--sm${isHighlight ? ' is-highlight-on' : ''}`}
                aria-pressed={isHighlight}
                onClick={() => {
                  const day = occurrenceDate ?? t.date ?? selected;
                  dispatch({ type: 'journal', date: day, patch: { highlight: isHighlight ? undefined : t.id } });
                  toast(isHighlight ? 'Highlight cleared' : `“${t.title}” is the day’s one thing`);
                }}
              >
                <Icon name="flag" size={15} /> Highlight
              </button>
            )}
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => {
                dispatch({ type: 'duplicate', id: t.id, date: occurrenceDate ?? selected });
                toast(`Duplicated “${t.title}”`, { action: { label: 'Undo', run: undo } });
                close();
              }}
            >
              <Icon name="copy" size={15} /> Duplicate
            </button>
          </div>
      )}
      <div className="editor-foot">
        <div className="editor-primary">
          <button type="button" className="btn btn--quiet" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" data-testid="editor-save">
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
