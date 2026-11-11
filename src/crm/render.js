import {
  addressLine,
  amenitiesLine,
  customerName,
  escapeHtml,
  formatPhone,
  formatWhen,
  href,
  leadStatus,
  money,
  pill,
  place,
  propertyStatus,
  tagLabel,
} from './format.js';
import { disclosureMode, parkingPhrase } from '../domain/disclosure.js';
import { hebrewPlatform, publicationLine } from '../domain/publicationText.js';
import { naturalWaLink } from '../domain/waLink.js';
import { leadContact } from '../services/socialFeed.js';
import { layout } from './layout.js';

function photo(url, label) {
  const image = url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label || '')}" onerror="this.classList.add('broken')">`
    : '';
  return `<div class="photo">${image}<div class="placeholder">אין תמונה</div></div>`;
}

function shareHref(property) {
  const customer = naturalWaLink(property);
  const lines = [[property.address, place(property)].filter(Boolean).join(', ') || property.code];
  if (disclosureMode(property.disclosure, 'price') === 'say' && property.price != null) lines.push(money(property.price));
  if (customer) lines.push(`לפרטים: ${customer}`);
  const text = lines.join('\n');
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function propertyCard(property, token, base = '') {
  const cover = property.media?.[0];
  const [statusLabel, tone] = propertyStatus(property.status);
  const leads = property.conversations || [];
  const leadCount = property._count?.conversations ?? leads.length;
  const hot = leads.length === leadCount ? leads.filter((lead) => lead.status === 'converted_hot_lead').length : 0;
  const deal = property.listingType === 'rent' ? 'להשכרה' : property.listingType === 'sale' ? 'למכירה' : null;
  const parking = property.amenities?.parking === true ? (parkingPhrase(property.amenities) || 'חניה') : null;
  const bits = [
    deal,
    property.rooms != null ? `${property.rooms} חדרים` : null,
    property.floor ? `קומה ${property.floor}` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ"ר` : null,
    parking,
  ].filter(Boolean);
  const open = href(token, `${base}/properties/${encodeURIComponent(property.code)}`);
  return `<article class="card">
    <a class="card-link" href="${open}">
      ${photo(cover?.cloudUrl, property.code)}
      <div class="body">
        <div class="code">${escapeHtml(property.code)} ${pill(statusLabel, tone)}</div>
        <div class="price">${escapeHtml(money(property.price))}</div>
        <div>${escapeHtml(property.address || place(property) || 'כתובת לא הוזנה')}</div>
        <div class="muted">${escapeHtml(place(property))}</div>
        <div class="facts">${bits.map((bit) => `<span class="chip">${escapeHtml(bit)}</span>`).join('')}</div>
        <div class="muted">${leadCount} לידים${hot ? ` · ${hot} חמים` : ''}${(property._count?.socialPosts || 0) ? ` · ${property._count.socialPosts} פורסמו` : ''}</div>
      </div>
    </a>
    <div class="card-actions">
      <a class="ghost" href="${shareHref(property)}" target="_blank" rel="noopener">שתף בוואטסאפ</a>
      <a class="ghost" href="${href(token, `${base}/social-feed?property=${encodeURIComponent(property.code)}`)}">מה שפורסם</a>
      <a class="primary" href="${open}#publish-form">פרסם</a>
    </div>
  </article>`;
}

function chatBadge(lead) {
  const until = lead?.botPausedUntil ? new Date(lead.botPausedUntil).getTime() : 0;
  if (until > Date.now()) return pill('המתווך בשיחה', 'hot');
  return pill('הבוט בשיחה', 'open');
}

function matchChips(lead) {
  const area = place(lead.property);
  const chips = [
    area ? `אזור ${area}` : null,
    lead.property?.price != null ? money(lead.property.price) : null,
  ].filter(Boolean);
  return chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
}

function personRow(lead, token, base = '') {
  const [label, tone] = leadStatus(lead.status);
  const snippet = String(lead.messages?.[0]?.text || lead.summary || '').replace(/\s+/g, ' ').trim();
  return `<a class="card person" href="${href(token, `${base}/leads/${encodeURIComponent(lead.id)}`)}">
    <div class="lead-top">
      <div>
        <strong>${escapeHtml(customerName(lead))}</strong>
        <span class="phone" dir="ltr">${escapeHtml(formatPhone(lead.leadPhone))}</span>
      </div>
      ${chatBadge(lead)}
    </div>
    <div class="facts">${matchChips(lead)}</div>
    <div class="lead-meta">
      <div>
        <div>${escapeHtml(lead.property?.code || 'בלי נכס')}</div>
        <div class="muted">${escapeHtml(snippet ? snippet.slice(0, 90) : 'אין עדיין סיכום')}</div>
      </div>
      <div>${pill(label, tone)}<div class="muted">${escapeHtml(formatWhen(lead.updatedAt))}</div></div>
    </div>
  </a>`;
}

function page(token, title, active, body, base = '', subtitle = 'האזור שלך') {
  return layout({ title, active, token, body, base, subtitle });
}

export function dashboardPage(token, data, base = '', subtitle = 'האזור שלך') {
  const recent = data.properties.length
    ? `<div class="cards">${data.properties.map((property) => propertyCard(property, token, base)).join('')}</div>`
    : '<div class="empty">עדיין אין נכסים. אפשר לפתוח דירה חדשה ולמלא את תעודת הנכס.</div>';
  const hot = data.hotLeads.length
    ? `<div class="people">${data.hotLeads.map((lead) => personRow(lead, token, base)).join('')}</div>`
    : '<div class="empty">אין עדיין ליד שביקש סיור או שיחה.</div>';
  const waOn = Boolean(data.broker?.isWhatsAppConnected);
  const waLabel = waOn ? 'וואטסאפ עסקי מחובר' : 'וואטסאפ עסקי לא מחובר';
  const waBadge = waOn ? '<span class="ok-badge">מחובר</span>' : '';
  return page(token, 'דשבורד', 'home', `
    <header class="page-head">
      <div>
        <h1>דשבורד</h1>
        <p>חיבור הוואטסאפ, לידים חדשים והסיורים הקרובים.</p>
      </div>
      <a class="primary" href="${href(token, `${base}/properties/new`)}">דירה חדשה</a>
    </header>
    <section class="status-grid">
      <a class="stat" href="${href(token, `${base}/connect`)}"><span>וואטסאפ</span>${waOn ? waBadge : '<b>לא מחובר</b>'}<span>${waLabel}</span></a>
      <article class="stat"><span>לידים חדשים היום</span><b>${data.todayCount || 0}</b></article>
      <a class="stat" href="${href(token, `${base}/calendar`)}"><span>סיורים קרובים</span><b>${data.hotCount}</b></a>
    </section>
    <section class="stats">
      <article class="stat"><span>נכסים</span><b>${data.propertyCount}</b></article>
      <article class="stat"><span>לידים</span><b>${data.leadCount}</b></article>
      <article class="stat"><span>לידים חמים</span><b>${data.hotCount}</b></article>
      <article class="stat"><span>שיחות פתוחות</span><b>${data.openCount}</b></article>
    </section>
    <div class="layout">
      <section class="panel"><h2>נכסים אחרונים</h2>${recent}</section>
      <section class="panel"><h2>סיורים קרובים</h2>${hot}</section>
    </div>`, base, subtitle);
}

export function propertiesPage(token, properties, query, base = '', subtitle = 'האזור שלך') {
  const cards = properties.length
    ? `<div class="cards">${properties.map((property) => propertyCard(property, token, base)).join('')}</div>`
    : `<div class="empty">${query ? 'אין נכס שמתאים לחיפוש.' : 'עדיין אין נכסים. אפשר לפתוח דירה חדשה.'}</div>`;
  return page(token, 'נכסים', 'properties', `
    <header class="page-head">
      <div>
        <h1>נכסים</h1>
        <p>${properties.length} דירות למכירה ולהשכרה.</p>
      </div>
      <div class="actions">
        <a class="primary" href="${href(token, `${base}/properties/new`)}">דירה חדשה</a>
        <form class="search" method="get" action="${href(token, `${base}/properties`)}">
          ${token ? `<input type="hidden" name="token" value="${escapeHtml(token)}">` : ''}
          <input name="q" value="${escapeHtml(query)}" placeholder="עיר, כתובת או APT-101">
          <button type="submit">חיפוש</button>
        </form>
      </div>
    </header>
    ${cards}`, base, subtitle);
}

function uploadGuard(formId) {
  const endScript = '<' + '/script>';
  return `<script>
    const uploadForm = document.getElementById(${JSON.stringify(formId)});
    const maxBytes = ${50 * 1024 * 1024};
    uploadForm?.addEventListener('submit', (event) => {
      if (uploadForm.dataset.busy === '1') {
        event.preventDefault();
        return;
      }
      const input = uploadForm.querySelector('input[type="file"]');
      const heavy = [...(input?.files || [])].find((file) => file.size > maxBytes);
      const status = uploadForm.querySelector('[data-upload-status]');
      if (heavy) {
        event.preventDefault();
        if (status) {
          status.hidden = false;
          status.textContent = 'הקובץ ' + heavy.name + ' גדול מ-50MB. קצרו את הסרטון לפני ההעלאה.';
        }
        return;
      }
      const chosen = input?.files?.length || 0;
      if (!chosen) return;
      uploadForm.dataset.busy = '1';
      const button = uploadForm.querySelector('button[type="submit"]');
      if (button) {
        button.textContent = 'מעלה קובץ...';
        setTimeout(() => { button.disabled = true; }, 0);
      }
    });
  ${endScript}`;
}

function publishButtons(token, base, code) {
  if (!base) return '';
  const action = href(token, `${base}/properties/${encodeURIComponent(code)}/publish`);
  const button = (platform, label) => `<button class="primary" name="platform" value="${platform}" type="submit">${label}</button>`;
  const endScript = '<' + '/script>';
  return `<form class="actions" id="publish-form" method="post" action="${action}">
    ${button('facebook', 'פרסם בפייסבוק')}
    ${button('instagram', 'פרסם באינסטגרם')}
    ${button('tiktok', 'פרסם בטיקטוק')}
  </form>
  <script>
    const publishForm = document.getElementById('publish-form');
    publishForm.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (publishForm.dataset.busy === '1') {
        event.preventDefault();
        return;
      }
      publishForm.dataset.busy = '1';
      for (const other of publishForm.querySelectorAll('button')) {
        if (other !== button) other.disabled = true;
      }
      button.textContent = 'מפרסם...';
    });
    publishForm.addEventListener('submit', () => {
      setTimeout(() => {
        for (const button of publishForm.querySelectorAll('button')) button.disabled = true;
      }, 0);
    });
  ${endScript}`;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function publishPopup(popup) {
  if (popup?.platform !== 'tiktok') return '';
  const url = httpsUrl(popup.url);
  const link = url
    ? `<a class="primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">לצפייה בסרטון בטיקטוק</a>`
    : '';
  const endScript = '<' + '/script>';
  return `<dialog class="publish-popup" open>
    <h2>הסרטון עלה לטיקטוק בהצלחה</h2>
    ${link}
    <form method="dialog"><button type="submit">סגירה</button></form>
  </dialog>
  <script>
    const publishPopup = document.querySelector('.publish-popup');
    publishPopup?.addEventListener('click', (event) => { if (event.target === publishPopup) publishPopup.close(); });
  ${endScript}`;
}

export function propertyPage(token, property, notice = '', base = '', subtitle = 'האזור שלך', popup = null) {
  const [statusLabel, tone] = propertyStatus(property.status);
  const bits = [
    ['סוג', property.listingType === 'rent' ? 'להשכרה' : property.listingType === 'sale' ? 'למכירה' : null],
    ['חדרים', property.rooms],
    ['קומה', property.floor],
    ['שטח', property.sizeSqm != null ? `${property.sizeSqm} מ"ר` : null],
    ['פינוי', property.vacancyDate],
    ['שכונה', property.neighborhood],
    ['עיר', property.city],
    ['מתווך', property.broker?.fullName],
  ].filter(([, value]) => value != null && value !== '');
  const amenity = amenitiesLine(property.amenities);
  const gallery = property.media.length
    ? `<div class="gallery">${property.media.map((item) => {
      const tags = Array.isArray(item.tags) ? item.tags.map(tagLabel).join(', ') : '';
      return `<figure><img src="${escapeHtml(item.cloudUrl)}" alt="${escapeHtml(item.caption || tags)}" onerror="this.classList.add('broken')"><figcaption>${escapeHtml(item.caption || tags || item.mediaType)}</figcaption></figure>`;
    }).join('')}</div>`
    : '<div class="empty">לנכס הזה עדיין אין מדיה.</div>';
  const upload = property.broker
    ? `<form class="sheet" id="media-upload" method="post" enctype="multipart/form-data" action="${href(token, `${base}/properties/${encodeURIComponent(property.code)}/media`)}">
        <label class="field"><span>הוספת תמונות וסרטונים</span><input type="file" name="media" accept="image/*,video/mp4,video/quicktime,.mp4,.mov" multiple><small>סרטון MP4 או MOV עד 50MB. השאירו את הדף פתוח עד סיום ההעלאה.</small></label>
        <p class="upload-status" data-upload-status hidden></p>
        <button class="primary" type="submit">העלאה</button>
        ${uploadGuard('media-upload')}
      </form>`
    : '';
  const leads = property.conversations.length
    ? `<div class="people">${property.conversations.map((lead) => personRow({ ...lead, property, messages: [] }, token, base)).join('')}</div>`
    : '<div class="empty">אף לקוח עדיין לא פנה על הנכס הזה.</div>';
  const publications = property.publications.length
    ? `<ul>${property.publications.map((item) => `<li>${escapeHtml(publicationLine(item))}</li>`).join('')}</ul>`
    : '<p class="muted">הנכס עוד לא נשלח לרשתות.</p>';
  const posted = (property.socialPosts || []).length
    ? `<ul>${property.socialPosts.map((post) => `<li><a href="${href(token, `${base}/social-feed?property=${encodeURIComponent(property.code)}`)}">${escapeHtml(hebrewPlatform(post.platform))} · ${escapeHtml(formatWhen(post.publishedAt))} · ${post._count?.comments || (post.comments || []).length} תגובות</a></li>`).join('')}</ul>`
    : '<p class="muted">אחרי פרסום מוצלח הפוסט יופיע כאן עם התגובות.</p>';
  return page(token, property.code, 'properties', `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(property.code)}</h1>
        <p>${escapeHtml(addressLine(property))} ${pill(statusLabel, tone)}</p>
        ${publishButtons(token, base, property.code)}
      </div>
      <div class="price">${escapeHtml(money(property.price))}</div>
    </header>
    <div class="split">
      <div>
        <section class="block"><h2>תמונות וסרטונים</h2>${publishPopup(popup)}${notice && !popup ? `<div class="alert${notice.includes('פרסום לטיקטוק נכשל') ? ' toast' : ''}" role="alert">${escapeHtml(notice)}</div>` : ''}${gallery}${upload}</section>
        <section class="block"><h2>לקוחות שפנו על הנכס</h2>${leads}</section>
      </div>
      <div>
        <section class="block">
          <h2>תעודת הנכס</h2>
          <dl class="kv">
            <dt>כתובת</dt><dd>${escapeHtml(property.address || '—')}</dd>
            ${bits.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}
            ${amenity ? `<dt>מאפיינים</dt><dd>${escapeHtml(amenity)}</dd>` : ''}
          </dl>
          ${property.featuresText ? `<p>${escapeHtml(property.featuresText)}</p>` : ''}
          ${disclosureForm(token, base, property)}
        </section>
        <section class="block private">
          <h2>בעלים, חסוי</h2>
          <dl class="kv">
            <dt>שם</dt><dd>${escapeHtml(property.owner?.ownerName || '—')}</dd>
            <dt>טלפון</dt><dd>${escapeHtml(formatPhone(property.owner?.ownerPhone) || '—')}</dd>
            <dt>הערות</dt><dd>${escapeHtml(property.owner?.privateNotes || '—')}</dd>
          </dl>
        </section>
        <section class="block">
          <h2>פרסום</h2>
          ${property.marketingText ? `<p class="handed">${escapeHtml(property.marketingText)}</p>` : ''}
          ${publications}
          <h2>מה שפורסם</h2>
          ${posted}
        </section>
      </div>
    </div>`, base, subtitle);
}

function filters(token, current, base = '') {
  const items = [
    ['', 'הכל'],
    ['hot', 'ליד חם'],
    ['active', 'בשיחה'],
    ['closed', 'נסגר'],
  ];
  return `<nav class="filters">${items.map(([value, label]) => {
    const path = value ? `${base}/leads?status=${value}` : `${base}/leads`;
    const active = (current || '') === value ? 'active' : '';
    return `<a class="${active}" href="${href(token, path)}">${label}</a>`;
  }).join('')}</nav>`;
}

export function leadsPage(token, leads, filter, base = '', subtitle = 'האזור שלך') {
  const empty = filter
    ? 'אין לקוחות בסינון הזה.'
    : 'עדיין לא הגיע לקוח מהוואטסאפ. כשמישהו נכנס מקישור המודעה, הוא מופיע כאן עם מה שהבוט ענה לו.';
  const rows = leads.length
    ? `<div class="people">${leads.map((lead) => personRow(lead, token, base)).join('')}</div>`
    : `<div class="empty">${empty}</div>`;
  return page(token, 'לידים', 'leads', `
    <header class="page-head">
      <div>
        <h1>לידים</h1>
        <p>לקוחות פעילים, הנכס שמתאים להם, ומי מנהל את השיחה.</p>
      </div>
    </header>
    ${filters(token, filter, base)}
    ${rows}`, base, subtitle);
}

const ORIGINAL = {
  facebook: 'צפה בפוסט המקורי בפייסבוק',
  instagram: 'צפה בפוסט המקורי באינסטגרם',
  tiktok: 'צפה בסרטון המקורי בטיקטוק',
};

function socialCard(post, token, base) {
  const name = post.broker?.businessName || post.broker?.fullName || 'הדף';
  const initial = name.trim().charAt(0) || 'נ';
  const kind = ['facebook', 'instagram', 'tiktok'].includes(post.platform) ? post.platform : 'social';
  const comments = post.comments || [];
  const image = post.imageUrl
    ? `<img class="fb-photo" src="${escapeHtml(post.imageUrl)}" alt="" onerror="this.classList.add('broken')">`
    : '';
  const link = post.permalink
    ? `<a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">${ORIGINAL[kind] || 'צפה בפוסט המקורי'}</a>`
    : '';
  const property = post.property?.code
    ? `<a href="${href(token, `${base}/properties/${encodeURIComponent(post.property.code)}`)}">${escapeHtml(post.property.code)}</a>`
    : '';
  const thread = comments.map((comment) => {
    const digits = String(leadContact(post, comment) || '').replace(/\D/g, '');
    const reply = comment.botReplyText
      ? `<div class="fb-reply"><span class="ai-badge">תג AI</span><p>${escapeHtml(comment.botReplyText)}</p></div>`
      : '';
    const wa = digits ? `<a class="primary" href="https://wa.me/${escapeHtml(digits)}">צור קשר עם הליד בוואטסאפ</a>` : '';
    return `<div class="fb-comment"><strong>${escapeHtml(comment.authorName)}</strong><p>${escapeHtml(comment.text)}</p>${reply}${wa}</div>`;
  }).join('');
  return `<article class="fb-post">
    <header class="fb-head">
      <div class="fb-avatar">${escapeHtml(initial)}</div>
      <div>
        <strong>${escapeHtml(name)}</strong>
        <div class="muted">${escapeHtml(formatWhen(post.publishedAt))} · ${escapeHtml(hebrewPlatform(post.platform))}</div>
      </div>
      <span class="net ${kind}">${kind === 'facebook' ? 'f' : kind === 'instagram' ? 'ig' : kind === 'tiktok' ? 'tt' : 'ר'}</span>
    </header>
    <p class="fb-text">${escapeHtml(post.content || '')}</p>
    ${image}
    <div class="fb-bar">${link}<span>${comments.length} תגובות</span>${property}</div>
    <div class="fb-comments">${thread || '<p class="muted">עדיין אין תגובות על הפוסט הזה.</p>'}</div>
  </article>`;
}

export function socialFeedPage(token, posts, base = '', subtitle = 'האזור שלך', propertyCode = '') {
  const rows = posts.length
    ? `<div class="feed">${posts.map((post) => socialCard(post, token, base)).join('')}</div>`
    : '<div class="empty">עדיין אין פוסטים. אחרי פרסום לפייסבוק, אינסטגרם או טיקטוק הם יופיעו כאן עם התגובות והמענה של הבוט.</div>';
  const intro = propertyCode
    ? `פוסטים של נכס ${escapeHtml(propertyCode)}.`
    : 'כל פוסט שעולה לפייסבוק, אינסטגרם או טיקטוק, עם התגובות והמענה שנשלח.';
  return page(token, 'פעילות ברשתות', 'feed', `
    <header class="page-head">
      <div>
        <h1>פעילות ברשתות</h1>
        <p>${intro}</p>
      </div>
    </header>
    ${rows}`, base, subtitle);
}

export function calendarPage(token, leads, base = '', subtitle = 'האזור שלך') {
  const rows = leads.length
    ? `<div class="people">${leads.map((lead) => personRow(lead, token, base)).join('')}</div>`
    : '<div class="empty">אין עדיין סיור או שיחה ביומן. ליד חם שביקש סיור מופיע כאן.</div>';
  return page(token, 'יומן', 'calendar', `
    <header class="page-head">
      <div>
        <h1>יומן</h1>
        <p>סיורים ושיחות שלידים חמים ביקשו.</p>
      </div>
    </header>
    ${rows}`, base, subtitle);
}

function messageItem(message) {
  const sender = ['lead', 'bot', 'notice'].includes(message.sender) ? message.sender : 'bot';
  const who = sender === 'lead' ? 'לקוח' : sender === 'notice' ? 'נשלח למתווך' : 'הבוט';
  const image = message.mediaUrl
    ? `<img src="${escapeHtml(message.mediaUrl)}" alt="" onerror="this.classList.add('broken')">`
    : '';
  return `<li class="msg ${sender}"><strong>${who}</strong>\n${escapeHtml(message.text || '')}${image}<time>${escapeHtml(formatWhen(message.timestamp))}</time></li>`;
}

export function leadPage(token, lead, base = '', subtitle = 'האזור שלך') {
  const [label, tone] = leadStatus(lead.status);
  const property = lead.property;
  const propertyBlock = property
    ? `<a class="card" href="${href(token, `${base}/properties/${encodeURIComponent(property.code)}`)}">
        ${photo(property.media?.[0]?.cloudUrl, property.code)}
        <div class="mini"><div class="code">${escapeHtml(property.code)}</div><strong>${escapeHtml(money(property.price))}</strong><div>${escapeHtml(addressLine(property))}</div></div>
      </a>`
    : '<div class="empty">השיחה לא קושרה לנכס.</div>';
  const phone = lead.leadPhone || '';
  return page(token, customerName(lead), 'leads', `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(customerName(lead))} ${pill(label, tone)} ${chatBadge(lead)}</h1>
        <p class="row-links">
          <span class="phone" dir="ltr">${escapeHtml(formatPhone(phone))}</span>
          ${phone ? `<a href="https://wa.me/${escapeHtml(phone.replace(/\D/g, ''))}">וואטסאפ</a>` : ''}
          ${phone ? `<a href="tel:+${escapeHtml(phone.replace(/\D/g, ''))}">חיוג</a>` : ''}
        </p>
      </div>
      <div class="muted">עודכן ${escapeHtml(formatWhen(lead.updatedAt))}</div>
    </header>
    <div class="split">
      <div>
        <section class="block"><h2>כל השיחה</h2><ol class="thread">${lead.messages.map(messageItem).join('') || '<li class="muted">אין הודעות</li>'}</ol></section>
      </div>
      <div>
        ${lead.summary ? `<section class="block"><h2>סיכום ליד חם</h2><div class="handed">${escapeHtml(lead.summary)}</div></section>` : ''}
        <section class="block"><h2>הנכס בשיחה</h2>${propertyBlock}</section>
      </div>
    </div>`, base, subtitle);
}

const NETWORKS = {
  facebook: 'פייסבוק',
  instagram: 'אינסטגרם',
  tiktok: 'טיקטוק',
};

function networkLine(broker) {
  const names = (broker.connectedNetworks || []).map((item) => NETWORKS[item] || item);
  if (broker.socialConnected) return names.length ? `מחובר: ${names.join(', ')}` : 'החשבונות מחוברים.';
  return 'החשבונות עדיין לא מחוברים.';
}

function textField(name, label, value, extra = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" value="${escapeHtml(value ?? '')}" ${extra}></label>`;
}

function areaField(name, label, value) {
  return `<label class="field"><span>${label}</span><textarea name="${name}">${escapeHtml(value ?? '')}</textarea></label>`;
}

function yesNo(name, label, value) {
  return `<fieldset class="field"><legend>${label}</legend><div class="yesno">
    <label><input type="radio" name="${name}" value="yes" ${value === 'yes' ? 'checked' : ''}> יש</label>
    <label><input type="radio" name="${name}" value="no" ${value === 'no' ? 'checked' : ''}> אין</label>
  </div></fieldset>`;
}

function parkingChoice(value) {
  const options = [
    ['tabu', 'יש חנייה, בטאבו'],
    ['building', 'חניון בניין, לא בטאבו'],
    ['no', 'אין חנייה'],
  ];
  return `<fieldset class="field"><legend>חניה *</legend><div class="yesno">
    ${options.map(([id, label]) => `<label><input type="radio" name="parking" value="${id}" ${value === id ? 'checked' : ''} required> ${label}</label>`).join('')}
  </div></fieldset>`;
}

function exposureText(property, name) {
  const amenities = property.amenities || {};
  const amenity = (key, yes, no) => (amenities[key] === true ? yes : amenities[key] === false ? no : 'לא צוין');
  if (name === 'price') return property.price == null ? 'לא צוין' : money(property.price);
  if (name === 'rooms') return property.rooms == null ? 'לא צוין' : `${property.rooms} חדרים`;
  if (name === 'floor') return property.floor ? `קומה ${property.floor}` : 'לא צוין';
  if (name === 'size') return property.sizeSqm == null ? 'לא צוין' : `${property.sizeSqm} מ"ר`;
  if (name === 'address') {
    const line = [property.address, property.neighborhood].filter(Boolean).join(', ');
    return [line, property.city ? `(${property.city})` : ''].filter(Boolean).join(' ') || 'לא צוין';
  }
  if (name === 'parking') return parkingPhrase(amenities) || 'לא צוין';
  if (name === 'elevator') return amenity('elevator', 'יש מעלית', 'אין מעלית');
  if (name === 'mamad') return amenity('mamad', 'יש ממ"ד', 'אין ממ"ד');
  if (name === 'balcony') return amenity('balcony', 'יש מרפסת', 'אין מרפסת');
  return property.featuresText || 'לא צוין';
}

function exposureOn(property, keys) {
  return keys.every((key) => disclosureMode(property.disclosure, key) === 'say');
}

function disclosureForm(token, base, property) {
  const rows = [
    ['price', 'מחיר', ['price']],
    ['rooms', 'חדרים', ['rooms']],
    ['floor', 'קומה', ['floor']],
    ['size', 'שטח (מ"ר)', ['sizeSqm']],
    ['address', 'כתובת ושכונה', ['address', 'neighborhood', 'city']],
    ['parking', 'חניה', ['parking']],
    ['elevator', 'מעלית', ['elevator']],
    ['mamad', 'ממ"ד', ['mamad']],
    ['balcony', 'מרפסת', ['balcony']],
    ['features', 'יתרונות ומאפיינים', ['featuresText']],
  ];
  const list = rows.map(([name, label, keys]) => `<div class="exposure-row">
      <div class="field-info">
        <span class="field-label">${label}</span>
        <span class="field-val">${escapeHtml(exposureText(property, name))}</span>
      </div>
      <label class="switch">
        <input type="checkbox" name="expose_${name}" value="on" ${exposureOn(property, keys) ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>`).join('');
  return `<form class="property-exposure-card" method="post" action="${href(token, `${base}/properties/${encodeURIComponent(property.code)}/card`)}">
    <div class="card-header">
      <h3>הגדרות חשיפת פרטי נכס</h3>
      <p>בחר אילו פרטים הבוט יציג ללקוחות ובפוסטים ברשתות</p>
    </div>
    <input type="hidden" name="exposureForm" value="1">
    <div class="exposure-list">${list}</div>
    <button type="submit" class="save-btn">שמירת הגדרות חשיפה</button>
  </form>`;
}

export function brokersPage(token, brokers) {
  const cards = brokers.length
    ? `<div class="people">${brokers.map((broker) => `<a class="card person" href="${href(token, `/office/${broker.id}`)}">
        <div><strong>${escapeHtml(broker.fullName)}</strong><span class="muted">${escapeHtml(broker.businessName || '')}</span></div>
        <div class="muted">${escapeHtml(formatPhone(broker.phoneNumber))}</div>
        <div>${broker._count?.properties || 0} נכסים</div>
      </a>`).join('')}</div>`
    : '<div class="empty">אין עדיין מתווך רשום במערכת.</div>';
  return page(token, 'אזור אישי', 'office', `
    <header class="page-head">
      <div><h1>אזור אישי</h1><p>בחרו מתווך כדי לפתוח דירה, להעלות מדיה ולחבר חשבונות.</p></div>
      <a class="primary" href="${href(token, '/office/brokers/new')}">פתיחת מתווך</a>
    </header>
    ${cards}`);
}

export function brokerFormPage(token, { errors = [], values = {} } = {}) {
  const alert = errors.length ? `<div class="alert">${errors.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>` : '';
  return page(token, 'פתיחת מתווך', 'office', `
    <header class="page-head">
      <div>
        <h1>פתיחת מתווך</h1>
        <p>הבוט מזהה מתווך לפי המספר. אחרי השמירה, הודעה מהמספר הזה יכולה להתחיל ב«דירה חדשה».</p>
      </div>
    </header>
    ${alert}
    <form class="block sheet" method="post" action="${href(token, '/office/brokers')}">
      <label class="field"><span>שם מלא *</span><input name="fullName" value="${escapeHtml(values.fullName || '')}" required></label>
      <label class="field"><span>טלפון וואטסאפ *</span><input name="phone" value="${escapeHtml(values.phone || '')}" placeholder="050-1234567" required></label>
      <label class="field"><span>שם המשרד</span><input name="businessName" value="${escapeHtml(values.businessName || '')}"></label>
      <button class="primary" type="submit">שמירה</button>
    </form>`);
}

export function officePage(token, broker, notice = '') {
  const cards = broker.properties.length
    ? `<div class="cards">${broker.properties.map((property) => propertyCard(property, token)).join('')}</div>`
    : '<div class="empty">עדיין אין נכסים. לחצו דירה חדשה ומלאו את תעודת הנכס.</div>';
  return page(token, broker.fullName, 'office', `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(broker.fullName)}</h1>
        <p>${escapeHtml(broker.businessName || 'אזור אישי')} · ${escapeHtml(networkLine(broker))}</p>
      </div>
      <div class="actions">
        <a class="primary" href="${href(token, `/office/${broker.id}/properties/new`)}">דירה חדשה</a>
        <a class="primary" href="${href(token, `/office/${broker.id}/connect`)}">חיבור חשבונות</a>
        <a class="primary" href="${href(token, '/office/brokers/new')}">פתיחת מתווך</a>
      </div>
    </header>
    ${notice ? `<div class="alert">${escapeHtml(notice)}</div>` : ''}
    <section class="panel"><h2>הנכסים שלי</h2>${cards}</section>`);
}

export function propertyFormPage(token, broker, { errors = [], values = {} } = {}) {
  const base = `/b/${broker.id}`;
  const alert = errors.length ? `<div class="alert">${errors.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>` : '';
  return page(token, 'דירה חדשה', 'properties', `
    <header class="page-head">
      <div>
        <h1>טופס קליטת נכס</h1>
        <p>ממלאים כאן את כל הפרטים במקום בצ'אט. אחרי השמירה הדירה מופיעה באזור האישי.</p>
      </div>
    </header>
    ${alert}
    <form class="block sheet" id="property-form" method="post" enctype="multipart/form-data" action="${href(token, `${base}/properties`)}">
      <fieldset class="field">
        <legend>למכירה או להשכרה *</legend>
        <div class="yesno">
          <label><input type="radio" name="listingType" value="sale" ${values.listingType === 'sale' ? 'checked' : ''} required> למכירה</label>
          <label><input type="radio" name="listingType" value="rent" ${values.listingType === 'rent' ? 'checked' : ''}> להשכרה</label>
        </div>
      </fieldset>
      <div class="grid-2">
        ${textField('address', 'כתובת *', values.address, 'required')}
        ${textField('city', 'עיר *', values.city, 'required')}
        ${textField('neighborhood', 'שכונה', values.neighborhood)}
        ${textField('rooms', 'חדרים *', values.rooms, 'required inputmode="decimal"')}
        ${textField('floor', 'קומה', values.floor)}
        ${textField('sizeSqm', 'מ"ר', values.sizeSqm, 'inputmode="decimal"')}
        ${textField('price', 'מחיר *', values.price, 'required inputmode="numeric"')}
        ${textField('vacancyDate', 'תאריך פינוי', values.vacancyDate)}
      </div>
      <div class="grid-2">
        ${parkingChoice(values.parking)}
        ${yesNo('elevator', 'מעלית *', values.elevator)}
        ${yesNo('balcony', 'מרפסת *', values.balcony)}
        ${yesNo('mamad', 'ממ"ד *', values.mamad)}
      </div>
      ${areaField('featuresText', 'יתרונות לפרסום', values.featuresText)}
      <section class="private">
        <h2>בעלים, חסוי</h2>
        <div class="grid-2">
          ${textField('ownerName', 'שם בעל הנכס', values.ownerName)}
          ${textField('ownerPhone', 'טלפון בעל הנכס', values.ownerPhone)}
        </div>
        ${areaField('privateNotes', 'הערות אישיות', values.privateNotes)}
      </section>
      <label class="field"><span>תמונות וסרטונים</span><input type="file" name="media" accept="image/*,video/mp4,video/quicktime,.mp4,.mov" multiple><small>עד 20 קבצים. סרטון MP4 או MOV עד 50MB.</small></label>
      <p class="upload-status" data-upload-status hidden></p>
      <button class="primary" type="submit">שמירת הנכס</button>
      ${uploadGuard('property-form')}
    </form>`, base, broker.fullName);
}

const CONNECT_BUTTONS = [
  ['facebook', 'פייסבוק'],
  ['instagram', 'אינסטגרם'],
  ['tiktok', 'טיקטוק'],
];

export function connectPage(token, broker, notice = '') {
  const base = `/b/${broker.id}`;
  const connected = new Set(broker.connectedNetworks || []);
  const buttons = CONNECT_BUTTONS.map(([id, label]) => {
    const on = connected.has(id);
    const badge = on ? '<span class="ok-badge">מחובר</span>' : '';
    const text = on ? label : `חיבור ${label}`;
    if (notice) return `<span class="primary">${text}${badge}</span>`;
    return `<a class="primary" href="${href(token, `${base}/connect/${id}`)}">${text}${badge}</a>`;
  }).join('');
  const whatsapp = broker.isWhatsAppConnected
    ? '<span class="primary">וואטסאפ עסקי <span class="ok-badge">מחובר</span></span>'
    : `<a class="primary" href="/connect?brokerId=${encodeURIComponent(broker.id)}">חבר את ה-WhatsApp העסקי שלך ל-NadlanBot</a>`;
  return page(token, 'חיבור חשבונות', 'connect', `
    <header class="page-head">
      <div>
        <h1>חיבור חשבונות</h1>
        <p>כל כפתור פותח את החיבור של הרשת שלו: פייסבוק, אינסטגרם או טיקטוק. וואטסאפ עסקי נשאר פעיל גם בנייד.</p>
      </div>
    </header>
    ${notice ? `<div class="alert">${escapeHtml(notice)}</div>` : ''}
    <div class="connect-wrap">
      <section class="connect-card">
        <h2>חשבונות</h2>
        <div class="connect-list">${buttons}${whatsapp}</div>
      </section>
    </div>`, base, broker.fullName);
}

export function missingPage(token, active, title, text) {
  return page(token, title, active, `<header class="page-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div></header>`);
}
