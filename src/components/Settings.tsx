import { useRef, useState } from 'react';
import { usePlanner } from '../state';
import { emptyData, sanitizeData } from '../lib/storage';
import { toICS } from '../lib/ics';
import { inputToTime, timeToInput, todayKey } from '../lib/time';
import type { Theme } from '../lib/model';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { PhoneSettings } from './PhoneSettings';

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'settings'} onClose={() => setPanel(null)} label="Settings" className="settings">
      <SettingsBody />
    </Dialog>
  );
}

function SettingsBody() {
  const { data, dispatch, setPanel, toast, undo } = usePlanner();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const setWindow = (key: 'dayStart' | 'dayEnd', value: string) => {
    const v = inputToTime(value);
    if (v === null) return;
    const next = { dayStart: s.dayStart, dayEnd: s.dayEnd, [key]: key === 'dayEnd' && v === 0 ? 1440 : v };
    if (next.dayStart >= next.dayEnd) {
      toast('Your day needs to end after it starts.', { tone: 'error' });
      return;
    }
    dispatch({ type: 'settings', patch: next });
  };


  return (
    <div className="settings-body">
      <div className="dialog-head">
        <h2>Settings</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>

      <section className="settings-group">
        <h3 className="section-label">Appearance</h3>
        <div className="setting">
          <span>Theme</span>
          <div className="seg seg--small" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <button type="button" key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? 'is-on' : ''} onClick={() => dispatch({ type: 'settings', patch: { theme: t } })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span>Clock</span>
          <div className="seg seg--small" role="radiogroup" aria-label="Clock format">
            <button type="button" role="radio" aria-checked={!s.use24h} className={!s.use24h ? 'is-on' : ''} onClick={() => dispatch({ type: 'settings', patch: { use24h: false } })}>
              1:30pm
            </button>
            <button type="button" role="radio" aria-checked={s.use24h} className={s.use24h ? 'is-on' : ''} onClick={() => dispatch({ type: 'settings', patch: { use24h: true } })}>
              13:30
            </button>
          </div>
        </div>
        <label className="setting">
          <span>Timeline zoom</span>
          <input type="range" min={40} max={160} step={8} value={s.hourHeight} onChange={(e) => dispatch({ type: 'settings', patch: { hourHeight: Number(e.target.value) } })} aria-label="Timeline zoom" />
        </label>
      </section>

      <section className="settings-group">
        <h3 className="section-label">Your day</h3>
        <p className="settings-hint">Free time and Auto-plan only use this window.</p>
        <div className="setting">
          <span>Working hours</span>
          <span className="time-range">
            <input type="time" value={timeToInput(s.dayStart)} onChange={(e) => setWindow('dayStart', e.target.value)} aria-label="Day starts" />
            <span aria-hidden="true">–</span>
            <input type="time" value={timeToInput(s.dayEnd % 1440)} onChange={(e) => setWindow('dayEnd', e.target.value)} aria-label="Day ends" />
          </span>
        </div>
      </section>

      <PhoneSettings />

      <section className="settings-group">
        <h3 className="section-label">Your data</h3>
        <p className="settings-hint">Everything stays on this device. Back it up or move it with a file.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => download(`day-planner-${todayKey()}.json`, 'application/json', JSON.stringify(data, null, 2))}>
            <Icon name="download" size={15} /> Back up (.json)
          </button>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => download(`day-planner-${todayKey()}.ics`, 'text/calendar', toICS(data.tasks))}>
            <Icon name="calendar" size={15} /> Export to calendar (.ics)
          </button>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} /> Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const parsed = sanitizeData(JSON.parse(await file.text()));
                if (!parsed) throw new Error('bad');
                dispatch({ type: 'replace', data: parsed });
                toast(`Restored ${parsed.tasks.length} tasks`, { action: { label: 'Undo', run: undo } });
              } catch {
                toast('That file isn’t a Day Planner backup.', { tone: 'error' });
              }
            }}
          />
        </div>
        <div className="settings-danger">
          <button
            type="button"
            className={`btn btn--sm ${confirmClear ? 'btn--danger' : 'btn--danger-quiet'}`}
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 4000);
                return;
              }
              dispatch({ type: 'replace', data: { ...emptyData(), settings: s } });
              setConfirmClear(false);
              toast('All tasks cleared', { action: { label: 'Undo', run: undo } });
            }}
          >
            <Icon name="trash" size={15} /> {confirmClear ? 'Click again to erase everything' : 'Erase all tasks'}
          </button>
        </div>
      </section>
    </div>
  );
}
