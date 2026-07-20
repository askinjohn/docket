import { Service, computed, signal } from '@angular/core';

export type ShellPane = 'list' | 'reading' | 'sidebar';

export interface ShellThreadPreview {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
}

/** Placeholder threads until Phase 1 Gmail sync. */
const DEMO_THREADS: ShellThreadPreview[] = [
  {
    id: 'demo-1',
    from: 'Local Mail',
    subject: 'Welcome — Phase 0 shell',
    snippet: 'This is a static preview. Connect Gmail in Phase 1.',
    time: 'Now',
    unread: true,
  },
  {
    id: 'demo-2',
    from: 'Roadmap',
    subject: 'Next: local core + OAuth',
    snippet: 'SQLite, Gmail API, archive/send — see ROADMAP.md',
    time: '—',
    unread: false,
  },
  {
    id: 'demo-3',
    from: 'Architecture',
    subject: 'Angular 22 + local core',
    snippet: 'Signals, Signal Forms, httpResource when API exists.',
    time: '—',
    unread: false,
  },
];

@Service()
export class UiShellService {
  readonly threads = signal<ShellThreadPreview[]>(DEMO_THREADS);
  readonly selectedId = signal<string | null>(DEMO_THREADS[0]?.id ?? null);
  readonly commandPaletteOpen = signal(false);
  readonly phaseLabel = signal('Phase 0 — Shell');

  readonly selectedThread = computed(() => {
    const id = this.selectedId();
    return this.threads().find((t) => t.id === id) ?? null;
  });

  selectThread(id: string): void {
    this.selectedId.set(id);
    this.threads.update((list) =>
      list.map((t) => (t.id === id ? { ...t, unread: false } : t)),
    );
  }

  selectNext(): void {
    const list = this.threads();
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === this.selectedId());
    const next = list[Math.min(idx + 1, list.length - 1)];
    if (next) this.selectThread(next.id);
  }

  selectPrevious(): void {
    const list = this.threads();
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === this.selectedId());
    const prev = list[Math.max(idx - 1, 0)];
    if (prev) this.selectThread(prev.id);
  }

  toggleCommandPalette(): void {
    this.commandPaletteOpen.update((v) => !v);
  }

  closeCommandPalette(): void {
    this.commandPaletteOpen.set(false);
  }
}
