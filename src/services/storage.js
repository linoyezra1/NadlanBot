import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

export function uploadsDir() {
  return config.uploadsDir || path.join(process.cwd(), 'uploads');
}

function extensionFor(mimeType, filename) {
  if (filename && path.extname(filename)) return path.extname(filename).slice(0, 8);
  return EXT_BY_MIME[mimeType] || '';
}

async function storeLocal({ buffer, mimeType, filename }) {
  const key = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}${extensionFor(mimeType, filename)}`;
  const full = path.join(uploadsDir(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return { url: `${config.publicBaseUrl}/media/${key}`, key };
}

function cloudinarySignature(params, secret) {
  const payload = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(payload + secret).digest('hex');
}

async function storeCloudinary({ buffer, mimeType, filename }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'nadlanbot';
  const signature = cloudinarySignature({ folder, timestamp }, config.cloudinaryApiSecret);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename || 'upload');
  form.append('api_key', config.cloudinaryApiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/auto/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.secure_url) {
    throw new Error(json.error?.message || 'העלאה ל-Cloudinary נכשלה');
  }
  return { url: json.secure_url, key: json.public_id };
}

async function storeS3({ buffer, mimeType, filename }) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const key = `nadlanbot/${new Date().getUTCFullYear()}/${crypto.randomUUID()}${extensionFor(mimeType, filename)}`;
  const client = new S3Client({
    region: config.s3Region,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
  });
  const input = {
    Bucket: config.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  };
  if (config.s3Acl) input.ACL = config.s3Acl;
  await client.send(new PutObjectCommand(input));
  const base = config.s3PublicBaseUrl || `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com`;
  return { url: `${base.replace(/\/$/, '')}/${key}`, key };
}

export async function storeBuffer(file) {
  const provider = config.storageProvider || 'local';
  if (provider === 'cloudinary') return storeCloudinary(file);
  if (provider === 's3') return storeS3(file);
  return storeLocal(file);
}
