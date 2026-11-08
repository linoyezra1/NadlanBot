import { escapeHtml, href } from './format.js';

export function layout({ title, active, token, body }) {
  const link = (path, label, key) => `<a class="${active === key ? 'active' : ''}" href="${href(token, path)}">${label}</a>`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · נדל"ן</title>
  <link rel="stylesheet" href="/crm.css">
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="brand"><strong>נדל"ן</strong><span>מה שהבוט קלט</span></div>
    <nav>
      ${link('/', 'סקירה', 'home')}
      ${link('/properties', 'נכסים', 'properties')}
      ${link('/leads', 'לקוחות', 'leads')}
    </nav>
    <a class="ops" href="${href(token, '/admin')}">בדיקת וואטסאפ</a>
  </aside>
  <main class="main">${body}</main>
</div>
</body>
</html>`;
}
