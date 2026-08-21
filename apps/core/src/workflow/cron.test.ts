import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cronDue, cronMatches, parseCron } from './cron.js';

describe('cron', () => {
  it('parses weekday 08:00', () => {
    const c = parseCron('0 8 * * 1-5');
    assert.ok(c);
    assert.ok(c.minute.has(0));
    assert.ok(c.hour.has(8));
    assert.ok(c.dow.has(1) && c.dow.has(5) && !c.dow.has(0));
  });

  it('matches a local weekday morning', () => {
    const monday = new Date(2026, 7, 17, 8, 0, 0); // Mon
    assert.equal(monday.getDay(), 1);
    assert.equal(cronMatches('0 8 * * 1-5', monday), true);
    assert.equal(cronMatches('0 8 * * 1-5', new Date(2026, 7, 17, 8, 1, 0)), false);
    assert.equal(cronMatches('0 8 * * 1-5', new Date(2026, 7, 16, 8, 0, 0)), false);
  });

  it('is due when never run and slot just passed', () => {
    const now = new Date(2026, 7, 17, 8, 5, 0);
    assert.equal(cronDue('0 8 * * 1-5', null, now), true);
    assert.equal(cronDue('0 8 * * 1-5', now.toISOString(), now), false);
    assert.equal(
      cronDue('0 8 * * 1-5', new Date(2026, 7, 17, 7, 59, 0).toISOString(), now),
      true,
    );
  });
});
