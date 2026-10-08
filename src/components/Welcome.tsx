import { useState } from 'react';
import { usePlanner } from '../state';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { exampleDay } from '../lib/example';
import { minutesNow } from '../lib/time';
import { Planner, isNative } from '../native/planner';

/** First run only: three short screens, then an example day or a blank page. */
export function Welcome() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'welcome'} onClose={() => setPanel(null)} label="Welcome to Day Planner" className="welcome">
      <WelcomeBody />
    </Dialog>
  );
}

function MiniTimeline() {
  return (
    <div className="wl-art" aria-hidden="true">
      <div className="wl-row" data-cat="health" style={{ ['--w' as string]: '42%' }}>
        <span>7:30</span>
        <i className="is-done" />
      </div>
      <div className="wl-row" data-cat="work" style={{ ['--w' as string]: '88%' }}>
        <span>9:00</span>
        <i />
      </div>
      <div className="wl-now">
        <span>now</span>
      </div>
      <div className="wl-row wl-free">
        <span>11:00</span>
        <i />
      </div>
      <div className="wl-row" data-cat="meeting" style={{ ['--w' as string]: '56%' }}>
        <span>13:00</span>
        <i />
      </div>
    </div>
  );
}

function WelcomeBody() {
  const { data, today, now, dispatch, setPanel, toast, setSelected } = usePlanner();
  const [step, setStep] = useState(0);
  const last = 2;

  const finish = async (example: boolean) => {
    if (example) {
      const { tasks, highlightId } = exampleDay(today, minutesNow(now));
      dispatch({ type: 'addMany', tasks });
      const day = tasks[0].date as string;
      dispatch({ type: 'journal', date: day, patch: { highlight: highlightId } });
      setSelected(day);
    }
    setPanel(null);
    if (isNative) {
      // Ask at the moment the value is obvious, not on launch.
      const { granted } = await Planner.requestNotifications().catch(() => ({ granted: false }));
      if (granted && !data.settings.notify) dispatch({ type: 'settings', patch: { notify: true } });
    }
    toast(example ? 'Here’s an example day. Change anything — it’s yours.' : 'A blank page. Tap + to plan something.');
  };

  return (
    <div className="wl" data-testid="welcome">
      {step === 0 && (
        <>
          <MiniTimeline />
          <p className="wl-kicker">Day Planner</p>
          <h2 className="wl-title">Your day, as a timeline.</h2>
          <p className="wl-text">See what’s now, what’s next, and how much free time you really have. Drag things around until the day fits.</p>
        </>
      )}
      {step === 1 && (
        <>
          <div className="wl-art wl-art--type" aria-hidden="true">
            <span className="wl-typed">Gym 6pm 45m #health</span>
            <span className="wl-chip">Today · 6pm–6:45pm</span>
          </div>
          <p className="wl-kicker">Capture</p>
          <h2 className="wl-title">Say it how you’d say it.</h2>
          <p className="wl-text">
            “Dentist fri 3pm”, “Taxes 2h !!”, “Standup 9:30 every weekday”. Type, speak, or share from any app — anything without a time waits in your inbox.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <div className="wl-art wl-art--card" aria-hidden="true">
            <span className="wl-card-kicker">NOW</span>
            <strong>Deep work</strong>
            <span className="wl-card-time">34:12 left · Then Lunch at 12:30</span>
            <span className="wl-card-bar">
              <i />
            </span>
          </div>
          <p className="wl-kicker">Stay on track</p>
          <h2 className="wl-title">Gentle nudges, not nagging.</h2>
          <p className="wl-text">
            {isNative
              ? 'A heads-up before each block, a live Now card with Done and +15 min, and widgets for your home screen.'
              : 'Reminders when a block starts, Focus mode for one thing at a time, and a planning streak that keeps you coming back.'}
          </p>
        </>
      )}

      <div className="wl-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i === step ? 'is-on' : ''} />
        ))}
      </div>

      {step < last ? (
        <div className="wl-foot">
          <button type="button" className="btn btn--quiet" onClick={() => void finish(false)}>
            Skip
          </button>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setStep(step + 1)} data-testid="welcome-next" autoFocus>
            Next <Icon name="right" size={18} />
          </button>
        </div>
      ) : (
        <div className="wl-foot wl-foot--final">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => void finish(true)} data-testid="welcome-example" autoFocus>
            Show me an example day
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => void finish(false)} data-testid="welcome-blank">
            Start with a blank page
          </button>
        </div>
      )}
    </div>
  );
}
