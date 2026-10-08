import type { Task } from '../lib/model';

/** Google Play subscription product and its base plans (configure the same IDs in Play Console). */
export const PRO_PRODUCT_ID = 'dayplanner_pro';
export const PRO_PLANS = { monthly: 'monthly', yearly: 'yearly' } as const;
export type ProPlan = keyof typeof PRO_PLANS;

/** Things that need Pro. Everything else — the timeline, inbox, quick add, reminders, focus — is free. */
export type ProFeature = 'autoplan' | 'calendars' | 'nowcard' | 'widgets' | 'repeats' | 'insights' | 'themes';

export const FREE_REPEAT_LIMIT = 3;

export const PRO_FEATURES: { id: ProFeature; title: string; detail: string }[] = [
  { id: 'autoplan', title: 'Auto-plan', detail: 'Fill your free time with the right tasks in one tap.' },
  { id: 'calendars', title: 'Your calendars, built in', detail: 'Google, Outlook and Samsung events on your timeline.' },
  { id: 'widgets', title: 'Home-screen widgets', detail: 'Now & next with a live countdown, plus today at a glance.' },
  { id: 'nowcard', title: 'Live Now card', detail: 'Countdown, Done and +15 min right in your notifications.' },
  { id: 'repeats', title: 'Unlimited routines', detail: `Free includes ${FREE_REPEAT_LIMIT} repeating blocks.` },
  { id: 'insights', title: 'Insights & streaks', detail: 'See where your time goes and keep your planning streak.' },
];

export interface ProState {
  active: boolean;
  /** Where the entitlement came from. */
  source: 'play' | 'cache' | 'dev' | 'none';
  plan: ProPlan | null;
  /** Subscription is set to end at the end of the current period. */
  willCancel: boolean;
  inTrial: boolean;
  expiresAt: number | null;
  checkedAt: number;
}

export const NO_PRO: ProState = { active: false, source: 'none', plan: null, willCancel: false, inTrial: false, expiresAt: null, checkedAt: 0 };

/** The subset of the billing plugin's Transaction we rely on. */
export interface PurchaseLike {
  productIdentifier: string;
  planIdentifier?: string;
  isActive?: boolean;
  purchaseState?: string;
  subscriptionState?: string;
  expirationDate?: string;
  willCancel?: boolean | null;
  isTrialPeriod?: boolean;
  isAcknowledged?: boolean;
}

const ACTIVE_STATES = new Set(['subscribed', 'inGracePeriod', 'unknown', undefined]);

/** Decide entitlement from the store's current purchases. Pending or revoked purchases do not grant Pro. */
export function evaluatePurchases(purchases: PurchaseLike[], now: number): ProState {
  for (const p of purchases) {
    if (p.productIdentifier !== PRO_PRODUCT_ID) continue;
    if (p.isActive === false) continue;
    if (p.purchaseState && !/^(1|purchased|PURCHASED)$/.test(String(p.purchaseState))) continue;
    if (!ACTIVE_STATES.has(p.subscriptionState as string | undefined)) continue;
    const exp = p.expirationDate ? Date.parse(p.expirationDate) : NaN;
    if (Number.isFinite(exp) && exp < now) continue;
    const plan = (Object.keys(PRO_PLANS) as ProPlan[]).find((k) => PRO_PLANS[k] === p.planIdentifier) ?? null;
    return {
      active: true,
      source: 'play',
      plan,
      willCancel: p.willCancel === true,
      inTrial: p.isTrialPeriod === true,
      expiresAt: Number.isFinite(exp) ? exp : null,
      checkedAt: now,
    };
  }
  return { ...NO_PRO, checkedAt: now };
}

/** How long a cached "active" result is trusted when the store can't be reached (offline, Play down). */
export const OFFLINE_GRACE_MS = 7 * 24 * 3600_000;

export function fromCache(cached: ProState | null, now: number): ProState {
  if (!cached || !cached.active) return NO_PRO;
  if (now - cached.checkedAt > OFFLINE_GRACE_MS) return NO_PRO;
  if (cached.expiresAt !== null && cached.expiresAt + OFFLINE_GRACE_MS < now) return NO_PRO;
  return { ...cached, source: 'cache' };
}

export function parseCache(raw: string | null): ProState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<ProState>;
    if (typeof o.active !== 'boolean' || typeof o.checkedAt !== 'number') return null;
    return { ...NO_PRO, ...o } as ProState;
  } catch {
    return null;
  }
}

export function repeatingCount(tasks: Task[]): number {
  return tasks.filter((t) => t.repeat !== 'none' && t.date !== null && t.start !== null).length;
}

/** Can this task be saved as repeating? Editing an already-repeating task is always allowed. */
export function canAddRepeat(tasks: Task[], editingId: string | null, pro: boolean): boolean {
  if (pro) return true;
  const existing = editingId ? tasks.find((t) => t.id === editingId) : undefined;
  if (existing && existing.repeat !== 'none') return true;
  return repeatingCount(tasks) < FREE_REPEAT_LIMIT;
}
