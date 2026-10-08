import { usePro } from './ProProvider';
import { Icon } from '../components/Icon';
import { usePlanner } from '../state';

/** Pro status in Settings: upgrade for free users; plan, renewal and management for subscribers. */
export function ProSettings() {
  const { pro, isPro, openPaywall, manage, restore, canBuy } = usePro();
  const { toast } = usePlanner();
  const until = pro.expiresAt ? new Date(pro.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  if (!isPro) {
    return (
      <section className="settings-group">
        <button type="button" className="pro-card" onClick={() => openPaywall()} data-testid="settings-go-pro">
          <span className="pro-card-mark" aria-hidden="true">
            <Icon name="sparkle" size={18} />
          </span>
          <span className="pro-card-text">
            <strong>Day Planner Pro</strong>
            <small>Auto-plan, your calendars, widgets, the live Now card and unlimited routines.</small>
          </span>
          <Icon name="right" size={18} />
        </button>
        {canBuy && (
          <button
            type="button"
            className="link settings-restore"
            onClick={async () => toast((await restore()) ? 'Pro restored.' : 'No active Pro subscription found.', {})}
          >
            Restore purchases
          </button>
        )}
      </section>
    );
  }

  const status = pro.source === 'dev'
    ? 'Developer unlock'
    : pro.inTrial
      ? `Free trial${until ? ` · ends ${until}` : ''}`
      : pro.willCancel
        ? `Ends ${until ?? 'at the end of this period'}`
        : `${pro.plan === 'yearly' ? 'Yearly' : pro.plan === 'monthly' ? 'Monthly' : 'Active'}${until ? ` · renews ${until}` : ''}`;

  return (
    <section className="settings-group">
      <div className="pro-card pro-card--active">
        <span className="pro-card-mark" aria-hidden="true">
          <Icon name="check" size={18} />
        </span>
        <span className="pro-card-text">
          <strong>Pro is active</strong>
          <small>{status}{pro.source === 'cache' ? ' · offline' : ''}</small>
        </span>
        {canBuy && pro.source !== 'dev' && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={manage}>
            Manage
          </button>
        )}
      </div>
    </section>
  );
}
