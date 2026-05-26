import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, ERROR_CODES, sendSuccess } from '../src/utils/errors.js';

describe('AppError', () => {
  it('sets statusCode and code', () => {
    const err = new AppError('Not found', 404, ERROR_CODES.NOT_FOUND);
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, ERROR_CODES.NOT_FOUND);
    assert.equal(err.isOperational, true);
  });

  it('defaults NOT_FOUND code for 404', () => {
    const err = new AppError('missing', 404);
    assert.equal(err.code, ERROR_CODES.NOT_FOUND);
  });
});

describe('sendSuccess', () => {
  it('wraps payload in success envelope', () => {
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } };
    sendSuccess(res, { id: 1 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: { id: 1 } });
  });
});
