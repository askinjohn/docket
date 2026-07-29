import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

export interface AuthStatus {
  googleConfigured: boolean;
  connected: boolean;
  email: string | null;
}

export interface PublicAccount {
  id: number;
  email: string;
  provider: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  googleConfigured: boolean;
  account: { id?: number; email: string } | null;
  accounts?: PublicAccount[];
  aiMode?: string;
  notesDir?: string;
}

export interface ApiThread {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  starred?: boolean;
  hasAttachments?: boolean;
}

export interface ApiAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  kind: 'pdf' | 'image' | 'doc' | 'other';
  mimeType?: string;
}

export interface ApiMessage {
  id: string;
  from: string;
  to: string;
  time: string;
  body: string;
  bodyHtml?: string;
  attachments: ApiAttachment[];
}

export interface ApiThreadDetail {
  id: string;
  subject: string;
  from: string;
  time: string;
  unread: boolean;
  messages: ApiMessage[];
}

@Service()
export class MailApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.coreBaseUrl;

  health() {
    return firstValueFrom(
      this.http.get<HealthResponse>(`${this.baseUrl}/health`),
    );
  }

  authStatus() {
    return firstValueFrom(
      this.http.get<
        AuthStatus & { accountId?: number | null; accounts?: PublicAccount[] }
      >(`${this.baseUrl}/auth/status`),
    );
  }

  listAccounts() {
    return firstValueFrom(
      this.http.get<{ accounts: PublicAccount[]; activeId: number | null }>(
        `${this.baseUrl}/accounts`,
      ),
    );
  }

  setActiveAccount(accountId: number) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; account: PublicAccount }>(
        `${this.baseUrl}/accounts/active`,
        { accountId },
      ),
    );
  }

  removeAccount(accountId: number) {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; accounts: PublicAccount[] }>(
        `${this.baseUrl}/accounts/${accountId}`,
      ),
    );
  }

  gmailConnectUrl(): string {
    return `${this.baseUrl}/auth/gmail/start`;
  }

  listThreads(opts?: { q?: string; view?: 'inbox' | 'starred' | 'all' }) {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.view) params.set('view', opts.view);
    const qs = params.toString();
    return firstValueFrom(
      this.http.get<{
        account: { id: number; email: string } | null;
        threads: ApiThread[];
        searchHasMore?: boolean;
        inboxHasMore?: boolean;
      }>(`${this.baseUrl}/threads${qs ? `?${qs}` : ''}`),
    );
  }

  /** Gmail server-side search; results are cached locally. */
  searchGmail(q: string, opts?: { more?: boolean; maxResults?: number }) {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        synced: number;
        email: string;
        query: string;
        hasMore: boolean;
      }>(`${this.baseUrl}/search`, {
        q,
        more: opts?.more,
        maxResults: opts?.maxResults,
      }),
    );
  }

  getThread(id: string) {
    return firstValueFrom(
      this.http.get<ApiThreadDetail>(
        `${this.baseUrl}/threads/${encodeURIComponent(id)}`,
      ),
    );
  }

  sync(full = false, opts?: { more?: boolean; maxThreads?: number }) {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        synced: number;
        email: string;
        mode?: string;
        hasMore?: boolean;
        newMail?: {
          threadId: string;
          messageId: string;
          from: string;
          subject: string;
          snippet: string;
        }[];
      }>(`${this.baseUrl}/sync`, {
        full,
        more: opts?.more,
        maxThreads: opts?.maxThreads,
      }),
    );
  }

  archive(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/archive`,
        {},
      ),
    );
  }

  unarchive(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/unarchive`,
        {},
      ),
    );
  }

  markRead(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/read`,
        {},
      ),
    );
  }

  star(threadId: string, starred: boolean) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; starred: boolean }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/star`,
        { starred },
      ),
    );
  }

  reply(
    threadId: string,
    bodyText: string,
    attachments?: {
      filename: string;
      mimeType: string;
      contentBase64: string;
    }[],
  ) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; id: string }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/reply`,
        { bodyText, attachments },
      ),
    );
  }

  sendNew(
    to: string,
    subject: string,
    bodyText: string,
    cc?: string,
    attachments?: {
      filename: string;
      mimeType: string;
      contentBase64: string;
    }[],
  ) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; id: string }>(
        `${this.baseUrl}/messages/send`,
        { to, subject, bodyText, cc: cc || undefined, attachments },
      ),
    );
  }

  suggestContacts(q: string, limit = 8) {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
    });
    return firstValueFrom(
      this.http.get<{
        contacts: { email: string; name: string; hits: number }[];
      }>(`${this.baseUrl}/contacts/suggest?${params}`),
    );
  }

  attachmentUrl(id: string): string {
    return `${this.baseUrl}/attachments/${encodeURIComponent(id)}`;
  }

  dailySummary() {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        path: string;
        threadCount: number;
        markdown: string;
      }>(`${this.baseUrl}/summary/daily`, {}),
    );
  }

  aiSummarize(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; text: string; mode: string }>(
        `${this.baseUrl}/ai/summarize`,
        { threadId },
      ),
    );
  }

  aiDraft(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; text: string; mode: string }>(
        `${this.baseUrl}/ai/draft`,
        { threadId },
      ),
    );
  }
}
