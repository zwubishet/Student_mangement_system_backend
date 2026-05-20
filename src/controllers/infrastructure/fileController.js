import crypto from 'crypto';
import Joi from 'joi';
import path from 'path';
import { readFile } from 'fs/promises';
import { getClient, query } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/errors.js';
import { auditLog } from '../../utils/audit.js';
import { isS3Configured, saveLocalFile, UPLOAD_ROOT } from '../../services/localFileStorage.js';

const presignSchema = Joi.object({
  fileName: Joi.string().trim().min(1).max(180).required(),
  mimeType: Joi.string().trim().max(120).default('application/octet-stream'),
  sizeBytes: Joi.number().integer().min(1).max(25 * 1024 * 1024).required(),
  type: Joi.string().trim().max(80).default('document'),
  category: Joi.string().trim().max(50).optional(),
  linked_to_type: Joi.string().trim().max(30).optional(),
  linked_to_id: Joi.string().uuid().optional(),
});

const completeSchema = Joi.object({
  fileId: Joi.string().uuid().required(),
  fileUrl: Joi.string().uri().required(),
});

const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map((d) => d.message).join(', '), 400);
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
  const host = new URL(endpoint).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
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
  const canonicalRequest = ['PUT', canonicalUri, canonicalQueryString, `host:${host}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(secretKey, dateStamp, region, service), stringToSign, 'hex');
  params.set('X-Amz-Signature', signature);
  return {
    mode: 's3',
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
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
  const objectKey = `${schoolId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

  try {
    await client.query('BEGIN');
    let signed;
    let bucket;
    let publicUrl;

    if (isS3Configured()) {
      bucket = process.env.S3_BUCKET;
      signed = createPresignedPutUrl({ bucket, key: objectKey, mimeType: input.mimeType });
      publicUrl = signed.publicUrl;
    } else {
      bucket = 'local';
      const base = `${req.protocol}://${req.get('host')}`;
      publicUrl = `${base}/api/v1/files/serve/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
      signed = {
        mode: 'local',
        uploadUrl: `${base}/api/v1/files/upload-local`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        expiresIn: 900,
        note: 'Send file as base64 in JSON body after presign, or use upload-local endpoint',
      };
    }

    const file = await client.query(
      `INSERT INTO infrastructure.files
       (school_id, uploaded_by, file_url, type, object_key, bucket, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, file_url, type, object_key, status, created_at, mime_type, size_bytes`,
      [schoolId, userId, publicUrl, input.type, objectKey, bucket, input.mimeType, input.sizeBytes]
    );

    await auditLog(client, {
      schoolId,
      userId,
      action: 'CREATE',
      entityType: 'infrastructure.files',
      entityId: file.rows[0].id,
    });

    await client.query('COMMIT');
    sendSuccess(res, {
      file: file.rows[0],
      upload: { ...signed, fileId: file.rows[0].id, objectKey },
      storage_mode: isS3Configured() ? 's3' : 'local',
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/** Local dev upload when S3 is not configured */
export const uploadLocal = catchAsync(async (req, res) => {
  const { schoolId, userId } = req.tenant;
  const { fileId, contentBase64, fileName, mimeType } = req.body || {};
  if (!fileId || !contentBase64) {
    throw new AppError('fileId and contentBase64 are required for local upload.', 400);
  }

  const row = await query(
    `SELECT id, object_key, mime_type, school_id FROM infrastructure.files
     WHERE id = $1 AND school_id = $2 AND status = 'pending'`,
    [fileId, schoolId]
  );
  if (!row.rows[0]) throw new AppError('Pending file not found.', 404);

  const buffer = Buffer.from(contentBase64, 'base64');
  if (buffer.length > 25 * 1024 * 1024) {
    throw new AppError('File exceeds 25MB limit.', 400);
  }

  const saved = await saveLocalFile(schoolId, fileName || 'upload.bin', buffer);
  const result = await query(
    `UPDATE infrastructure.files
     SET status = 'ready', file_url = $1, object_key = $2, bucket = 'local', size_bytes = $3
     WHERE id = $4 AND school_id = $5
     RETURNING id, file_url, type, object_key, mime_type, size_bytes, status, created_at`,
    [saved.publicUrl, saved.objectKey, buffer.length, fileId, schoolId]
  );

  sendSuccess(res, { file: result.rows[0] });
});

export const serveFile = catchAsync(async (req, res, next) => {
  const key = req.params[0];
  if (!key || key.includes('..')) throw new AppError('Invalid path.', 400);

  const fileRow = await query(
    `SELECT object_key, mime_type, school_id FROM infrastructure.files
     WHERE object_key = $1 OR object_key LIKE $2 LIMIT 1`,
    [key, `%${key}`]
  );
  const resolvedKey = fileRow.rows[0]?.object_key || key;
  const fullPath = path.join(UPLOAD_ROOT, resolvedKey);

  try {
    const data = await readFile(fullPath);
    res.setHeader('Content-Type', fileRow.rows[0]?.mime_type || 'application/octet-stream');
    res.send(data);
  } catch {
    next(new AppError('File not found on disk.', 404));
  }
});

export const completeUpload = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const input = validate(completeSchema, req.body);

  const result = await query(
    `UPDATE infrastructure.files
     SET status = 'ready', file_url = $1
     WHERE id = $2 AND school_id = $3
     RETURNING id, file_url, type, object_key, status, created_at, mime_type, size_bytes`,
    [input.fileUrl, input.fileId, schoolId]
  );

  if (result.rowCount === 0) throw new AppError('File not found for this school.', 404);
  sendSuccess(res, { file: result.rows[0] });
});

export const listFiles = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const { type, status } = req.query;
  const conditions = ['school_id = $1'];
  const params = [schoolId];
  let idx = 2;
  if (type) { conditions.push(`type = $${idx++}`); params.push(type); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const result = await query(
    `SELECT id, file_url, type, object_key, mime_type, size_bytes, status, created_at, uploaded_by
     FROM infrastructure.files
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  );

  sendSuccess(res, { files: result.rows, storage_mode: isS3Configured() ? 's3' : 'local' });
});

export const removeFile = catchAsync(async (req, res) => {
  const { schoolId } = req.tenant;
  const result = await query(
    `UPDATE infrastructure.files SET status = 'deleted'
     WHERE id = $1 AND school_id = $2 RETURNING id`,
    [req.params.id, schoolId]
  );
  if (!result.rows[0]) throw new AppError('File not found.', 404);
  sendSuccess(res, { deleted: true });
});
