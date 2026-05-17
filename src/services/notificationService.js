import { query } from '../config/db.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { audit, AUDIT_ACTIONS } from '../utils/audit.js';

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('251')) return `+${digits}`;
  if (digits.startsWith('0')) return `+251${digits.slice(1)}`;
  if (digits.length === 9) return `+251${digits}`;
  return phone;
};

const sendViaProvider = async ({ phone, message, senderId, provider }) => {
  const apiUrl = process.env.SMS_API_URL;
  const apiKey = process.env.SMS_API_KEY;

  if (!process.env.SMS_ENABLED || process.env.SMS_ENABLED === 'false') {
    return { simulated: true, ref: `sim-${Date.now()}` };
  }

  if (!apiUrl || !apiKey) {
    return { simulated: true, ref: `dev-${Date.now()}` };
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: phone,
      message,
      from: senderId,
      provider: provider || 'http',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `SMS provider error ${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ref: data.id || data.messageId || `sent-${Date.now()}` };
};

export const queueSms = async (schoolId, { phone, message, template_key, recipient_user_id, meta }, actorId) => {
  if (!phone?.trim() || !message?.trim()) {
    throw new AppError('Phone and message are required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const normalized = normalizePhone(phone);
  const result = await query(
    `INSERT INTO tenancy.notification_outbox (school_id, channel, recipient_phone, recipient_user_id, message_body, template_key, meta, status)
     VALUES ($1,'sms',$2,$3,$4,$5,$6,'pending') RETURNING *`,
    [schoolId, normalized, recipient_user_id || null, message.trim(), template_key || null, JSON.stringify(meta || {})]
  ).catch((err) => {
    if (err.code === '42P01') throw new AppError('Notification outbox not migrated.', 500);
    throw err;
  });

  audit({ userId: actorId, schoolId, action: AUDIT_ACTIONS.CREATE, entity: 'notification', entityId: result.rows[0].id });
  return result.rows[0];
};

export const processOutbox = async (schoolId, limit = 20) => {
  const settings = await query(
    `SELECT sms_enabled, sms_sender_id, sms_provider FROM tenancy.school_settings WHERE school_id = $1`,
    [schoolId]
  );
  const senderId = settings.rows[0]?.sms_sender_id || process.env.SMS_SENDER_ID || 'SCHOOL';
  const provider = settings.rows[0]?.sms_provider || 'http';

  const pending = await query(
    `SELECT * FROM tenancy.notification_outbox
     WHERE school_id = $1 AND status = 'pending' AND channel = 'sms'
     ORDER BY created_at ASC LIMIT $2`,
    [schoolId, limit]
  );

  const results = [];
  for (const row of pending.rows) {
    try {
      const sent = await sendViaProvider({
        phone: row.recipient_phone,
        message: row.message_body,
        senderId,
        provider,
      });
      await query(
        `UPDATE tenancy.notification_outbox SET status = 'sent', provider_ref = $1, sent_at = NOW() WHERE id = $2`,
        [sent.ref, row.id]
      );
      results.push({ id: row.id, status: 'sent' });
    } catch (err) {
      await query(
        `UPDATE tenancy.notification_outbox SET status = 'failed', error_message = $1 WHERE id = $2`,
        [err.message, row.id]
      );
      results.push({ id: row.id, status: 'failed', error: err.message });
    }
  }
  return results;
};

export const listNotifications = async (schoolId, { status, limit = 50 }) => {
  const params = [schoolId];
  let filter = '';
  if (status) {
    params.push(status);
    filter = ` AND status = $${params.length}`;
  }
  params.push(limit);
  const result = await query(
    `SELECT * FROM tenancy.notification_outbox
     WHERE school_id = $1 ${filter}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

/** Notify guardians of a student via SMS */
export const notifyStudentGuardians = async (schoolId, studentId, message, actorId) => {
  const guardians = await query(
    `SELECT phone, full_name FROM student.student_guardians
     WHERE student_id = $1 AND school_id = $2 AND phone IS NOT NULL AND phone <> ''`,
    [studentId, schoolId]
  );
  const queued = [];
  for (const g of guardians.rows) {
    const row = await queueSms(
      schoolId,
      { phone: g.phone, message, template_key: 'guardian_alert', meta: { student_id: studentId, guardian: g.full_name } },
      actorId
    );
    queued.push(row);
  }
  if (queued.length) await processOutbox(schoolId, queued.length);
  return { queued: queued.length };
};
