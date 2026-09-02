import { readPref, writePref } from './pref-storage';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemeDensity = 'compact' | 'comfortable';
/** @deprecated Reply is always bottom; AI is always right. Kept for old prefs. */
export type ReplyDock = 'bottom' | 'right';
/** UI typeface for the shell + chat. */
export type FontFamily = 'sans' | 'serif' | 'mono' | 'system';
/** Relative UI font size. */
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';
/** Shell layout customers can pick. */
export type UiLayout = 'list' | 'split';

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
  /** Unused: reply is always bottom, AI always right. Kept so old prefs still parse. */
  replyDock: ReplyDock;
  fontFamily: FontFamily;
  fontSize: FontSize;
  /** list = inbox first, click to read; split = list stays on the side */
  uiLayout: UiLayout;
}

export const FONT_FAMILY_OPTIONS: {
  id: FontFamily;
  label: string;
  stack: string;
}[] = [
  {
    id: 'sans',
    label: 'Sans',
    stack:
      "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'system',
    label: 'System',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: "'Fraunces', 'Iowan Old Style', Georgia, serif",
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
  { id: 'copper', label: 'Copper', value: '#c45c26' },
  { id: 'brass', label: 'Brass', value: '#c9a36a' },
  { id: 'ink', label: 'Ink', value: '#2f4a6e' },
  { id: 'violet', label: 'Violet', value: '#7c6af7' },
  { id: 'teal', label: 'Teal', value: '#14b8a6' },
  { id: 'rose', label: 'Rose', value: '#c45c4a' },
] as const;

export const UI_LAYOUT_OPTIONS: {
  id: UiLayout;
  label: string;
  description: string;
}[] = [
  {
    id: 'list',
    label: 'List first',
    description:
      'Open on the full inbox. Click a thread to read it. Esc or Back returns to the list.',
  },
  {
    id: 'split',
    label: 'Split',
    description: 'Keep the thread list on the side while you read (classic 3-pane).',
  },
];

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

const STORAGE_KEY = 'theme';

export const DEFAULT_THEME: ThemePrefs = {
  mode: 'dark',
  accent: '#c45c26',
  density: 'compact',
  blockRemoteImages: true,
  remoteImagesMode: 'ask',
  replyDock: 'bottom',
  fontFamily: 'sans',
  fontSize: 'md',
  uiLayout: 'list',
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

function parseUiLayout(v: unknown): UiLayout {
  if (v === 'split' || v === 'classic') return 'split';
  return 'list';
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
    const raw = readPref(STORAGE_KEY);
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
      uiLayout: parseUiLayout(parsed.uiLayout),
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
  writePref(STORAGE_KEY, JSON.stringify(normalized));
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
  root.dataset['layout'] = prefs.uiLayout;
  root.style.setProperty('--color-lm-accent', prefs.accent);
  root.style.setProperty('--user-accent', prefs.accent);

  if (resolved === 'light') {
    root.style.setProperty('--color-lm-bg', '#f4efe6');
    root.style.setProperty('--color-lm-panel', '#fffaf3');
    root.style.setProperty('--color-lm-hover', '#ebe3d4');
    root.style.setProperty('--color-lm-border', '#ddd2c0');
    root.style.setProperty('--color-lm-text', '#1c1814');
    root.style.setProperty('--color-lm-muted', '#6f665c');
  } else {
    root.style.setProperty('--color-lm-bg', '#141210');
    root.style.setProperty('--color-lm-panel', '#1c1915');
    root.style.setProperty('--color-lm-hover', '#26221c');
    root.style.setProperty('--color-lm-border', '#3a342c');
    root.style.setProperty('--color-lm-text', '#f3eee6');
    root.style.setProperty('--color-lm-muted', '#9a9084');
  }

  root.style.setProperty('--color-lm-accent', prefs.accent);

  const font =
    FONT_FAMILY_OPTIONS.find((f) => f.id === prefs.fontFamily)?.stack ??
    FONT_FAMILY_OPTIONS[0]!.stack;
  const scale =
    FONT_SIZE_OPTIONS.find((s) => s.id === prefs.fontSize)?.scale ?? 1;
  root.style.setProperty('--font-lm', font);
  const display =
    prefs.fontFamily === 'sans'
      ? "'Fraunces', 'Iowan Old Style', Georgia, serif"
      : font;
  root.style.setProperty('--font-lm-display', display);
  root.style.setProperty('--font-size-scale', String(scale));
  root.style.fontSize = `${16 * scale}px`;
}
