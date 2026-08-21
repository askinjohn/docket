import { describe, expect, it } from 'vitest';

import type { Workflow } from './mail-api.service';
import {
  configJson,
  explainWorkflow,
  parseConfig,
  parseErrorMessage,
} from './workflow-explain';

function wf(partial: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w1',
    name: 'Team Offsite',
    description: 'File leave mail',
    english: 'label team offsite',
    enabled: true,
    approved: true,
    trigger: { type: 'mail.received' },
    model: { backend: 'local', model: 'qwen2.5:7b' },
    rules: [],
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('workflow-explain', () => {
  it('round-trips editable JSON fields', () => {
    const src = wf({
      rules: [
        {
          id: 'r1',
          matchers: { query: 'team offsite' },
          then: [{ type: 'addLabel', name: 'Team-Offsite' }],
        },
      ],
    });
    const parsed = parseConfig(configJson(src), src);
    expect(parsed?.name).toBe('Team Offsite');
    expect(parsed?.rules[0].matchers?.query).toBe('team offsite');
  });

  it('returns null on broken JSON', () => {
    expect(parseConfig('{', wf())).toBeNull();
    expect(parseErrorMessage('{')).toMatch(/JSON/i);
  });

  it('explains AND query words and archive', () => {
    const preview = explainWorkflow(
      wf({
        rules: [
          {
            id: 'r1',
            matchers: { query: 'team offsite' },
            then: [{ type: 'archive' }],
          },
        ],
      }),
    );
    expect(preview.whenTitle).toBe('Each new mail');
    expect(preview.modelNote).toMatch(/approved tools/i);
    expect(preview.rules[0].matchLines[0]).toMatch(/every word/);
    expect(preview.rules[0].matchLines[0]).toMatch(/team/);
    expect(preview.rules[0].actionLines[0]).toMatch(/inbox/);
  });

  it('warns on unread, missing filters, and placeholder text', () => {
    const preview = explainWorkflow(
      wf({
        rules: [
          {
            id: 'r1',
            matchers: {
              unread: true,
              fromIncludes: ['PLACEHOLDER'],
            },
            judge: 'noise',
            then: [{ type: 'addLabel' }],
          },
        ],
      }),
    );
    const warns = [
      ...preview.warnings,
      ...preview.rules[0].warnings,
    ].join(' ');
    expect(warns).toMatch(/unread/i);
    expect(warns).toMatch(/PLACEHOLDER/);
    expect(warns).toMatch(/addLabel/);
    expect(preview.rules[0].judgeLine).toMatch(/noise/);
  });

  it('explains cron + manual triggers', () => {
    expect(
      explainWorkflow(wf({ trigger: { type: 'cron', expr: '0 8 * * 1-5' } }))
        .whenBody,
    ).toContain('0 8 * * 1-5');
    expect(
      explainWorkflow(wf({ trigger: { type: 'manual' } })).whenTitle,
    ).toBe('Only when you run it');
  });
});
