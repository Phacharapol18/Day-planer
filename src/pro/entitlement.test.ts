import { describe, it, expect } from 'vitest';
import { evaluatePurchases, fromCache, parseCache, canAddRepeat, repeatingCount, PRO_PRODUCT_ID, OFFLINE_GRACE_MS, NO_PRO } from './entitlement';
import { makeTask } from '../lib/model';

const NOW = Date.UTC(2026, 9, 8, 10);

describe('evaluatePurchases', () => {
  it('grants Pro for an active subscription and reads the plan', () => {
    const s = evaluatePurchases([{ productIdentifier: PRO_PRODUCT_ID, planIdentifier: 'yearly', isActive: true, purchaseState: 'PURCHASED', isTrialPeriod: true, expirationDate: new Date(NOW + 86400_000).toISOString() }], NOW);
    expect(s).toMatchObject({ active: true, source: 'play', plan: 'yearly', inTrial: true, checkedAt: NOW });
  });
  it('rejects other products, pending, revoked, expired and inactive purchases', () => {
    const bad = [
      { productIdentifier: 'something_else', isActive: true },
      { productIdentifier: PRO_PRODUCT_ID, purchaseState: 'PENDING' },
      { productIdentifier: PRO_PRODUCT_ID, subscriptionState: 'revoked' },
      { productIdentifier: PRO_PRODUCT_ID, subscriptionState: 'expired' },
      { productIdentifier: PRO_PRODUCT_ID, isActive: false },
      { productIdentifier: PRO_PRODUCT_ID, expirationDate: new Date(NOW - 1000).toISOString() },
    ];
    for (const p of bad) expect(evaluatePurchases([p], NOW).active).toBe(false);
  });
  it('keeps Pro during grace period and flags pending cancellation', () => {
    const s = evaluatePurchases([{ productIdentifier: PRO_PRODUCT_ID, planIdentifier: 'monthly', subscriptionState: 'inGracePeriod', willCancel: true }], NOW);
    expect(s).toMatchObject({ active: true, plan: 'monthly', willCancel: true });
  });
});

describe('offline cache', () => {
  const active = { ...NO_PRO, active: true, source: 'play' as const, checkedAt: NOW, expiresAt: NOW + 86400_000 };
  it('trusts a recent active result offline, marked as cache', () => {
    expect(fromCache(active, NOW + 3600_000)).toMatchObject({ active: true, source: 'cache' });
  });
  it('stops trusting it after the grace window', () => {
    expect(fromCache(active, NOW + OFFLINE_GRACE_MS + 1).active).toBe(false);
    expect(fromCache({ ...active, expiresAt: NOW - OFFLINE_GRACE_MS - 1 }, NOW).active).toBe(false);
  });
  it('parses defensively', () => {
    expect(parseCache('nope')).toBeNull();
    expect(parseCache('{"active":"yes"}')).toBeNull();
    expect(parseCache(JSON.stringify(active))).toMatchObject({ active: true });
  });
});

describe('repeat limit', () => {
  const rep = (i: number) => makeTask({ title: `r${i}`, date: '2026-10-08', start: 60 * i, repeat: 'daily' });
  it('free users get 3 repeating blocks; editing existing ones always works', () => {
    const three = [rep(1), rep(2), rep(3)];
    expect(repeatingCount(three)).toBe(3);
    expect(canAddRepeat(three.slice(0, 2), null, false)).toBe(true);
    expect(canAddRepeat(three, null, false)).toBe(false);
    expect(canAddRepeat(three, three[0].id, false)).toBe(true);
    expect(canAddRepeat(three, null, true)).toBe(true);
  });
});
