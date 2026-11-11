import { escapeHtml, href } from './format.js';

const endScript = '<' + '/script>';

function icon(paths) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
  home: icon('<path d="M4 10.5 12 4l8 6.5"/><path d="M6 10v9h12v-9"/>'),
  properties: icon('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>'),
  leads: icon('<path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1"/><circle cx="10" cy="8" r="3"/><path d="M20 19v-1a3 3 0 0 0-2.2-2.9"/><path d="M16 5.1a3 3 0 0 1 0 5.8"/>'),
  calendar: icon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
  more: icon('<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>'),
  feed: icon('<path d="M5 6h14v9H8l-3 3V6z"/>'),
};

export function layout({ title, active, token, body, base = '', subtitle = 'האזור שלך' }) {
  const root = base || '/b';
  const link = (path, label, key, glyph) => {
    const on = active === key;
    return `<a class="${on ? 'active' : ''}" href="${href(token, path)}"${on ? ' aria-current="page"' : ''}>${glyph}<span>${label}</span></a>`;
  };
  const tab = (path, label, key, glyph) => {
    const on = active === key;
    return `<a class="${on ? 'active' : ''}" href="${href(token, path)}"${on ? ' aria-current="page"' : ''}>${glyph}<span>${label}</span></a>`;
  };
  const extra = base
    ? `<a href="${href(token, `${base}/properties/new`)}">דירה חדשה</a><a href="${href(token, `${base}/social-feed`)}">פעילות ברשתות</a><a href="${href(token, `${base}/connect`)}">חיבור חשבונות</a>`
    : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)} · נדל"ן</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="/crm.css">
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="brand"><strong>נדל"ן</strong><span>${escapeHtml(subtitle)}</span></div>
    <nav>
      ${link(root, 'דשבורד', 'home', ICONS.home)}
      ${link(`${root}/properties`, 'נכסים', 'properties', ICONS.properties)}
      ${link(`${root}/leads`, 'לידים', 'leads', ICONS.leads)}
      ${link(`${root}/calendar`, 'יומן', 'calendar', ICONS.calendar)}
      ${link(`${root}/social-feed`, 'פעילות ברשתות', 'feed', ICONS.feed)}
      ${link(`${root}/connect`, 'חיבור חשבונות', 'connect', ICONS.more)}
    </nav>
  </aside>
  <div class="workspace">
    <main class="main">${body}</main>
  </div>
</div>
<nav class="tabbar" aria-label="ניווט">
  ${tab(root, 'דשבורד', 'home', ICONS.home)}
  ${tab(`${root}/properties`, 'נכסים', 'properties', ICONS.properties)}
  ${tab(`${root}/leads`, 'לידים', 'leads', ICONS.leads)}
  ${tab(`${root}/calendar`, 'יומן', 'calendar', ICONS.calendar)}
  <button id="more-open" type="button">${ICONS.more}<span>עוד</span></button>
</nav>
<div class="more-sheet" id="more-sheet" hidden>
  <div class="more-panel" role="dialog" aria-label="עוד">
    <div class="more-handle"></div>
    ${extra}
    <button id="more-close" type="button">סגירה</button>
  </div>
</div>
<script>
  const moreSheet = document.getElementById('more-sheet');
  const setMore = (open) => { if (moreSheet) moreSheet.hidden = !open; };
  document.getElementById('more-open')?.addEventListener('click', () => setMore(true));
  document.getElementById('more-close')?.addEventListener('click', () => setMore(false));
  moreSheet?.addEventListener('click', (event) => { if (event.target === moreSheet) setMore(false); });
${endScript}
</body>
</html>`;
}
