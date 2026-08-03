import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { apiErrorInfo } from './api-error';

describe('apiErrorInfo', () => {
  it('detects auth_expired code from core', () => {
    const err = new HttpErrorResponse({
      status: 401,
      error: { error: 'Gmail session expired. Sign in again.', code: 'auth_expired' },
      url: 'http://127.0.0.1:8787/sync',
    });
    const info = apiErrorInfo(err);
    expect(info.authExpired).toBe(true);
    expect(info.message).toMatch(/session expired/i);
  });

  it('detects invalid_grant in message', () => {
    const info = apiErrorInfo(new Error('invalid_grant'));
    expect(info.authExpired).toBe(true);
  });

  it('does not flag normal errors', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: 'bodyText required' },
    });
    expect(apiErrorInfo(err).authExpired).toBe(false);
  });
});
