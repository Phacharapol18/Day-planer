import { describe, it, expect } from 'vitest';
import { routeFromUrl } from './bridge';

describe('routeFromUrl', () => {
  it('routes widget/tile/notification links', () => {
    expect(routeFromUrl('dayplanner://quickadd')).toEqual({ kind: 'quickadd' });
    expect(routeFromUrl('dayplanner://focus')).toEqual({ kind: 'focus' });
    expect(routeFromUrl('dayplanner://today')).toEqual({ kind: 'today' });
    expect(routeFromUrl('dayplanner://pro')).toEqual({ kind: 'pro' });
    expect(routeFromUrl('dayplanner://day/2026-10-09')).toEqual({ kind: 'day', date: '2026-10-09' });
  });
  it('ignores anything else', () => {
    expect(routeFromUrl('https://evil.example/quickadd')).toBeNull();
    expect(routeFromUrl('dayplanner://day/not-a-date')).toBeNull();
    expect(routeFromUrl('dayplanner://settings')).toBeNull();
  });
});
