import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ACCESS_TOKEN_SECRET = 'test_access_secret_min_32_characters';
process.env.ACTION_SECRET = 'test_action_secret';
process.env.PLATFORM_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';

const { generateHasuraToken } = await import('../src/utils/auth.js');
const { toLoginOutput, toLogoutOutput } = await import('../src/services/auth/authPresenter.js');

test('session JWT does not leak ACTION_SECRET', () => {
  const token = generateHasuraToken({
    id: '11111111-1111-1111-1111-111111111111',
    schoolId: '22222222-2222-2222-2222-222222222222',
    roles: ['SCHOOL_ADMIN'],
    firstName: 'Test',
    lastName: 'User',
  });
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const claims = payload['https://hasura.io/jwt/claims'];
  assert.equal(claims['x-hasura-action-secret'], undefined);
  assert.equal(claims['x-hasura-user-id'], '11111111-1111-1111-1111-111111111111');
  assert.deepEqual(claims['x-hasura-allowed-roles'], ['SCHOOL_ADMIN']);
});

test('login presenter matches Hasura LoginOutput', () => {
  const out = toLoginOutput({
    token: 'tok',
    user: {
      id: 'u',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      schoolId: 's',
      roles: ['TEACHER'],
    },
  });
  assert.equal(out.first_name, 'A');
  assert.equal(out.school_id, 's');
  assert.deepEqual(out.roles, ['TEACHER']);
});

test('logout presenter matches Hasura LogoutOutput', () => {
  const out = toLogoutOutput();
  assert.equal(out.status, 'success');
  assert.match(out.message, /logged out/i);
});
