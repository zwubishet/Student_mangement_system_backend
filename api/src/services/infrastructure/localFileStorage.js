import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = process.env.LOCAL_UPLOAD_DIR
  || path.join(__dirname, '../../uploads');

export const isS3Configured = () => Boolean(
  process.env.S3_ENDPOINT
  && process.env.S3_BUCKET
  && process.env.S3_ACCESS_KEY_ID
  && process.env.S3_SECRET_ACCESS_KEY
);

export const saveLocalFile = async (schoolId, fileName, buffer) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
  const objectKey = `${schoolId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
  const fullPath = path.join(UPLOAD_ROOT, objectKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  const base = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3003}`;
  const publicUrl = `${base.replace(/\/$/, '')}/api/v1/files/serve/${encodeURIComponent(objectKey)}`;
  return { objectKey, publicUrl, bucket: 'local', fullPath };
};
