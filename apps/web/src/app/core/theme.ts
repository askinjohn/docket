export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemeDensity = 'compact' | 'comfortable';
/** Where reply / AI insight panels dock relative to the thread. */
export type ReplyDock = 'bottom' | 'right';
/** UI typeface for the shell + chat. */
export type FontFamily = 'sans' | 'serif' | 'mono' | 'system';
/** Relative UI font size. */
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

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
  fontFamily: FontFamily;
  fontSize: FontSize;
}

export const FONT_FAMILY_OPTIONS: {
  id: FontFamily;
  label: string;
  stack: string;
}[] = [
  {
    id: 'sans',
    label: 'Sans',
    stack: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'system',
    label: 'System',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
];

export const FONT_SIZE_OPTIONS: {
  id: FontSize;
  label: string;
  /** Multiplier on root 16px */
  scale: number;
}[] = [
  { id: 'sm', label: 'Small', scale: 0.9 },
  { id: 'md', label: 'Medium', scale: 1 },
  { id: 'lg', label: 'Large', scale: 1.125 },
  { id: 'xl', label: 'Extra large', scale: 1.25 },
];

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
  fontFamily: 'sans',
  fontSize: 'md',
};

function parseReplyDock(v: unknown): ReplyDock {
  return v === 'right' ? 'right' : 'bottom';
}

function parseFontFamily(v: unknown): FontFamily {
  if (v === 'sans' || v === 'serif' || v === 'mono' || v === 'system') return v;
  return DEFAULT_THEME.fontFamily;
}

function parseFontSize(v: unknown): FontSize {
  if (v === 'sm' || v === 'md' || v === 'lg' || v === 'xl') return v;
  return DEFAULT_THEME.fontSize;
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
      fontFamily: parseFontFamily(parsed.fontFamily),
      fontSize: parseFontSize(parsed.fontSize),
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
  root.dataset['fontFamily'] = prefs.fontFamily;
  root.dataset['fontSize'] = prefs.fontSize;
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

  const font =
    FONT_FAMILY_OPTIONS.find((f) => f.id === prefs.fontFamily)?.stack ??
    FONT_FAMILY_OPTIONS[0]!.stack;
  const scale =
    FONT_SIZE_OPTIONS.find((s) => s.id === prefs.fontSize)?.scale ?? 1;
  root.style.setProperty('--font-lm', font);
  root.style.setProperty('--font-size-scale', String(scale));
  root.style.fontSize = `${16 * scale}px`;
}
