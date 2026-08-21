import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Workflow } from './catalog.js';
import {
  callsFromUnknown,
  defaultActions,
  intentHints,
  parseHarnessResponse,
  parseRunMode,
} from './harness.js';

function wf(partial: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w1',
    name: 'Team-Offsite',
    description: '',
    english:
      'Remove any email that contains Team-Offsite. They need to be moved out of inbox to a separate folder or archived',
    enabled: true,
    approved: true,
    trigger: { type: 'manual' },
    model: { backend: 'local', model: 'llama3.2:1b' },
    rules: [
      {
        id: 'r1',
        matchers: {
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
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('harness', () => {
  it('hints include hyphenated name tokens, not separate', () => {
    const hints = intentHints(wf().english);
    assert.equal(hints.some((h) => h.includes('team')), true);
    assert.equal(hints.some((h) => h.includes('offsite')), true);
    assert.equal(hints.includes('separate'), false);
  });

  it('default tools are label + archive, not notify/star', () => {
    const acts = defaultActions(wf());
    assert.deepEqual(
      acts.map((a) => a.type),
      ['addLabel', 'archive'],
    );
    assert.equal(acts[0]?.name, 'Team-Offsite');
  });

  it('maps delete/trash to archive and drops send', () => {
    const acts = callsFromUnknown(
      [{ fn: 'delete' }, { fn: 'send' }, { type: 'addLabel', name: 'Team-Offsite' }],
      [],
    );
    assert.deepEqual(
      acts.map((a) => a.type),
      ['archive', 'addLabel'],
    );
  });

  it('parses per-email calls JSON', () => {
    const defaults = defaultActions(wf());
    const map = parseHarnessResponse(
      '{"calls":[{"fn":"addLabel","name":"Team-Offsite"},{"fn":"archive"}]}',
      defaults,
      ['e1'],
    );
    assert.deepEqual(
      map.get('e1')?.map((a) => a.type),
      ['addLabel', 'archive'],
    );
  });

  it('empty calls skip the mail', () => {
    const map = parseHarnessResponse('{"calls":[]}', defaultActions(wf()), ['e1']);
    assert.deepEqual(map.get('e1'), []);
  });

  it('YES without JSON uses preferred tools', () => {
    const defaults = defaultActions(wf());
    const map = parseHarnessResponse('YES', defaults, ['e1']);
    assert.equal(map.get('e1')?.length, defaults.length);
  });

  it('lets the model choose report vs act only when compile is empty', () => {
    assert.deepEqual(parseRunMode('{"report":true,"act":false}', { report: false, act: false }), {
      report: true,
      act: false,
    });
    assert.deepEqual(parseRunMode('{"report":false,"act":true}', { report: false, act: false }), {
      report: false,
      act: true,
    });
  });

  it('keeps filing workflows as act even if the model asks to report', () => {
    assert.deepEqual(parseRunMode('{"report":true,"act":false}', { report: false, act: true }), {
      report: false,
      act: true,
    });
    assert.deepEqual(parseRunMode('{"report":true}', { report: false, act: true }), {
      report: false,
      act: true,
    });
  });

  it('keeps answer workflows as report even if the model asks to act', () => {
    assert.deepEqual(parseRunMode('{"report":false,"act":true}', { report: true, act: false }), {
      report: true,
      act: false,
    });
  });

  it('parses report tool calls', () => {
    const acts = callsFromUnknown(
      [{ fn: 'report', text: 'Reply to Ada first' }],
      [],
    );
    assert.equal(acts[0]?.type, 'report');
    assert.equal(acts[0]?.text, 'Reply to Ada first');
  });

  it('parses batched results', () => {
    const map = parseHarnessResponse(
      '{"results":[{"id":"e1","calls":[{"fn":"archive"}]},{"id":"e2","calls":[]}]}',
      [],
      ['e1', 'e2'],
    );
    assert.deepEqual(map.get('e1')?.map((a) => a.type), ['archive']);
    assert.deepEqual(map.get('e2'), []);
  });
});
