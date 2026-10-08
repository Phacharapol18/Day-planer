import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as CapApp } from '@capacitor/app';
import { NativePurchases, PURCHASE_TYPE, type Product, type Transaction } from '@capgo/native-purchases';
import { Planner, isNative } from '../native/planner';
import { type ProFeature, type ProPlan, type ProState, NO_PRO, PRO_PLANS, PRO_PRODUCT_ID, evaluatePurchases, fromCache, parseCache } from './entitlement';

const CACHE_KEY = 'dayplanner:pro';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.phacharapol.dayplanner';
/** Public site (legal pages). Absolute so links work from inside the Android WebView too. */
export const SITE_URL = 'https://phacharapol18.github.io/Day-planer/';

export interface PlanOffer {
  plan: ProPlan;
  priceString: string;
  price: number;
  currency: string;
  /** Free-trial length in days when the plan has an introductory free phase. */
  trialDays: number | null;
  offerToken?: string;
}

export type PurchaseResult = 'ok' | 'cancelled' | 'pending' | 'error';

interface ProApi {
  pro: ProState;
  isPro: boolean;
  /** Billing available here (Android app with Play). */
  canBuy: boolean;
  offers: Partial<Record<ProPlan, PlanOffer>>;
  offersState: 'idle' | 'loading' | 'ready' | 'error';
  paywall: { open: boolean; feature: ProFeature | null };
  openPaywall: (feature?: ProFeature) => void;
  closePaywall: () => void;
  /** Returns true when the feature can be used; otherwise opens the paywall. */
  require: (feature: ProFeature) => boolean;
  purchase: (plan: ProPlan) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  manage: () => void;
  loadOffers: () => void;
}

const Ctx = createContext<ProApi | null>(null);

export function usePro(): ProApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('ProProvider missing');
  return v;
}

function readCache(): ProState | null {
  try {
    return parseCache(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(s: ProState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Initial state: the web build honours a dev unlock (for testing); the app trusts only Play or a recent Play result. */
function initialState(): ProState {
  const cached = readCache();
  if (!isNative && cached?.active && cached.source === 'dev') return cached;
  // A dev unlock is only ever honoured on debug builds, after refresh() confirms the build type.
  return fromCache(cached?.source === 'dev' ? null : cached, Date.now());
}

function trialDaysOf(p: Product): number | null {
  const intro = p.introductoryPrice as { price?: number; subscriptionPeriod?: { numberOfUnits?: number; unit?: number } } | null;
  if (intro && intro.price === 0) {
    const n = intro.subscriptionPeriod?.numberOfUnits ?? 0;
    const unit = intro.subscriptionPeriod?.unit ?? 0; // 0 day, 1 week, 2 month, 3 year
    const days = unit === 0 ? n : unit === 1 ? n * 7 : unit === 2 ? n * 30 : n * 365;
    return days || null;
  }
  return null;
}

export function ProProvider({ children }: { children: ReactNode }) {
  const [pro, setPro] = useState<ProState>(initialState);
  const [offers, setOffers] = useState<Partial<Record<ProPlan, PlanOffer>>>({});
  const [offersState, setOffersState] = useState<ProApi['offersState']>('idle');
  const [paywall, setPaywall] = useState<ProApi['paywall']>({ open: false, feature: null });
  const proRef = useRef(pro);
  proRef.current = pro;

  const apply = useCallback((s: ProState) => {
    setPro(s);
    writeCache(s);
  }, []);

  // Debug builds (CI emulator tests, development) honour a dev unlock; release builds never do.
  const devUnlock = useRef<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    if (devUnlock.current === null) {
      const cached = readCache();
      const st = await Planner.status().catch(() => null);
      devUnlock.current = !!(st && (st as { debug?: boolean }).debug && cached?.active && cached.source === 'dev');
    }
    if (devUnlock.current) {
      setPro({ ...(readCache() as ProState), source: 'dev' });
      return;
    }
    try {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
      apply(evaluatePurchases(purchases as Transaction[], Date.now()));
    } catch {
      // Store unreachable: keep the cached state within its grace window.
      setPro(fromCache(readCache(), Date.now()));
    }
  }, [apply]);

  useEffect(() => {
    if (!isNative) return;
    void refresh();
    const handles: { remove: () => void }[] = [];
    void NativePurchases.addListener('transactionUpdated', () => void refresh()).then((h) => handles.push(h));
    void CapApp.addListener('resume', () => void refresh()).then((h) => handles.push(h));
    return () => handles.forEach((h) => h.remove());
  }, [refresh]);

  const loadOffers = useCallback(() => {
    if (!isNative || offersState === 'loading' || offersState === 'ready') return;
    setOffersState('loading');
    NativePurchases.getProducts({ productIdentifiers: [PRO_PRODUCT_ID], productType: PURCHASE_TYPE.SUBS })
      .then(({ products }) => {
        const next: Partial<Record<ProPlan, PlanOffer>> = {};
        for (const p of products) {
          const plan = (Object.keys(PRO_PLANS) as ProPlan[]).find((k) => PRO_PLANS[k] === p.planIdentifier);
          if (!plan) continue;
          next[plan] = { plan, priceString: p.priceString, price: p.price, currency: p.currencyCode, trialDays: trialDaysOf(p), offerToken: p.offerToken };
        }
        setOffers(next);
        setOffersState(Object.keys(next).length ? 'ready' : 'error');
      })
      .catch(() => setOffersState('error'));
  }, [offersState]);

  const purchase = useCallback(
    async (plan: ProPlan): Promise<PurchaseResult> => {
      if (!isNative) return 'error';
      try {
        const offer = offers[plan];
        await NativePurchases.purchaseProduct({
          productIdentifier: PRO_PRODUCT_ID,
          planIdentifier: PRO_PLANS[plan],
          offerToken: offer?.offerToken,
          productType: PURCHASE_TYPE.SUBS,
          quantity: 1,
        });
        await refresh();
        if (proRef.current.active) return 'ok';
        return 'pending';
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        return /cancel/.test(msg) ? 'cancelled' : 'error';
      }
    },
    [offers, refresh],
  );

  const restore = useCallback(async () => {
    if (!isNative) return proRef.current.active;
    try {
      await NativePurchases.restorePurchases();
    } catch {
      /* fall through to a fresh query */
    }
    await refresh();
    return proRef.current.active;
  }, [refresh]);

  const manage = useCallback(() => {
    if (isNative) void NativePurchases.manageSubscriptions().catch(() => undefined);
    else window.open(PLAY_URL, '_blank', 'noopener');
  }, []);

  const openPaywall = useCallback((feature?: ProFeature) => setPaywall({ open: true, feature: feature ?? null }), []);
  const closePaywall = useCallback(() => setPaywall((p) => ({ ...p, open: false })), []);
  const require = useCallback(
    (feature: ProFeature) => {
      if (proRef.current.active) return true;
      setPaywall({ open: true, feature });
      return false;
    },
    [],
  );

  const api = useMemo<ProApi>(
    () => ({ pro, isPro: pro.active, canBuy: isNative, offers, offersState, paywall, openPaywall, closePaywall, require, purchase, restore, manage, loadOffers }),
    [pro, offers, offersState, paywall, openPaywall, closePaywall, require, purchase, restore, manage, loadOffers],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export { NO_PRO };
