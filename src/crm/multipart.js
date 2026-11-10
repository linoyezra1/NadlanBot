const DEFAULT_MAX = 80 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export function uploadFailure(error) {
  if (error?.message === 'aborted' || error?.code === 'ECONNRESET' || error?.code === 'ECONNABORTED') {
    const aborted = new Error('ההעלאה נותקה לפני שהסרטון הגיע במלואו. השאירו את הדף פתוח עד שההעלאה מסתיימת.');
    aborted.status = 400;
    return aborted;
  }
  return error;
}

export function readMultipart(req, maxBytes = DEFAULT_MAX) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(uploadFailure(error));
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error('הקבצים גדולים מדי. סרטון אחד יכול להיות עד 50MB.');
        error.status = 413;
        fail(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('aborted', () => fail(Object.assign(new Error('aborted'), { code: 'ECONNABORTED' })));
    req.on('error', fail);
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(parseMultipart(Buffer.concat(chunks), req.headers['content-type'] || ''));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('הטופס לא הגיע כהעלאת קבצים');
  const boundary = Buffer.from(`--${(match[1] || match[2]).trim()}`);
  const fields = {};
  const files = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    const next = buffer.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    let part = buffer.subarray(start + boundary.length, next);
    if (part.subarray(0, 2).equals(Buffer.from('\r\n'))) part = part.subarray(2);
    if (part.length >= 2 && part.subarray(part.length - 2).equals(Buffer.from('\r\n'))) {
      part = part.subarray(0, part.length - 2);
    }
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep !== -1) {
      const header = part.subarray(0, sep).toString('utf8');
      const body = part.subarray(sep + 4);
      const name = /name="([^"]+)"/.exec(header)?.[1];
      const filename = filenameOf(header);
      const mime = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim() || 'application/octet-stream';
      const isFile = /filename\*?=/i.test(header);
      if (name && isFile) {
        if (filename && body.length) files.push({ field: name, filename, mimeType: mime, buffer: body });
      } else if (name) {
        fields[name] = body.toString('utf8');
      }
    }
    if (buffer.subarray(next + boundary.length, next + boundary.length + 2).equals(Buffer.from('--'))) break;
    start = next;
  }
  return { fields, files };
}

function filenameOf(header) {
  const star = /filename\*=UTF-8''([^;\r\n]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="([^"]*)"/.exec(header);
  return plain ? plain[1] : '';
}
