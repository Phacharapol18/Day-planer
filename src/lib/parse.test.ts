import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from './parse';

const TODAY = '2026-10-08'; // Thursday
const p = (s: string) => parseQuickAdd(s, TODAY);

describe('parseQuickAdd', () => {
  it('keeps plain titles untouched', () => {
    const r = p('Email Dan about the 3 offers');
    expect(r).toMatchObject({ title: 'Email Dan about the 3 offers', start: null, date: null, duration: null });
  });

  it('parses time + duration + priority + tag', () => {
    const r = p('Gym 6pm 45m !high #health');
    expect(r).toMatchObject({ title: 'Gym', start: 18 * 60, duration: 45, priority: 3, category: 'health', date: TODAY });
  });

  it('parses ranges and infers am/pm', () => {
    expect(p('Standup 9:30-10am')).toMatchObject({ title: 'Standup', start: 570, duration: 30 });
    expect(p('Lunch 11-1pm')).toMatchObject({ title: 'Lunch', start: 660, duration: 120 });
    expect(p('Review 3-4pm')).toMatchObject({ start: 900, duration: 60 });
    expect(p('Block 14:00 to 15:30')).toMatchObject({ start: 840, duration: 90 });
  });

  it('does not treat bare numbers as times', () => {
    expect(p('Buy 3-4 apples')).toMatchObject({ title: 'Buy 3-4 apples', start: null });
    expect(p('Read 20 pages')).toMatchObject({ title: 'Read 20 pages', start: null });
  });

  it('guesses afternoon for bare small hours with "at"', () => {
    expect(p('Call mom at 4')).toMatchObject({ title: 'Call mom', start: 16 * 60 });
    expect(p('Breakfast at 8')).toMatchObject({ start: 8 * 60 });
    expect(p('Early run at 06:00')).toMatchObject({ start: 6 * 60 });
  });

  it('handles noon/midnight and 12am/12pm', () => {
    expect(p('Lunch at noon')).toMatchObject({ title: 'Lunch', start: 720 });
    expect(p('X 12am')).toMatchObject({ start: 0 });
    expect(p('X 12pm')).toMatchObject({ start: 720 });
  });

  it('parses durations in many forms', () => {
    expect(p('Write 1.5h').duration).toBe(90);
    expect(p('Write 1h30').duration).toBe(90);
    expect(p('Write for 2 hours').duration).toBe(120);
    expect(p('Write 90 min').duration).toBe(90);
  });

  it('parses relative and absolute dates', () => {
    expect(p('Dentist tomorrow 3pm')).toMatchObject({ title: 'Dentist', date: '2026-10-09', start: 900 });
    expect(p('Pay rent fri')).toMatchObject({ title: 'Pay rent', date: '2026-10-09', start: null });
    expect(p('Report by friday')).toMatchObject({ title: 'Report', date: '2026-10-09' });
    expect(p('Thing thursday').date).toBe(TODAY);
    expect(p('Thing next thursday').date).toBe('2026-10-15');
    expect(p('Trip oct 20').date).toBe('2026-10-20');
    expect(p('Trip 3 jan').date).toBe('2027-01-03');
    expect(p('Trip 2026-12-01').date).toBe('2026-12-01');
    expect(p('Follow up in 3 days').date).toBe('2026-10-11');
  });

  it('parses repeats', () => {
    expect(p('Standup 9am every weekday')).toMatchObject({ title: 'Standup', repeat: 'weekdays', start: 540 });
    expect(p('Meditate daily 7am')).toMatchObject({ title: 'Meditate', repeat: 'daily' });
    expect(p('Team sync every monday 10am')).toMatchObject({ title: 'Team sync', repeat: 'weekly', date: '2026-10-12' });
  });

  it('keeps unknown hashtags in the title', () => {
    expect(p('Plan #q4 launch')).toMatchObject({ title: 'Plan #q4 launch', category: null });
  });

  it('priority bangs', () => {
    expect(p('Taxes !!').priority).toBe(2);
    expect(p('Taxes !').priority).toBe(1);
    expect(p('Wow!').priority).toBe(0);
  });
});
