import { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { usePlanner } from '../state';
import { Planner, isNative, type DeviceCalendar, type NativeStatus } from '../native/planner';
import { colorHex } from '../lib/external';
import { Icon } from './Icon';
import { usePro } from '../pro/ProProvider';

const LEADS = [0, 5, 10, 15, 30];

/** Reminders, the Now card, exact timing and phone calendars. Adapts to web vs. Android. */
export function PhoneSettings() {
  const { data, dispatch, toast } = usePlanner();
  const { isPro, require } = usePro();
  const s = data.settings;
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [calendars, setCalendars] = useState<DeviceCalendar[] | null>(null);
  const [webPerm, setWebPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      const st = await Planner.status();
      setStatus(st);
      if (st.calendar) setCalendars((await Planner.listCalendars()).calendars);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!isNative) return;
    // Coming back from Android settings screens.
    let h: { remove: () => void } | undefined;
    void CapApp.addListener('resume', () => void refresh()).then((x) => (h = x));
    return () => h?.remove();
  }, [refresh]);

  const setNotify = async (on: boolean) => {
    if (!on) return dispatch({ type: 'settings', patch: { notify: false } });
    if (isNative) {
      const { granted } = await Planner.requestNotifications();
      void refresh();
      if (granted) dispatch({ type: 'settings', patch: { notify: true } });
      else toast('Notifications are off for Day Planner. Turn them on in Android settings.', { tone: 'error', action: { label: 'Open', run: () => void Planner.openNotificationSettings() } });
      return;
    }
    if (typeof Notification === 'undefined') return;
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setWebPerm(perm);
    if (perm === 'granted') dispatch({ type: 'settings', patch: { notify: true } });
    else toast('Notifications are blocked for this site in your browser settings.', { tone: 'error' });
  };

  const setNowCard = async (on: boolean) => {
    if (on && !require('nowcard')) return;
    if (on && isNative) {
      const { granted } = await Planner.requestNotifications();
      if (!granted) {
        toast('Notifications are off for Day Planner.', { tone: 'error', action: { label: 'Open', run: () => void Planner.openNotificationSettings() } });
        return;
      }
    }
    dispatch({ type: 'settings', patch: { nowCard: on } });
  };

  const connectCalendars = async () => {
    if (!require('calendars')) return;
    const { granted } = await Planner.requestCalendar();
    if (!granted) {
      toast('Calendar access was not allowed.', { tone: 'error' });
      return;
    }
    const list = (await Planner.listCalendars()).calendars;
    setCalendars(list);
    void refresh();
    // Sensible default: everything the user already shows in their calendar app.
    if (!s.calendarIds.length) dispatch({ type: 'settings', patch: { calendarIds: list.filter((c) => c.visible).map((c) => c.id) } });
  };

  const toggleCalendar = (id: string, on: boolean) => {
    const next = on ? [...new Set([...s.calendarIds, id])] : s.calendarIds.filter((x) => x !== id);
    dispatch({ type: 'settings', patch: { calendarIds: next } });
  };

  const notifBlocked = isNative ? status !== null && !status.notifications && s.notify : webPerm === 'denied';

  return (
    <section className="settings-group">
      <h3 className="section-label">Reminders {isNative && '& phone'}</h3>
      <label className="setting">
        <span>
          Remind me when a block starts
          {notifBlocked && <small className="settings-warn">Notifications are blocked</small>}
          {!isNative && webPerm === 'unsupported' && <small className="settings-warn">Not supported in this browser</small>}
        </span>
        <input type="checkbox" className="switch" checked={s.notify} disabled={!isNative && webPerm === 'unsupported'} onChange={(e) => void setNotify(e.target.checked)} data-testid="setting-notify" />
      </label>
      {s.notify && (
        <div className="setting">
          <span>Heads-up before</span>
          <div className="seg seg--small" role="radiogroup" aria-label="Heads-up before a block">
            {LEADS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={s.leadMinutes === m} className={s.leadMinutes === m ? 'is-on' : ''} onClick={() => dispatch({ type: 'settings', patch: { leadMinutes: m } })}>
                {m === 0 ? 'Off' : `${m}m`}
              </button>
            ))}
          </div>
        </div>
      )}
      {isNative && (
        <>
          <label className="setting">
            <span>
              <span className="setting-title">
                Now card in notifications {!isPro && <span className="pro-chip">Pro</span>}
              </span>
              <small className="settings-sub">Live countdown with Done and +15 min</small>
            </span>
            <input type="checkbox" className="switch" checked={s.nowCard && isPro} onChange={(e) => void setNowCard(e.target.checked)} />
          </label>
          {status && !status.exactAlarms && s.notify && (
            <div className="setting setting--notice">
              <span>
                Exact timing is off
                <small className="settings-sub">Android may deliver reminders a few minutes late.</small>
              </span>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => void Planner.openExactAlarmSettings()}>
                Allow
              </button>
            </div>
          )}
          {notifBlocked && (
            <div className="setting setting--notice">
              <span>Notifications are turned off for Day Planner</span>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => void Planner.openNotificationSettings()}>
                Open settings
              </button>
            </div>
          )}

          <h3 className="section-label section-label--spaced">Phone calendars {!isPro && <span className="pro-chip">Pro</span>}</h3>
          <p className="settings-hint">See meetings from Google, Outlook or Samsung calendars on your timeline. Free time and Auto-plan work around them. Read-only; nothing leaves your phone.</p>
          {isPro && status?.calendar && calendars ? (
            calendars.length === 0 ? (
              <p className="settings-hint">No calendars found on this phone.</p>
            ) : (
              <ul className="cal-list">
                {calendars.map((c) => (
                  <li key={c.id}>
                    <label className="cal-row">
                      <input type="checkbox" checked={s.calendarIds.includes(c.id)} onChange={(e) => toggleCalendar(c.id, e.target.checked)} />
                      <span className="cal-dot" style={{ background: colorHex(c.color) ?? undefined }} aria-hidden="true" />
                      <span className="cal-name">
                        {c.name}
                        <small>{c.account}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void connectCalendars()}>
              <Icon name="calendar" size={15} /> Show my phone’s calendars
            </button>
          )}

          <p className="settings-tip">
            <Icon name="sparkle" size={14} /> Add the <strong>Now &amp; next</strong> and <strong>Today</strong> widgets: long-press your home screen → Widgets → Day Planner. Swipe down twice and edit your tiles to add <strong>Plan something</strong>.
          </p>
        </>
      )}
    </section>
  );
}
