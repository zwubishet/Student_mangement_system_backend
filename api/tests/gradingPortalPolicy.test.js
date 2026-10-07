import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_MARK_STATUSES } from '../src/services/grading/gradingReadService.js';

/**
 * Portal visibility policy — regression guard for parent/student grade leaks.
 * Marks must be verified/locked AND exam PUBLISHED (enforced in SQL in gradingReadService).
 */
describe('grading portal policy', () => {
  it('only verified and locked marks are portal-visible', () => {
    assert.deepEqual(PORTAL_MARK_STATUSES, ['verified', 'locked']);
    assert.ok(!PORTAL_MARK_STATUSES.includes('draft'));
    assert.ok(!PORTAL_MARK_STATUSES.includes('submitted'));
  });
});
