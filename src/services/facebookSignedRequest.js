import crypto from 'node:crypto';

const deletions = new Map();

export function parseSignedRequest(signedRequest, secret) {
  const [encodedSig, payload] = String(signedRequest || '').split('.');
  if (!encodedSig || !payload || !secret) return null;
  const sig = Buffer.from(encodedSig, 'base64url');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.algorithm !== 'HMAC-SHA256') return null;
    return data;
  } catch {
    return null;
  }
}

export function rememberDeletion(userId) {
  const code = crypto.randomBytes(9).toString('base64url');
  deletions.set(code, { userId: userId || null, at: new Date().toISOString() });
  return code;
}

export function deletionStatus(code) {
  return deletions.get(String(code || '')) || null;
}
