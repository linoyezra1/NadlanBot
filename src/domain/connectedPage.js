import fs from 'node:fs';
import path from 'node:path';

const ICON_NAMES = ['icon.png', 'icon.svg', 'icon.webp', 'icon.jpg', 'icon.jpeg', 'logo.png', 'logo.svg'];

export function brandIconUrl() {
  const dir = path.join(process.cwd(), 'public', 'brand');
  const found = ICON_NAMES.find((name) => fs.existsSync(path.join(dir, name)));
  return found ? `/brand/${found}` : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function connectedPage({ iconUrl = '', whatsappUrl = '', username = '' } = {}) {
  const mark = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="">`
    : '<span class="check" aria-hidden="true">✓</span>';
  const account = username
    ? `<p class="account">החשבון ${escapeHtml(username)} נוסף.</p>`
    : '';
  const back = whatsappUrl
    ? `<a class="back" href="${escapeHtml(whatsappUrl)}">חזרה לוואטסאפ</a>`
    : '<p class="back quiet">אפשר לחזור לוואטסאפ.</p>';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>החיבור הושלם</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: #1c1915;
      background:
        radial-gradient(circle at top, rgba(29, 106, 70, 0.16), transparent 42%),
        #f4f0e8;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .card {
      width: min(440px, 100%);
      background: #fffdf9;
      border: 1px solid #e6dfd4;
      border-radius: 28px;
      box-shadow: 0 18px 50px rgba(40, 32, 22, 0.08);
      padding: 36px 28px 28px;
      text-align: center;
    }
    .mark {
      width: 96px;
      height: 96px;
      margin: 0 auto 18px;
      border-radius: 28px;
      display: grid;
      place-items: center;
      background: #e5f3eb;
      overflow: hidden;
    }
    .mark img { width: 100%; height: 100%; object-fit: cover; }
    .check { color: #1d6a46; font-size: 42px; font-weight: 700; }
    .pill {
      display: inline-block;
      margin: 0 0 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e5f3eb;
      color: #1d6a46;
      font-size: 13px;
      font-weight: 700;
    }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: -0.03em; }
    p { margin: 0; color: #6f685f; line-height: 1.5; }
    .account { margin-top: 8px; color: #1c1915; }
    .nets { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 22px 0; }
    .nets span {
      background: #f3eee6;
      border-radius: 999px;
      padding: 6px 12px;
      color: #1c1915;
      font-size: 14px;
    }
    .back {
      display: inline-flex;
      margin-top: 8px;
      background: #1d6a46;
      color: white;
      text-decoration: none;
      border-radius: 999px;
      padding: 12px 22px;
      font-weight: 700;
    }
    .quiet { color: #6f685f; }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">${mark}</div>
    <div class="pill">מחובר</div>
    <h1>החיבור הושלם</h1>
    <p>פייסבוק, אינסטגרם וטיקטוק מחוברים. מעכשיו כל נכס שתפרסם יופץ לעמודים שלך.</p>
    ${account}
    <div class="nets"><span>פייסבוק</span><span>אינסטגרם</span><span>טיקטוק</span></div>
    ${back}
  </main>
</body>
</html>`;
}
