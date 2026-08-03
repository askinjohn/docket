/**
 * Shared shell domain types (kept free of Angular DI for easier tests/splits).
 * UiShellService re-exports usage of these shapes.
 */

export interface ShellAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  kind: 'pdf' | 'image' | 'doc' | 'other';
  mimeType?: string;
}

export interface ShellMessage {
  id: string;
  from: string;
  to: string;
  time: string;
  body: string;
  bodyHtml: string;
  attachments: ShellAttachment[];
}

export interface ShellThreadPreview {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  starred?: boolean;
  messages: ShellMessage[];
  hasAttachments?: boolean;
}

export type MailView =
  | 'inbox'
  | 'starred'
  | 'all'
  | 'sent'
  | 'label'
  | 'custom';

export type CoreStatus =
  | 'checking'
  | 'offline'
  | 'online-disconnected'
  | 'online-connected'
  | 'auth-expired'
  | 'misconfigured';

export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeLabel: string;
  contentBase64: string;
}
