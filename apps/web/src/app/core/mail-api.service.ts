import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

export interface AuthStatus {
  googleConfigured: boolean;
  connected: boolean;
  authExpired?: boolean;
  email: string | null;
}

export interface PublicAccount {
  id: number;
  email: string;
  provider: string;
  authStatus?: 'ok' | 'expired';
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  googleConfigured: boolean;
  account: { id?: number; email: string; authStatus?: 'ok' | 'expired' } | null;
  accounts?: PublicAccount[];
  authExpired?: boolean;
  connected?: boolean;
  aiMode?: string;
  ai?: AiStatus;
  notesDir?: string;
}

export interface AiBackendConfig {
  type: 'ollama' | 'openai_compatible' | 'template';
  baseURL: string;
  apiKey?: string | null;
  apiKeyEnv?: string | null;
  hasKey?: boolean;
}

export interface AiRoleConfig {
  backend: string;
  model: string;
}

export interface AiRoleMeta {
  id: string;
  label: string;
  help: string;
}

export interface AiConfigPublic {
  version: number;
  backends: Record<string, AiBackendConfig>;
  roles: Record<string, AiRoleConfig>;
  path: string;
  roleMeta: AiRoleMeta[];
}

export type WorkflowTriggerType = 'mail.received' | 'manual' | 'cron';
export type WorkflowJudge =
  | 'urgent'
  | 'needs_reply'
  | 'noise'
  | 'can_archive';
export type WorkflowActionType =
  | 'notify'
  | 'addLabel'
  | 'removeFromInbox'
  | 'archive'
  | 'star'
  | 'report';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  expr?: string;
}

export interface WorkflowMatcher {
  fromIncludes?: string[];
  subjectIncludes?: string[];
  query?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  labelIncludes?: string[];
  maxAgeDays?: number;
}

export interface WorkflowAction {
  type: WorkflowActionType;
  name?: string;
  title?: string;
  text?: string;
}

