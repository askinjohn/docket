import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matches, type MailTarget } from './match.js';

const t: MailTarget = {
  id: '1',
  fromName: 'GitLab',
  fromEmail: 'gitlab@gitlab.com',
  subject: 'Pipeline passed',
  snippet: 'your pipeline succeeded',
  unread: true,
  hasAttachments: false,
  labelIds: ['INBOX'],
  bodyPreview: '',
  lastMessageAt: Date.now(),
};

describe('matchers', () => {
  it('matches from substring', () => {
    assert.equal(matches(t, { fromIncludes: ['gitlab'] }), true);
    assert.equal(matches(t, { fromIncludes: ['pagerduty'] }), false);
  });

  it('matches subject', () => {
    assert.equal(matches(t, { subjectIncludes: ['pipeline'] }), true);
  });

  it('requires all query tokens', () => {
    assert.equal(matches(t, { query: 'pipeline gitlab' }), true);
    assert.equal(matches(t, { query: 'pipeline invoice' }), false);
  });

  it('filters by maxAgeDays', () => {
    assert.equal(matches(t, { maxAgeDays: 7 }), true);
    assert.equal(
      matches({ ...t, lastMessageAt: Date.now() - 10 * 86_400_000 }, { maxAgeDays: 7 }),
      false,
    );
  });
});
