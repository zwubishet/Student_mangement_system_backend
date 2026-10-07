import crypto from 'crypto';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

const CHAPA_BASE = (process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1').replace(/\/$/, '');

export const isChapaConfigured = () => Boolean(process.env.CHAPA_SECRET_KEY?.trim());

export const chapaMode = () => (process.env.CHAPA_MODE === 'live' ? 'live' : 'test');

export const apiPublicUrl = () => {
  const base = process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL;
  if (base) return base.replace(/\/$/, '');
  const port = process.env.PORT || 3004;
  return `http://localhost:${port}`;
};

export const frontendPublicUrl = () => {
  const url = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  return (url || 'http://localhost:5173').replace(/\/$/, '');
};

const assertChapaSecretKey = () => {
  const key = process.env.CHAPA_SECRET_KEY?.trim();
  if (!key) {
    throw new AppError('Chapa is not configured on the server.', 503, ERROR_CODES.INVALID_OPERATION);
  }
  if (key.startsWith('CHAPUBK')) {
    throw new AppError(
      'CHAPA_SECRET_KEY must be your Chapa secret key (CHASECK_TEST-... or CHASECK-...), not the public key (CHAPUBK-...).',
      503,
      ERROR_CODES.INVALID_OPERATION
    );
  }
  return key;
};

const chapaHeaders = () => ({
  Authorization: `Bearer ${assertChapaSecretKey()}`,
  'Content-Type': 'application/json',
});

/** Chapa often returns message/error as nested objects — never pass raw objects to AppError */
export const formatChapaErrorMessage = (data, status = 502) => {
  if (!data) return `Chapa request failed (${status})`;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.message === 'object' && data.message !== null) {
    return Object.entries(data.message)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join('; ');
  }
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error === 'object' && data.error !== null) {
    return JSON.stringify(data.error);
  }
  if (data.errors && typeof data.errors === 'object') {
    return Object.entries(data.errors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join('; ');
  }
  if (typeof data.status === 'string' && data.status !== 'success') {
    return `Chapa returned status "${data.status}"`;
  }
  return `Chapa request failed (${status})`;
};

const parseChapaJson = async (res) => {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError('Invalid response from Chapa.', 502, ERROR_CODES.INVALID_OPERATION);
  }
  if (!res.ok) {
    throw new AppError(formatChapaErrorMessage(data, res.status), 502, ERROR_CODES.INVALID_OPERATION);
  }
  return data;
};

/** Chapa expects Ethiopian mobile format e.g. 0912345678 */
export const normalizeChapaPhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('251') && digits.length >= 12) return `0${digits.slice(3, 12)}`;
  if (digits.startsWith('09') && digits.length >= 10) return digits.slice(0, 10);
  if (digits.startsWith('9') && digits.length === 9) return `0${digits}`;
  if (digits.length >= 10) return digits.slice(-10).startsWith('9') ? `0${digits.slice(-9)}` : null;
  return null;
};

const sanitizeMeta = (meta = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
};

/** Chapa customization.title/description: letters, numbers, hyphen, underscore, space, dot only */
export const sanitizeChapaText = (text, fallback = 'School fee') => {
  const raw = String(text || fallback).trim() || fallback;
  return raw
    .replace(/[/·•|,;:!?@#$%^&*()+=[\]{}'"<>\\`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
    .trim()
    .slice(0, 200) || fallback;
};

const resolveCallbackUrl = (explicit) => {
  const url = explicit || `${apiPublicUrl()}/api/v1/finance/webhooks/chapa`;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url)) {
    return null;
  }
  return url;
};

/**
 * Initialize a Chapa checkout session (test keys use same API host; mode is key-based).
 */
export const initializeTransaction = async ({
  amount,
  currency = 'ETB',
  email,
  firstName,
  lastName,
  phoneNumber,
  txRef,
  callbackUrl,
  returnUrl,
  title,
  description,
  meta = {},
}) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) {
    throw new AppError('Payment amount must be greater than zero.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const phone = normalizeChapaPhone(phoneNumber);
  if (!phone) {
    throw new AppError(
      'A valid Ethiopian mobile number (09xxxxxxxx) is required for Chapa. Update your profile phone number.',
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const payload = {
    amount: String(amt.toFixed(2)),
    currency,
    email: String(email).trim(),
    first_name: String(firstName || 'Parent').trim().slice(0, 50),
    last_name: String(lastName || 'Guardian').trim().slice(0, 50),
    phone_number: phone,
    tx_ref: txRef,
    return_url: returnUrl || `${frontendPublicUrl()}/parent/payment/return`,
    customization: {
      title: sanitizeChapaText(title, 'School fee payment').slice(0, 100),
      description: sanitizeChapaText(description, 'Student fee invoice').slice(0, 200),
    },
  };

  const cb = resolveCallbackUrl(callbackUrl);
  if (cb) payload.callback_url = cb;

  const cleanMeta = sanitizeMeta(meta);
  if (Object.keys(cleanMeta).length) payload.meta = cleanMeta;

  const res = await fetch(`${CHAPA_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: chapaHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseChapaJson(res);
  if (data.status !== 'success' || !data.data?.checkout_url) {
    throw new AppError(
      formatChapaErrorMessage(data, 502) || 'Could not start Chapa checkout.',
      502,
      ERROR_CODES.INVALID_OPERATION
    );
  }
  return {
    checkoutUrl: data.data.checkout_url,
    txRef,
    mode: chapaMode(),
  };
};

/**
 * Verify transaction with Chapa before crediting invoice (required for production safety).
 */
export const verifyTransaction = async (txRef) => {
  const res = await fetch(`${CHAPA_BASE}/transaction/verify/${encodeURIComponent(txRef)}`, {
    method: 'GET',
    headers: chapaHeaders(),
  });
  return parseChapaJson(res);
};

export const verifyWebhookSignature = (req) => {
  const secret = (process.env.CHAPA_WEBHOOK_SECRET || process.env.CHAPA_SECRET_KEY || '').trim();
  if (!secret) return true;

  const signature =
    req.headers['x-chapa-signature']
    || req.headers['chapa-signature']
    || req.headers['Chapa-Signature'];
  if (!signature) return false;

  const payload = typeof req.rawBody === 'string'
    ? req.rawBody
    : JSON.stringify(req.body ?? {});
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(signature)),
      Buffer.from(expected)
    );
  } catch {
    return String(signature) === expected;
  }
};

export const extractVerifiedPayment = (verifyResponse) => {
  const data = verifyResponse?.data || verifyResponse;
  const status = String(data?.status || '').toLowerCase();
  const ok = status === 'success' || status === 'successful';
  return {
    ok,
    status,
    amount: Number(data?.amount ?? data?.charged_amount ?? 0),
    currency: data?.currency || 'ETB',
    txRef: data?.tx_ref || data?.reference,
    meta: data?.meta || data?.metadata || {},
  };
};

export const buildTxRef = (invoiceId) => {
  const slug = String(invoiceId).replace(/-/g, '').slice(0, 8);
  return `sms-${slug}-${Date.now()}`;
};
