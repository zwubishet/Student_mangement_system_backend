import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/middlewares/roleGuards.js';

describe('requireRole middleware', () => {
  const run = (roles, userRoles, isPlatformManage = false) => {
    let err;
    const req = { tenant: { roles: userRoles, isPlatformManage } };
    const res = {};
    const next = (e) => { err = e; };
    requireRole(...roles)(req, res, next);
    return err;
  };

  it('allows matching role', () => {
    assert.equal(run(['STUDENT'], ['STUDENT']), undefined);
  });

  it('allows one of multiple required roles', () => {
    assert.equal(run(['TEACHER', 'SCHOOL_ADMIN'], ['TEACHER']), undefined);
  });

  it('blocks wrong role with 403', () => {
    const err = run(['STUDENT'], ['PARENT']);
    assert.equal(err?.statusCode, 403);
  });

  it('bypasses check for platform manage mode', () => {
    assert.equal(run(['SCHOOL_ADMIN'], ['SUPER_ADMIN'], true), undefined);
  });
});