export interface WorkflowRule {
  id: string;
  matchers?: WorkflowMatcher;
  judge?: WorkflowJudge;
  then: WorkflowAction[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  english: string;
  enabled: boolean;
  approved: boolean;
  trigger: WorkflowTrigger;
  model: { backend: string; model: string };
  rules: WorkflowRule[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastError?: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  at: string;
  reason: string;
  dryRun: boolean;
  threadCount: number;
  actions: {
    threadId: string;
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }[];
  error?: string;
  output?: string;
}

export interface WorkflowCatalog {
  triggers: { id: string; label: string; help: string }[];
  judges: { id: string; label: string; help: string }[];
  actions: { id: string; label: string; help: string }[];
  blocked: string[];
}

export type WorkflowJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export interface WorkflowJob {
  id: string;
  workflowId: string;
  workflowName: string;
  reason: string;
  dryRun: boolean;
  status: WorkflowJobStatus;
  threadCount: number;
  scanned: number;
  actions: {
    threadId: string;
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }[];
  current?: { from: string; subject: string } | null;
  error?: string;
  startedAt: string;
  finishedAt?: string | null;
  output?: string;
}

export interface WorkflowsResponse {
  path: string;
  catalog: WorkflowCatalog;
  workflows: Workflow[];
  runs: WorkflowRun[];
  jobs?: WorkflowJob[];
}

export interface AiStatus {
  mode: 'template' | 'ollama' | 'openai';
  model: string | null;
  ollamaReachable: boolean;
  ollamaBaseUrl: string;
  models: string[];
  hasChatModel: boolean;
  hint: string;
  config?: AiConfigPublic;
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
  cc?: string;
  bcc?: string;
  time: string;
  body: string;
  bodyHtml?: string;
  attachments: ApiAttachment[];
}

export interface ApiParticipant {
  name: string;
  email: string;
  display: string;
}

export interface ApiThreadDetail {
  id: string;
  subject: string;
  from: string;
  time: string;
  unread: boolean;
  participants?: ApiParticipant[];
  messages: ApiMessage[];
}

export type ApiThreadView = 'inbox' | 'starred' | 'all' | 'sent' | 'label';

export interface ApiLabel {
  id: string;
  name: string;
  system: boolean;
  count: number;
}

export interface ApiMailView {
  id: number;
  name: string;
  query: string;
  created_at: number;
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

  listThreads(opts?: {
    q?: string;
    view?: ApiThreadView;
    label?: string;
  }) {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.view) params.set('view', opts.view);
    if (opts?.label) params.set('label', opts.label);
    const qs = params.toString();
    return firstValueFrom(
      this.http.get<{
        account: { id: number; email: string } | null;
        threads: ApiThread[];
        searchHasMore?: boolean;
        inboxHasMore?: boolean;
        authExpired?: boolean;
      }>(`${this.baseUrl}/threads${qs ? `?${qs}` : ''}`),
    );
  }

  listLabels() {
    return firstValueFrom(
      this.http.get<{ labels: ApiLabel[] }>(`${this.baseUrl}/labels`),
    );
  }

  listViews() {
    return firstValueFrom(
      this.http.get<{ views: ApiMailView[] }>(`${this.baseUrl}/views`),
    );
  }

  createView(name: string, query: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; view: ApiMailView }>(
        `${this.baseUrl}/views`,
        { name, query },
      ),
    );
  }

  deleteView(id: number) {
    return firstValueFrom(
      this.http.delete<{ ok: boolean }>(`${this.baseUrl}/views/${id}`),
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

  markUnread(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/unread`,
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
    replyAll = false,
    messageId?: string,
  ) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; id: string }>(
        `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/reply`,
        { bodyText, attachments, replyAll, messageId },
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

  aiStatus() {
    return firstValueFrom(this.http.get<AiStatus>(`${this.baseUrl}/ai/status`));
  }

  getAiConfig() {
    return firstValueFrom(
      this.http.get<AiConfigPublic>(`${this.baseUrl}/ai/config`),
    );
  }

  saveAiConfig(config: {
    backends: Record<string, AiBackendConfig>;
    roles: Record<string, AiRoleConfig>;
  }) {
    return firstValueFrom(
      this.http.put<AiConfigPublic & { ok: boolean }>(
        `${this.baseUrl}/ai/config`,
        config,
      ),
    );
  }

  aiSummarize(threadId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; text: string; mode: string; model?: string }>(
        `${this.baseUrl}/ai/summarize`,
        { threadId },
      ),
    );
  }

  aiChat(
    threadId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ) {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        text: string;
        mode: string;
        model?: string;
      }>(`${this.baseUrl}/ai/chat`, { threadId, messages }),
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

  listWorkflows() {
    return firstValueFrom(
      this.http.get<WorkflowsResponse>(`${this.baseUrl}/workflows`),
    );
  }

  suggestWorkflow(english: string, backend: string, model: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; workflow: Workflow }>(
        `${this.baseUrl}/workflows/suggest`,
        { english, backend, model },
      ),
    );
  }

  saveWorkflow(workflow: Partial<Workflow>) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; workflow: Workflow }>(
        `${this.baseUrl}/workflows`,
        workflow,
      ),
    );
  }

  patchWorkflow(id: string, patch: Partial<Workflow>) {
    return firstValueFrom(
      this.http.patch<{ ok: boolean; workflow: Workflow }>(
        `${this.baseUrl}/workflows/${encodeURIComponent(id)}`,
        patch,
      ),
    );
  }

  deleteWorkflow(id: string) {
    return firstValueFrom(
      this.http.delete<{ ok: boolean }>(
        `${this.baseUrl}/workflows/${encodeURIComponent(id)}`,
      ),
    );
  }

  runWorkflow(id: string, opts?: { dryRun?: boolean; limit?: number }) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job: WorkflowJob }>(
        `${this.baseUrl}/workflows/${encodeURIComponent(id)}/run`,
        opts ?? {},
      ),
    );
  }

  stopWorkflowJob(jobId: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; job: WorkflowJob }>(
        `${this.baseUrl}/workflows/jobs/${encodeURIComponent(jobId)}/stop`,
        {},
      ),
    );
  }

  stopWorkflow(id: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean; jobs: WorkflowJob[] }>(
        `${this.baseUrl}/workflows/${encodeURIComponent(id)}/stop`,
        {},
      ),
    );
  }

  aiAsk(
    question: string,
    messages: { role: 'user' | 'assistant'; content: string }[] = [],
  ) {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        text: string;
        mode: string;
        model?: string;
      }>(`${this.baseUrl}/ai/ask`, { question, messages }),
    );
  }
}
