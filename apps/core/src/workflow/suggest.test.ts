import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeRules } from './suggest.js';
import type { WorkflowRule } from './catalog.js';

const bloated: WorkflowRule[] = [
  {
    id: 'r1',
    matchers: {
      fromIncludes: ['calendar'],
      subjectIncludes: ['leave'],
      unread: true,
      hasAttachment: false,
      maxAgeDays: 7,
    },
    judge: 'can_archive',
    then: [{ type: 'removeFromInbox' }, { type: 'archive' }],
  },
];

describe('sanitizeRules', () => {
  it('drops unread/attachment/age/judge the user did not ask for', () => {
    const out = sanitizeRules(
      'Move calendar events from VACATION INDIA or leave away from inbox',
      bloated,
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0]!.matchers, {
      fromIncludes: ['calendar'],
      subjectIncludes: ['leave'],
    });
    assert.equal(out[0]!.judge, undefined);
    assert.deepEqual(out[0]!.then, [{ type: 'archive' }]);
  });

  it('replaces schema placeholders with words from English', () => {
    const out = sanitizeRules(
      'Remove any email that contains Team-Offsite. They need to be moved out of inbox',
      [
        {
          id: 'r1',
          matchers: {
            fromIncludes: ['sender, domain substrings from the request'],
            query: 'words from the request that may appear in subject, snippet, or body',
          },
          then: [
            { type: 'notify' },
            { type: 'addLabel', name: 'Team-Offsite' },
            { type: 'archive' },
            { type: 'star' },
          ],
        },
      ],
    );
    assert.equal(out[0]!.matchers?.query?.includes('team'), true);
    assert.equal(out[0]!.matchers?.query?.includes('offsite'), true);
    assert.equal(out[0]!.then.some((a) => a.type === 'notify'), false);
    assert.equal(out[0]!.then.some((a) => a.type === 'star'), false);
    assert.equal(out[0]!.then.some((a) => a.type === 'archive'), true);
  });

  it('does not invent archive when then is empty', () => {
    const out = sanitizeRules('List things to prioritise today', [
      { id: 'r1', then: [] },
    ]);
    assert.deepEqual(out[0]!.then, []);
  });

  it('keeps last-week age when asked', () => {
    const out = sanitizeRules('Go through last week', [
      {
        id: 'r1',
        matchers: { maxAgeDays: 7 },
        judge: 'urgent',
        then: [{ type: 'star' }],
      },
    ]);
    assert.equal(out[0]!.matchers?.maxAgeDays, 7);
    assert.equal(out[0]!.judge, 'urgent');
  });
});
