/** Keyboard labels that match the user's platform: ⌘ on Apple devices, Ctrl elsewhere. */
export const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function combo(key: string, shift = false): string {
  return isApple ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}
