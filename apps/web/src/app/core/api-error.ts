import { HttpErrorResponse } from '@angular/common/http';

export interface ApiErrorInfo {
  message: string;
  authExpired: boolean;
  status: number | null;
}

/** Parse Angular HTTP / generic errors for UI handling. */
export function apiErrorInfo(e: unknown): ApiErrorInfo {
  if (e instanceof HttpErrorResponse) {
    const body = e.error as
      | { error?: string; code?: string; message?: string }
      | string
      | null;
    let msg = e.message;
    let code: string | undefined;
    if (body && typeof body === 'object') {
      msg = body.error ?? body.message ?? e.message;
      code = body.code;
    } else if (typeof body === 'string' && body.trim()) {
      msg = body;
    }
    const authExpired =
      code === 'auth_expired' ||
      e.status === 401 ||
      isAuthExpiredMessage(msg);
    return {
      message: authExpired
        ? 'Gmail session expired. Sign in again.'
        : String(msg),
      authExpired,
      status: e.status,
    };
  }

  if (e instanceof Error) {
    return {
      message: e.message,
      authExpired: isAuthExpiredMessage(e.message),
      status: null,
    };
  }

  const s = String(e ?? 'Request failed');
  return {
    message: s,
    authExpired: isAuthExpiredMessage(s),
    status: null,
  };
}

export function isAuthExpiredMessage(msg: string): boolean {
  return /invalid_grant|expired or revoked|invalid_token|auth_expired|Gmail session expired|sign in again/i.test(
    msg,
  );
}
