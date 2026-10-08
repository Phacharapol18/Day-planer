import { useMemo, useState } from 'react';
import { usePlanner } from '../state';
import { usePro } from '../pro/ProProvider';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { CATEGORIES, type CategoryId } from '../lib/model';
import { CHART_ORDER, hourTicks, weekStats, type DayStats } from '../lib/insights';
import { addDays, DAY_NAMES_SHORT, formatDuration, fromKey, monthDay, weekday } from '../lib/time';

const catName = (c: CategoryId) => CATEGORIES.find((x) => x.id === c)!.name;
const MOOD = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great'];

export function Insights() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'insights'} onClose={() => setPanel(null)} label="Insights" className="insights">
      <InsightsBody />
    </Dialog>
  );
}

function InsightsBody() {
  const { data, selected, today, now, setPanel } = usePlanner();
  const { isPro, openPaywall } = usePro();
  const [weekStart, setWeekStart] = useState(() => addDays(selected, -((weekday(selected) + 6) % 7)));
  const [asTable, setAsTable] = useState(false);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const stats = useMemo(() => weekStats(data, weekStart, today, nowMin), [data, weekStart, today, nowMin]);
  const thisWeek = addDays(today, -((weekday(today) + 6) % 7)) === weekStart;
  const range = `${monthDay(weekStart)} – ${monthDay(addDays(weekStart, 6))}`;
  const ranked = CHART_ORDER.filter((c) => stats.totals[c] > 0).sort((a, b) => stats.totals[b] - stats.totals[a]);
  const maxCat = ranked.length ? stats.totals[ranked[0]] : 0;

  return (
    <div className="ins" data-testid="insights">
      <div className="dialog-head">
        <h2>Insights</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="ins-week">
        <button type="button" className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <Icon name="left" />
        </button>
        <span className="ins-range">{thisWeek ? 'This week' : range}</span>
        <button type="button" className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week" disabled={thisWeek}>
          <Icon name="right" />
        </button>
      </div>

      <div className="ins-tiles">
        <Tile label="Time planned" value={formatDuration(stats.planned)} sub={`${stats.count} block${stats.count === 1 ? '' : 's'}`} />
        <Tile label="Completed" value={stats.completion === null ? '—' : `${Math.round(stats.completion * 100)}%`} sub={stats.due ? `${stats.done} of ${stats.due}${stats.due < stats.count ? ' so far' : ''}` : 'Nothing due yet'} />
        <Tile label="Planning streak" value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} sub={`Best ${stats.bestStreak}`} />
        <Tile label="Highlights hit" value={stats.highlightsSet ? `${stats.highlightsHit}/${stats.highlightsSet}` : '—'} sub={highlightSub(stats.highlightsSet, stats.highlightsHit, stats.highlightPending)} />
      </div>

      <div className={`ins-locked-wrap${isPro ? '' : ' is-locked'}`}>
        <section className="ins-card" aria-label="Where your time went">
          <div className="ins-card-head">
            <h3>Where your time went</h3>
            <button type="button" className="link ins-toggle" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? 'Show chart' : 'Show as table'}
            </button>
          </div>
          {stats.planned === 0 ? (
            <p className="ins-empty">Nothing was planned {thisWeek ? 'this week' : 'that week'} yet.</p>
          ) : asTable ? (
            <WeekTable days={stats.days} />
          ) : (
            <>
              <ul className="ins-legend" aria-label="Categories">
                {CHART_ORDER.filter((c) => stats.totals[c] > 0).map((c) => (
                  <li key={c} data-chart={c}>
                    <span className="ins-swatch" aria-hidden="true" />
                    {catName(c)}
                  </li>
                ))}
              </ul>
              <WeekColumns days={stats.days} today={today} />
            </>
          )}
        </section>

        {ranked.length > 0 && (
          <section className="ins-card" aria-label="By category">
            <h3>By category</h3>
            <ul className="ins-bars">
              {ranked.map((c) => (
                <li key={c} data-chart={c}>
                  <span className="ins-bar-label">{catName(c)}</span>
                  <span className="ins-bar-track">
                    <span className="ins-bar" style={{ width: `${(stats.totals[c] / maxCat) * 100}%` }} />
                    <span className="ins-bar-value">{formatDuration(stats.totals[c])}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isPro && (
          <div className="ins-lock">
            <div className="ins-lock-card">
              <p>
                <strong>See where your time really goes.</strong> Weekly breakdowns by category, day by day.
              </p>
              <button type="button" className="btn btn--primary" onClick={() => openPaywall('insights')} data-testid="insights-unlock">
                <Icon name="sparkle" size={16} /> Unlock with Pro
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="ins-tile">
      <span className="ins-tile-label">{label}</span>
      <span className="ins-tile-value">{value}</span>
      <span className="ins-tile-sub">{sub}</span>
    </div>
  );
}

function highlightSub(set: number, hit: number, pending: boolean): string {
  const today = pending ? 'today’s still open' : '';
  if (!set) return today ? 'Today’s still open' : 'Pick one each morning';
  const missed = set - hit;
  return [missed ? `${missed} missed` : 'All done', today].filter(Boolean).join(' · ');
}

function WeekColumns({ days, today }: { days: DayStats[]; today: string }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  const ticks = hourTicks(max);
  const top = ticks[ticks.length - 1] * 60;
  return (
    <div className="ins-chart" role="img" aria-label="Planned hours per day, stacked by category. Use Show as table for exact values.">
      <div className="ins-plot">
        {ticks.map((t) => (
          <div key={t} className="ins-grid" style={{ bottom: `${((t * 60) / top) * 100}%` }}>
            <span>{t}h</span>
          </div>
        ))}
        <div className="ins-cols">
          {days.map((d) => {
            const segs = CHART_ORDER.filter((c) => d.byCat[c] > 0);
            return (
              <div key={d.date} className={`ins-col-slot${d.date > today ? ' is-future' : ''}`}>
                <button type="button" className="ins-col" style={{ height: `${(d.total / top) * 100}%` }} aria-label={`${DAY_NAMES_SHORT[weekday(d.date)]}: ${formatDuration(d.total)} planned, ${d.done} of ${d.count} done`}>
                  {segs.map((c) => (
                    <span key={c} className="ins-seg" data-chart={c} style={{ flexGrow: d.byCat[c] }} />
                  ))}
                  {d.total > 0 && (
                    <span className="ins-tip" role="tooltip">
                      <strong>
                        {DAY_NAMES_SHORT[weekday(d.date)]} {fromKey(d.date).getDate()} · {formatDuration(d.total)}
                      </strong>
                      {[...segs].reverse().map((c) => (
                        <span key={c} className="ins-tip-row" data-chart={c}>
                          <span className="ins-swatch" aria-hidden="true" /> {catName(c)} <em>{formatDuration(d.byCat[c])}</em>
                        </span>
                      ))}
                      <span className="ins-tip-row ins-tip-foot">
                        {d.done}/{d.count} done{d.mood ? ` · ${MOOD[d.mood]}` : ''}
                      </span>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ins-xaxis">
        {days.map((d) => (
          <span key={d.date} className={d.date === today ? 'is-today' : ''}>
            {DAY_NAMES_SHORT[weekday(d.date)]}
            {d.ritual && <i className="ins-ritual-dot" title="Planned or closed this day" />}
          </span>
        ))}
      </div>
      {(days.some((d) => d.ritual) || days.some((d) => d.date > today && d.total > 0)) && (
        <p className="ins-note">
          {days.some((d) => d.ritual) && (
            <>
              <span className="ins-legend-ritual" aria-hidden="true" />
              Planned or closed the day
            </>
          )}
          {days.some((d) => d.date > today && d.total > 0) && (
            <>
              <span className="ins-legend-ahead" aria-hidden="true" />
              Still ahead
            </>
          )}
        </p>
      )}
    </div>
  );
}

function WeekTable({ days }: { days: DayStats[] }) {
  return (
    <div className="ins-table-wrap">
      <table className="ins-table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            {CHART_ORDER.map((c) => (
              <th key={c} scope="col">
                {catName(c)}
              </th>
            ))}
            <th scope="col">Total</th>
            <th scope="col">Done</th>
            <th scope="col">Mood</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">
                {DAY_NAMES_SHORT[weekday(d.date)]} {fromKey(d.date).getDate()}
              </th>
              {CHART_ORDER.map((c) => (
                <td key={c}>{d.byCat[c] ? formatDuration(d.byCat[c]) : '—'}</td>
              ))}
              <td>{d.total ? formatDuration(d.total) : '—'}</td>
              <td>{d.count ? `${d.done}/${d.count}` : '—'}</td>
              <td>{d.mood ? MOOD[d.mood] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
