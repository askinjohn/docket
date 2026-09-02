/** Browser prefs. New keys are `docket.*`; `local-mail.*` is still read. */

export function readPref(key: string): string | null {
  try {
    const next = localStorage.getItem(`docket.${key}`);
    if (next !== null) return next;
    return localStorage.getItem(`local-mail.${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`docket.${key}`, value);
  } catch {
    /* quota / private mode */
  }
}
