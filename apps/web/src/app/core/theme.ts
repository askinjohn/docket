export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemeDensity = 'compact' | 'comfortable';
/** Where reply / AI insight panels dock relative to the thread. */
export type ReplyDock = 'bottom' | 'right';

/**
 * How HTML mail loads remote/CDN images.
 * - always: load external images for every thread
 * - ask: block by default; “Show remote images” unlocks the current thread only
 * - never: always block (no per-thread unlock)
 */
export type RemoteImagesMode = 'always' | 'ask' | 'never';

export interface ThemePrefs {
  mode: ThemeMode;
  accent: string;
  density: ThemeDensity;
  /**
   * @deprecated Prefer remoteImagesMode. Kept for older localStorage values.
   * true ≈ ask/never, false ≈ always.
   */
  blockRemoteImages: boolean;
  /** Primary remote-image policy. */
  remoteImagesMode: RemoteImagesMode;
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

export const REMOTE_IMAGES_OPTIONS: {
  id: RemoteImagesMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'always',
    label: 'Always show',
    description: 'Load CDN images in every email (best layout; allows tracking).',
  },
  {
    id: 'ask',
    label: 'Ask each thread',
    description:
      'Block by default. Use “Show remote images” on a thread when you want them.',
  },
  {
    id: 'never',
    label: 'Always block',
    description: 'Never load remote images. Attachments and cid: still work.',
  },
];

const STORAGE_KEY = 'local-mail.theme';

export const DEFAULT_THEME: ThemePrefs = {
  mode: 'dark',
  accent: '#7c6af7',
  density: 'comfortable',
  blockRemoteImages: true,
  remoteImagesMode: 'ask',
  replyDock: 'bottom',
};

function parseReplyDock(v: unknown): ReplyDock {
  return v === 'right' ? 'right' : 'bottom';
}

function parseRemoteImagesMode(
  parsed: Partial<ThemePrefs>,
): RemoteImagesMode {
  if (
    parsed.remoteImagesMode === 'always' ||
    parsed.remoteImagesMode === 'ask' ||
    parsed.remoteImagesMode === 'never'
  ) {
    return parsed.remoteImagesMode;
  }
  // Migrate legacy boolean
  if (parsed.blockRemoteImages === false) return 'always';
  if (parsed.blockRemoteImages === true) return 'ask';
  return DEFAULT_THEME.remoteImagesMode;
}

export function loadThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
    const remoteImagesMode = parseRemoteImagesMode(parsed);
    return {
      mode: parsed.mode ?? DEFAULT_THEME.mode,
      accent: parsed.accent ?? DEFAULT_THEME.accent,
      density: parsed.density ?? DEFAULT_THEME.density,
      remoteImagesMode,
      // Keep boolean in sync for any leftover readers
      blockRemoteImages: remoteImagesMode !== 'always',
      replyDock: parseReplyDock(parsed.replyDock),
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveThemePrefs(prefs: ThemePrefs): void {
  const normalized: ThemePrefs = {
    ...prefs,
    blockRemoteImages: prefs.remoteImagesMode !== 'always',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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

  root.style.setProperty('--color-lm-accent', prefs.accent);
}
