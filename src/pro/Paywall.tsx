import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { Icon, type IconName } from '../components/Icon';
import { usePlanner } from '../state';
import { usePro, PLAY_URL, SITE_URL } from './ProProvider';
import { PRO_FEATURES, type ProFeature, type ProPlan } from './entitlement';

const HEADLINES: Record<ProFeature | 'default', string> = {
  autoplan: 'Let your day plan itself.',
  calendars: 'Meetings and plans, finally in one place.',
  widgets: 'Your day, right on your home screen.',
  nowcard: 'Always know what’s now — and what’s next.',
  repeats: 'Build routines that run themselves.',
  insights: 'See where your time really goes.',
  themes: 'Make it yours.',
  default: 'Plan your day like you mean it.',
};

const FEATURE_ICON: Record<ProFeature, IconName> = {
  autoplan: 'sparkle',
  calendars: 'calendar',
  widgets: 'target',
  nowcard: 'bell',
  repeats: 'repeat',
  insights: 'flag',
  themes: 'sun',
};

export function Paywall() {
  const { paywall, closePaywall } = usePro();
  return (
    <Dialog open={paywall.open} onClose={closePaywall} label="Day Planner Pro" className="paywall">
      <PaywallBody />
    </Dialog>
  );
}

function PaywallBody() {
  const { paywall, closePaywall, canBuy, offers, offersState, loadOffers, purchase, restore, isPro } = usePro();
  const { toast } = usePlanner();
  const [plan, setPlan] = useState<ProPlan>('yearly');
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);
  const feature = paywall.feature;

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  useEffect(() => {
    if (isPro && paywall.open) closePaywall();
  }, [isPro, paywall.open, closePaywall]);

  const features = feature ? [...PRO_FEATURES.filter((f) => f.id === feature), ...PRO_FEATURES.filter((f) => f.id !== feature)] : PRO_FEATURES;
  const monthly = offers.monthly;
  const yearly = offers.yearly;
  const savings = monthly && yearly && monthly.price > 0 ? Math.round((1 - yearly.price / (monthly.price * 12)) * 100) : null;
  const selected = offers[plan];

  const buy = async () => {
    setBusy('buy');
    const r = await purchase(plan);
    setBusy(null);
    if (r === 'ok') toast('Welcome to Pro. Everything’s unlocked.');
    else if (r === 'pending') toast('Purchase pending — Pro unlocks as soon as Google Play confirms it.');
    else if (r === 'error') toast('Google Play couldn’t complete the purchase. You weren’t charged.', { tone: 'error' });
  };

  const doRestore = async () => {
    setBusy('restore');
    const ok = await restore();
    setBusy(null);
    toast(ok ? 'Pro restored.' : 'No active Pro subscription found on this Google account.', ok ? {} : { tone: 'error' });
  };

  const cta = selected?.trialDays ? `Start ${selected.trialDays}-day free trial` : selected ? `Continue · ${selected.priceString}/${plan === 'yearly' ? 'year' : 'month'}` : 'Continue';

  return (
    <div className="pw" data-testid="paywall">
      <button type="button" className="icon-btn pw-close" onClick={closePaywall} aria-label="Close">
        <Icon name="x" />
      </button>
      <p className="pw-kicker">Day Planner Pro</p>
      <h2 className="pw-title">{HEADLINES[feature ?? 'default']}</h2>

      <ul className="pw-features">
        {features.map((f) => (
          <li key={f.id} className={f.id === feature ? 'is-focus' : ''}>
            <span className="pw-ficon" aria-hidden="true">
              <Icon name={FEATURE_ICON[f.id]} size={16} />
            </span>
            <span>
              <strong>{f.title}</strong>
              <small>{f.detail}</small>
            </span>
          </li>
        ))}
      </ul>

      {canBuy ? (
        <>
          {offersState === 'error' ? (
            <div className="pw-error" role="alert">
              Couldn’t reach Google Play. Check your connection and try again.
              <button type="button" className="btn btn--quiet btn--sm" onClick={loadOffers}>
                Retry
              </button>
            </div>
          ) : (
            <div className="pw-plans" role="radiogroup" aria-label="Choose a plan">
              {(['yearly', 'monthly'] as ProPlan[]).map((p) => {
                const o = offers[p];
                const on = plan === p;
                return (
                  <button type="button" key={p} role="radio" aria-checked={on} className={`pw-plan${on ? ' is-on' : ''}`} onClick={() => setPlan(p)} disabled={!o}>
                    <span className="pw-plan-name">
                      {p === 'yearly' ? 'Yearly' : 'Monthly'}
                      {p === 'yearly' && savings !== null && savings > 0 && <span className="pw-badge">Save {savings}%</span>}
                    </span>
                    <span className="pw-plan-price">{o ? o.priceString : <span className="pw-skel" />}</span>
                    <span className="pw-plan-sub">
                      {o ? (p === 'yearly' ? `${o.trialDays ? `${o.trialDays} days free, then ` : ''}per year` : 'per month') : ' '}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" className="btn btn--primary btn--lg pw-cta" onClick={() => void buy()} disabled={!selected || busy !== null} data-testid="paywall-buy">
            {busy === 'buy' ? 'Opening Google Play…' : cta}
          </button>
          <p className="pw-fine">
            {selected?.trialDays ? `You won’t be charged until your ${selected.trialDays}-day trial ends. ` : ''}
            Renews automatically. Cancel anytime in Google Play at least 24 hours before renewal.{' '}
            <button type="button" className="link" onClick={() => void doRestore()} disabled={busy !== null}>
              {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
            </button>
          </p>
        </>
      ) : (
        <div className="pw-web">
          <p>Pro is available in the Day Planner app for Android: widgets, a live Now card, and your phone’s calendars, plus everything above.</p>
          <a className="btn btn--primary btn--lg pw-cta" href={PLAY_URL} target="_blank" rel="noopener noreferrer">
            Get it on Google Play
          </a>
        </div>
      )}
      <p className="pw-legal">
        <a href={`${SITE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">Privacy</a> · <a href={`${SITE_URL}terms.html`} target="_blank" rel="noopener noreferrer">Terms</a>
      </p>
    </div>
  );
}
