import { usePlanner } from '../state';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

const GROUPS: [string, [string, string][]][] = [
  [
    'Anywhere',
    [
      ['⌘K  /  N', 'Quick add'],
      ['T', 'Jump to today'],
      ['←  →', 'Previous / next day'],
      ['I', 'Toggle inbox'],
      ['F', 'Focus mode'],
      ['⌘Z  /  ⇧⌘Z', 'Undo / redo'],
      ['?', 'This list'],
    ],
  ],
  [
    'On a focused block',
    [
      ['↵', 'Edit'],
      ['Space', 'Mark done'],
      ['↑  ↓', 'Move 15 min'],
      ['⇧↑  ⇧↓', 'Shorten / lengthen'],
      ['⌫', 'Delete'],
    ],
  ],
  [
    'Mouse & touch',
    [
      ['Drag on timeline', 'Draw a new block'],
      ['Drag block / edge', 'Move / resize'],
      ['Drag to inbox', 'Unschedule'],
      ['Long-press', 'Pick up on touch'],
    ],
  ],
];

export function Help() {
  const { panel, setPanel } = usePlanner();
  return (
    <Dialog open={panel === 'help'} onClose={() => setPanel(null)} label="Keyboard shortcuts" className="help">
      <div className="dialog-head">
        <h2>Shortcuts</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="help-grid">
        {GROUPS.map(([title, rows]) => (
          <section key={title}>
            <h3 className="section-label">{title}</h3>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k} className="help-row">
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
