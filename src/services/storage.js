import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { activeStorage, config } from '../config.js';

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

export function cloudinaryFolderName(value) {
  const cleaned = String(value || 'nadlanbot').trim().replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9/_-]/g, '');
  return cleaned || 'nadlanbot';
}

export function signedCloudinaryParams({ apiSecret, folder, publicId, timestamp, mode = 'dynamic' }) {
  const params = {
    public_id: publicId,
    timestamp,
  };
  const name = cloudinaryFolderName(folder);
  if (mode === 'fixed') params.folder = name;
  else params.asset_folder = name;
  const payload = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return {
    ...params,
    signature: crypto.createHash('sha1').update(payload + apiSecret).digest('hex'),
  };
}

function folderModes() {
  if (config.cloudinaryFolderMode === 'fixed') return ['fixed'];
  if (config.cloudinaryFolderMode === 'dynamic') return ['dynamic'];
  return ['dynamic', 'fixed'];
}

async function postCloudinary(file, mode) {
  const publicId = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}`;
  const signed = signedCloudinaryParams({
    apiSecret: config.cloudinaryApiSecret,
    folder: config.cloudinaryFolder,
    publicId,
    timestamp: Math.floor(Date.now() / 1000),
    mode,
  });
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimeType || 'application/octet-stream' }), file.filename || 'upload');
  form.append('api_key', config.cloudinaryApiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('public_id', signed.public_id);
  if (signed.asset_folder) form.append('asset_folder', signed.asset_folder);
  if (signed.folder) form.append('folder', signed.folder);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/auto/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok && Boolean(json.secure_url), json };
}

async function storeCloudinary(file) {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error('Cloudinary לא מוגדר. חסרים CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY או CLOUDINARY_API_SECRET.');
  }
  const modes = folderModes();
  let failure = 'העלאה ל-Cloudinary נכשלה';
  for (let index = 0; index < modes.length; index += 1) {
    const result = await postCloudinary(file, modes[index]);
    if (result.ok) return { url: result.json.secure_url, key: result.json.public_id };
    failure = result.json.error?.message || failure;
    const another = index < modes.length - 1;
    if (!another || !/folder/i.test(failure)) break;
  }
  throw new Error(failure);
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
  const provider = activeStorage();
  if (provider === 'cloudinary') return storeCloudinary(file);
  if (provider === 's3') return storeS3(file);
  return storeLocal(file);
}
