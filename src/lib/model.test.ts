import { describe, it, expect } from 'vitest';
import { makeTask, occursOn, occurrencesOn, inboxTasks, missedTasks } from './model';
import { historyReduce, reduce } from './store';
import { emptyData, migrateLegacy, sanitizeData, load, save, STORAGE_KEY, LEGACY_KEY } from './storage';

const TODAY = '2026-10-08'; // Thu

describe('recurrence', () => {
  const daily = makeTask({ title: 'd', date: TODAY, start: 420, repeat: 'daily' });
  const wk = makeTask({ title: 'w', date: TODAY, start: 420, repeat: 'weekdays' });
  const weekly = makeTask({ title: 'k', date: TODAY, start: 420, repeat: 'weekly' });
  it('respects anchor and patterns', () => {
    expect(occursOn(daily, '2026-10-07')).toBe(false);
    expect(occursOn(daily, '2026-10-11')).toBe(true);
    expect(occursOn(wk, '2026-10-10')).toBe(false); // Sat
    expect(occursOn(wk, '2026-10-12')).toBe(true);
    expect(occursOn(weekly, '2026-10-15')).toBe(true);
    expect(occursOn(weekly, '2026-10-16')).toBe(false);
  });
  it('tracks done and skip per occurrence', () => {
    let d = { ...emptyData(), tasks: [daily] };
    d = reduce(d, { type: 'toggleDone', id: daily.id, date: '2026-10-09' });
    expect(occurrencesOn(d.tasks, '2026-10-09')[0].done).toBe(true);
    expect(occurrencesOn(d.tasks, '2026-10-10')[0].done).toBe(false);
    d = reduce(d, { type: 'skipOccurrence', id: daily.id, date: '2026-10-10' });
    expect(occurrencesOn(d.tasks, '2026-10-10')).toHaveLength(0);
  });
});

describe('inbox & missed', () => {
  it('sorts inbox by priority then due', () => {
    const a = makeTask({ title: 'a', priority: 1 });
    const b = makeTask({ title: 'b', priority: 3 });
    const c = makeTask({ title: 'c', priority: 1, due: '2026-10-09' });
    const s = makeTask({ title: 's', date: TODAY, start: 60 });
    expect(inboxTasks([a, b, c, s]).map((t) => t.title)).toEqual(['b', 'c', 'a']);
  });
  it('lists unfinished one-offs from past days', () => {
    const old = makeTask({ title: 'old', date: '2026-10-06', start: 60 });
    const doneOld = makeTask({ title: 'x', date: '2026-10-06', start: 60, done: true });
    const now = makeTask({ title: 'now', date: TODAY, start: 60 });
    expect(missedTasks([old, doneOld, now], TODAY).map((t) => t.title)).toEqual(['old']);
  });
});

describe('store', () => {
  it('keeps scheduled invariant and clamps', () => {
    const t = makeTask({ title: 't', date: TODAY, start: 600 });
    let d = { ...emptyData(), tasks: [t] };
    d = reduce(d, { type: 'update', id: t.id, patch: { start: null } });
    expect(d.tasks[0]).toMatchObject({ date: null, start: null });
    d = reduce(d, { type: 'schedule', id: t.id, date: TODAY, start: 1430, duration: 60 });
    expect(d.tasks[0]).toMatchObject({ start: 1380, duration: 60 });
    d = reduce(d, { type: 'update', id: t.id, patch: { duration: 2 } });
    expect(d.tasks[0].duration).toBe(5);
  });
  it('undo/redo restores plans but keeps settings', () => {
    let h = { past: [], present: emptyData(), future: [] } as Parameters<typeof historyReduce>[0];
    h = historyReduce(h, { type: 'add', task: makeTask({ title: 'a' }) });
    h = historyReduce(h, { type: 'settings', patch: { use24h: true } });
    h = historyReduce(h, { type: 'undo' });
    expect(h.present.tasks).toHaveLength(0);
    expect(h.present.settings.use24h).toBe(true);
    h = historyReduce(h, { type: 'redo' });
    expect(h.present.tasks).toHaveLength(1);
  });
  it('duplicate places copy right after the source', () => {
    const t = makeTask({ title: 't', date: TODAY, start: 600, duration: 45, repeat: 'daily' });
    const d = reduce({ ...emptyData(), tasks: [t] }, { type: 'duplicate', id: t.id, date: '2026-10-10' });
    expect(d.tasks[1]).toMatchObject({ title: 't', date: '2026-10-10', start: 645, repeat: 'none' });
    expect(d.tasks[1].id).not.toBe(t.id);
  });
});

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

describe('storage', () => {
  it('migrates the old hour notes (latest wins, blanks dropped)', () => {
    const raw = JSON.stringify([
      { myContent: 'old', hour: '09:00' },
      { myContent: 'Standup\nwith team', hour: '09:00' },
      { myContent: '  ', hour: '10:00' },
      { myContent: 'Lunch', hour: '12:00' },
      { nonsense: true },
    ]);
    const t = migrateLegacy(raw, TODAY);
    expect(t.map((x) => [x.title, x.start, x.notes])).toEqual([['Standup', 540, 'with team'], ['Lunch', 720, '']]);
    expect(migrateLegacy('not json', TODAY)).toEqual([]);
  });
  it('round-trips and imports legacy only once', () => {
    const s = new MemStorage();
    s.setItem(LEGACY_KEY, JSON.stringify([{ myContent: 'Gym', hour: '18:00' }]));
    const first = load(s as unknown as Storage, TODAY);
    expect(first.imported).toBe(1);
    save(s as unknown as Storage, first.data);
    const second = load(s as unknown as Storage, TODAY);
    expect(second.imported).toBe(0);
    expect(second.data.tasks).toHaveLength(1);
  });
  it('quarantines corrupt data instead of overwriting it', () => {
    const s = new MemStorage();
    s.setItem(STORAGE_KEY, '{broken');
    const r = load(s as unknown as Storage, TODAY);
    expect(r.corrupt).toBe(true);
    expect([...s.m.keys()].some((k) => k.includes(':corrupt:'))).toBe(true);
  });
  it('sanitizes hostile or malformed input', () => {
    const d = sanitizeData({
      tasks: [
        { id: 'a', title: 'ok', date: '2026-10-08', start: 5000, duration: -4, category: 'nope', priority: 9 },
        { id: 'a', title: 'dup' },
        { title: 'no id' },
        'junk',
      ],
      settings: { dayStart: 900, dayEnd: 600, hourHeight: 9999, theme: 'neon' },
    })!;
    expect(d.tasks).toHaveLength(1);
    expect(d.tasks[0]).toMatchObject({ date: null, start: null, duration: 30, category: 'work', priority: 0 });
    expect(d.settings).toMatchObject({ dayStart: 480, dayEnd: 1320, hourHeight: 72, theme: 'system' });
    expect(sanitizeData({ tasks: 'x' })).toBeNull();
  });
});
