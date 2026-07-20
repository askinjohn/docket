import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

export interface AuthStatus {
  googleConfigured: boolean;
  connected: boolean;
  email: string | null;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  googleConfigured: boolean;
  account: { email: string } | null;
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
      this.http.get<AuthStatus>(`${this.baseUrl}/auth/status`),
    );
  }

  /** Browser navigates here for OAuth. */
  gmailConnectUrl(): string {
    return `${this.baseUrl}/auth/gmail/start`;
  }

  listThreads() {
    return firstValueFrom(
      this.http.get<{
        account: { id: number; email: string } | null;
        threads: ApiThread[];
      }>(`${this.baseUrl}/threads`),
    );
  }

  getThread(id: string) {
    return firstValueFrom(
      this.http.get<ApiThreadDetail>(`${this.baseUrl}/threads/${id}`),
    );
  }

  sync() {
    return firstValueFrom(
      this.http.post<{ ok: boolean; synced: number; email: string }>(
        `${this.baseUrl}/sync`,
        {},
      ),
    );
  }

  archive(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${threadId}/archive`,
        {},
      ),
    );
  }

  markRead(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${threadId}/read`,
        {},
      ),
    );
  }

  reply(threadId: string, bodyText: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; id: string }>(
        `${this.baseUrl}/threads/${threadId}/reply`,
        { bodyText },
      ),
    );
  }
}
