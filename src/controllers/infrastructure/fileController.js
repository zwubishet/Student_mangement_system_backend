import crypto from 'crypto';
import Joi from 'joi';
import { getClient, query } from '../../config/db.js';
import AppError from '../../utils/appError.js';
import catchAsync from '../../utils/catchAsync.js';
import { auditLog } from '../../utils/audit.js';

const presignSchema = Joi.object({
  fileName: Joi.string().trim().min(1).max(180).required(),
  mimeType: Joi.string().trim().max(120).default('application/octet-stream'),
  sizeBytes: Joi.number().integer().min(1).max(25 * 1024 * 1024).required(),
  type: Joi.string().trim().max(80).default('document'),
});

const completeSchema = Joi.object({
  fileId: Joi.string().uuid().required(),
  fileUrl: Joi.string().uri().required(),
});

const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map((detail) => detail.message).join(', '), 400);
  return value;
};

const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const getSigningKey = (secret, dateStamp, region, service) => {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const createPresignedPutUrl = ({ bucket, key, mimeType, expires = 900 }) => {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'auto';
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new AppError('Storage signing is not configured.', 500);
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
  const host = new URL(endpoint).host;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const signedHeaders = 'host';
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  });

  const canonicalQueryString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const signature = hmac(getSigningKey(secretKey, dateStamp, region, service), stringToSign, 'hex');
  params.set('X-Amz-Signature', signature);

  return {
    uploadUrl: `${endpoint.replace(/\/$/, '')}${canonicalUri}?${params.toString()}`,
    publicUrl: `${(process.env.S3_PUBLIC_URL || `${endpoint}/${bucket}`).replace(/\/$/, '')}/${encodedKey}`,
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    expiresIn: expires,
  };
};

export const createUploadUrl = catchAsync(async (req, res, next) => {
  const { schoolId, userId } = req.tenant;
  const input = validate(presignSchema, req.body);
  const client = await getClient();

  try {
    const bucket = process.env.S3_BUCKET;
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
    const objectKey = `${schoolId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    const signed = createPresignedPutUrl({
      bucket,
      key: objectKey,
      mimeType: input.mimeType,
    });

    await client.query('BEGIN');
    const file = await client.query(
      `INSERT INTO infrastructure.files
       (school_id, uploaded_by, file_url, type, object_key, bucket, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, file_url, type, object_key, status, created_at`,
      [schoolId, userId, signed.publicUrl, input.type, objectKey, bucket, input.mimeType, input.sizeBytes]
    );

    await auditLog(client, {
      schoolId,
      userId,
      action: 'CREATE',
      entityType: 'infrastructure.files',
      entityId: file.rows[0].id,
    });

    await client.query('COMMIT');
    res.status(201).json({ file: file.rows[0], upload: signed });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export const completeUpload = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const input = validate(completeSchema, req.body);

  const result = await query(
    `UPDATE infrastructure.files
     SET status = 'ready', file_url = $1
     WHERE id = $2 AND school_id = $3
     RETURNING id, file_url, type, object_key, status, created_at`,
    [input.fileUrl, input.fileId, schoolId]
  );

  if (result.rowCount === 0) throw new AppError('File not found for this school.', 404);
  res.json({ file: result.rows[0] });
});

export const listFiles = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const result = await query(
    `SELECT id, file_url, type, object_key, mime_type, size_bytes, status, created_at
     FROM infrastructure.files
     WHERE school_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [schoolId]
  );

  res.json({ files: result.rows });
});
