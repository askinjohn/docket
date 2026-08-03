export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemeDensity = 'compact' | 'comfortable';
/** Where reply / AI insight panels dock relative to the thread. */
export type ReplyDock = 'bottom' | 'right';

export interface ThemePrefs {
  mode: ThemeMode;
  accent: string;
  density: ThemeDensity;
  /** Block remote http(s) images in HTML mail (privacy). Default true. */
  blockRemoteImages: boolean;
  /** Reply + AI insight dock position. */
  replyDock: ReplyDock;
}

export const ACCENT_PRESETS = [
  { id: 'violet', label: 'Violet', value: '#7c6af7' },
  { id: 'teal', label: 'Teal', value: '#14b8a6' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'rose', label: 'Rose', value: '#f43f5e' },
  { id: 'amber', label: 'Amber', value: '#f59e0b' },
  { id: 'emerald', label: 'Emerald', value: '#10b981' },
] as const;

const STORAGE_KEY = 'local-mail.theme';

export const DEFAULT_THEME: ThemePrefs = {
  mode: 'dark',
  accent: '#7c6af7',
  density: 'comfortable',
  blockRemoteImages: true,
  replyDock: 'bottom',
};

function parseReplyDock(v: unknown): ReplyDock {
  return v === 'right' ? 'right' : 'bottom';
}

export function loadThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
    return {
      mode: parsed.mode ?? DEFAULT_THEME.mode,
      accent: parsed.accent ?? DEFAULT_THEME.accent,
      density: parsed.density ?? DEFAULT_THEME.density,
      blockRemoteImages:
        parsed.blockRemoteImages ?? DEFAULT_THEME.blockRemoteImages,
      replyDock: parseReplyDock(parsed.replyDock),
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveThemePrefs(prefs: ThemePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
  return mode;
}

/** Apply theme tokens to documentElement for Tailwind lm-* colors. */
export function applyTheme(prefs: ThemePrefs): void {
  const root = document.documentElement;
  const resolved = resolveMode(prefs.mode);
  root.dataset['theme'] = resolved;
  root.dataset['density'] = prefs.density;
  root.style.setProperty('--color-lm-accent', prefs.accent);
  // derive a second accent (slightly greener/lighter mix feel)
  root.style.setProperty('--user-accent', prefs.accent);

  if (resolved === 'light') {
    root.style.setProperty('--color-lm-bg', '#f4f5f7');
    root.style.setProperty('--color-lm-panel', '#ffffff');
    root.style.setProperty('--color-lm-hover', '#e8eaef');
    root.style.setProperty('--color-lm-border', '#d0d5dd');
    root.style.setProperty('--color-lm-text', '#101828');
    root.style.setProperty('--color-lm-muted', '#667085');
  } else {
    root.style.setProperty('--color-lm-bg', '#0b0d12');
    root.style.setProperty('--color-lm-panel', '#12161f');
    root.style.setProperty('--color-lm-hover', '#1a2030');
    root.style.setProperty('--color-lm-border', '#2a3344');
    root.style.setProperty('--color-lm-text', '#e8ecf4');
    root.style.setProperty('--color-lm-muted', '#8b95a8');
  }

  // Keep accent after mode palette (mode overwrites accents if we set after)
  root.style.setProperty('--color-lm-accent', prefs.accent);
}
