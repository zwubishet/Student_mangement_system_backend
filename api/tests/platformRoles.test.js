import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_READ_ROLES,
  PLATFORM_WRITE_ROLES,
  canPlatformWrite,
  canManagePointClaims,
} from '../src/constants/roles.js';

test('platform role constants', () => {
  assert.ok(PLATFORM_READ_ROLES.includes('SUPER_PROVIDER_ADMIN'));
  assert.ok(PLATFORM_WRITE_ROLES.includes('PROVIDER_ADMIN'));
  assert.ok(!PLATFORM_WRITE_ROLES.includes('SUPER_PROVIDER_ADMIN'));
});

test('canPlatformWrite', () => {
  assert.equal(canPlatformWrite(['SUPER_PROVIDER_ADMIN']), false);
  assert.equal(canPlatformWrite(['PROVIDER_ADMIN']), true);
  assert.equal(canPlatformWrite(['SUPER_ADMIN', 'SUPER_PROVIDER_ADMIN']), true);
});

test('canManagePointClaims', () => {
  assert.equal(canManagePointClaims(['SUPER_PROVIDER_ADMIN']), true);
  assert.equal(canManagePointClaims(['TEACHER']), false);
});
