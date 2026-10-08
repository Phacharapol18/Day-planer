import { describe, it, expect } from 'vitest';
import css from './tokens.css?raw';

// Guards the text tokens against contrast regressions (WCAG AA: 4.5:1 for body-size text).

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const light = block(':root {');
const dark = { ...light, ...block(":root[data-theme='dark'] {") };

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme text tokens', (_, t) => {
  it.each(['ink', 'ink-2', 'muted', 'accent-strong', 'danger'])('--%s is AA on every surface', (fg) => {
    for (const bg of ['bg', 'surface', 'surface-2']) {
      expect(ratio(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it.each([
  ['light', light],
  ['dark', dark],
])('%s: now-pill text (accent-ink) on its fill (accent-strong) is AA', (_, t) => {
  expect(ratio(t['accent-ink'], t['accent-strong'])).toBeGreaterThanOrEqual(4.5);
});
