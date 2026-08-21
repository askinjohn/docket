import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAddressList, replyAllTargets } from './addresses.js';

describe('addresses', () => {
  it('parses name and email', () => {
    const a = parseAddressList('Ada Lovelace <ada@ex.com>, bob@ex.com');
    assert.equal(a.length, 2);
    assert.equal(a[0]!.email, 'ada@ex.com');
    assert.equal(a[1]!.email, 'bob@ex.com');
  });

  it('builds reply-all excluding me', () => {
    const t = replyAllTargets(
      {
        from: 'Ann <ann@x.com>',
        to: 'Me <me@x.com>, Bob <bob@x.com>',
        cc: 'Cara <cara@x.com>',
      },
      'me@x.com',
    );
    assert.match(t.to, /ann@x.com/i);
    assert.match(t.cc, /bob@x.com/i);
    assert.match(t.cc, /cara@x.com/i);
    assert.doesNotMatch(t.to + t.cc, /me@x.com/i);
  });
});
