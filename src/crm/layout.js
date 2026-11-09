import { escapeHtml, href } from './format.js';

export function layout({ title, active, token, body, base = '', subtitle = 'האזור שלך' }) {
  const link = (path, label, key) => `<a class="${active === key ? 'active' : ''}" href="${href(token, path)}">${label}</a>`;
  const root = base || '/b';
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
    <div class="brand"><strong>נדל"ן</strong><span>${escapeHtml(subtitle)}</span></div>
    <nav>
      ${link(root, 'סקירה', 'home')}
      ${link(`${root}/properties`, 'נכסים', 'properties')}
      ${link(`${root}/leads`, 'לקוחות', 'leads')}
      ${link(`${root}/connect`, 'חיבור חשבונות', 'connect')}
    </nav>
  </aside>
  <main class="main">${body}</main>
</div>
</body>
</html>`;
}
