/** Gmail OAuth / token failures that require the user to sign in again. */

export class GmailAuthExpiredError extends Error {
  readonly code = 'auth_expired' as const;

  constructor(message = 'Gmail session expired. Sign in again.') {
    super(message);
    this.name = 'GmailAuthExpiredError';
  }
}

export function isGmailAuthExpired(e: unknown): boolean {
  if (e instanceof GmailAuthExpiredError) return true;
  if (typeof e === 'string') {
    return /invalid_grant|expired or revoked|invalid_token|unauthorized_client|token.*revoked|auth_expired|Gmail session expired/i.test(
      e,
    );
  }

  const parts: string[] = [];
  if (e instanceof Error) parts.push(e.message, e.name);
  if (e && typeof e === 'object') {
    const any = e as {
      code?: string | number;
      message?: string;
      response?: {
        status?: number;
        data?: { error?: string; error_description?: string };
      };
    };
    if (any.message) parts.push(String(any.message));
    if (any.code != null) parts.push(String(any.code));
    if (any.response?.data?.error) parts.push(String(any.response.data.error));
    if (any.response?.data?.error_description) {
      parts.push(String(any.response.data.error_description));
    }
  }
  const hay = parts.join(' ');
  return /invalid_grant|expired or revoked|invalid_token|unauthorized_client|token.*revoked|auth_expired/i.test(
    hay,
  );
}

export function toGmailError(e: unknown): Error {
  if (isGmailAuthExpired(e)) return new GmailAuthExpiredError();
  return e instanceof Error ? e : new Error(String(e));
}
