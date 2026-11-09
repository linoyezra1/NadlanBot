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
import { layout } from './layout.js';

function photo(url, label) {
  const image = url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label || '')}" onerror="this.classList.add('broken')">`
    : '';
  return `<div class="photo">${image}<div class="placeholder">אין תמונה</div></div>`;
}

function propertyCard(property, token) {
  const cover = property.media?.[0];
  const [statusLabel, tone] = propertyStatus(property.status);
  const leads = property.conversations || [];
  const hot = leads.filter((lead) => lead.status === 'converted_hot_lead').length;
  const bits = [
    property.rooms != null ? `${property.rooms} חדרים` : null,
    property.floor ? `קומה ${property.floor}` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ"ר` : null,
  ].filter(Boolean);
  return `<a class="card" href="${href(token, `/properties/${encodeURIComponent(property.code)}`)}">
    ${photo(cover?.cloudUrl, property.code)}
    <div class="body">
      <div class="code">${escapeHtml(property.code)} ${pill(statusLabel, tone)}</div>
      <div class="price">${escapeHtml(money(property.price))}</div>
      <div>${escapeHtml(property.address || place(property) || 'כתובת לא הוזנה')}</div>
      <div class="muted">${escapeHtml(place(property))}</div>
      <div class="facts">${bits.map((bit) => `<span class="chip">${escapeHtml(bit)}</span>`).join('')}</div>
      <div class="muted">${leads.length} לקוחות${hot ? ` · ${hot} לידים חמים` : ''}</div>
    </div>
  </a>`;
}

function personRow(lead, token) {
  const [label, tone] = leadStatus(lead.status);
  const snippet = String(lead.messages?.[0]?.text || lead.summary || '').replace(/\s+/g, ' ').trim();
  return `<a class="card person" href="${href(token, `/leads/${encodeURIComponent(lead.id)}`)}">
    <div>
      <strong>${escapeHtml(customerName(lead))}</strong>
      <span class="muted">${escapeHtml(formatPhone(lead.leadPhone))}</span>
    </div>
    <div>
      <div>${escapeHtml(lead.property?.code || 'בלי נכס')}</div>
      <div class="muted">${escapeHtml(snippet ? snippet.slice(0, 90) : 'אין עדיין סיכום')}</div>
    </div>
    <div>${pill(label, tone)}<div class="muted">${escapeHtml(formatWhen(lead.updatedAt))}</div></div>
  </a>`;
}

function page(token, title, active, body) {
  return layout({ title, active, token, body });
}

export function dashboardPage(token, data) {
  const recent = data.properties.length
    ? `<div class="cards">${data.properties.map((property) => propertyCard(property, token)).join('')}</div>`
    : '<div class="empty">עדיין אין נכסים. באזור האישי אפשר לפתוח דירה חדשה ולמלא את תעודת הנכס.</div>';
  const hot = data.hotLeads.length
    ? `<div class="people">${data.hotLeads.map((lead) => personRow(lead, token)).join('')}</div>`
    : '<div class="empty">אין עדיין ליד שביקש סיור או שיחה.</div>';
  return page(token, 'סקירה', 'home', `
    <header class="page-head">
      <div>
        <h1>סקירה</h1>
        <p>הנכסים שנקלטו, והלקוחות שפנו מהוואטסאפ.</p>
      </div>
      <a class="primary" href="${href(token, '/office')}">אזור אישי</a>
    </header>
    <section class="stats">
      <article class="stat"><span>נכסים</span><b>${data.propertyCount}</b></article>
      <article class="stat"><span>לקוחות</span><b>${data.leadCount}</b></article>
      <article class="stat hot"><span>לידים חמים</span><b>${data.hotCount}</b></article>
      <article class="stat"><span>שיחות פתוחות</span><b>${data.openCount}</b></article>
    </section>
    <div class="layout">
      <section class="panel"><h2>נכסים אחרונים</h2>${recent}</section>
      <section class="panel"><h2>לידים חמים</h2>${hot}</section>
    </div>`);
}

export function propertiesPage(token, properties, query) {
  const cards = properties.length
    ? `<div class="cards">${properties.map((property) => propertyCard(property, token)).join('')}</div>`
    : `<div class="empty">${query ? 'אין נכס שמתאים לחיפוש.' : 'עדיין אין נכסים. באזור האישי אפשר לפתוח דירה חדשה.'}</div>`;
  return page(token, 'נכסים', 'properties', `
    <header class="page-head">
      <div>
        <h1>נכסים</h1>
        <p>${properties.length} נכסים שמורים.</p>
      </div>
      <div class="actions">
        <a class="primary" href="${href(token, '/office')}">דירה חדשה</a>
        <form class="search" method="get" action="/properties">
          ${token ? `<input type="hidden" name="token" value="${escapeHtml(token)}">` : ''}
          <input name="q" value="${escapeHtml(query)}" placeholder="עיר, כתובת או APT-101">
          <button type="submit">חיפוש</button>
        </form>
      </div>
    </header>
    ${cards}`);
}

export function propertyPage(token, property, notice = '') {
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
    ? `<form class="sheet" method="post" enctype="multipart/form-data" action="${href(token, `/office/${property.broker.id}/properties/${encodeURIComponent(property.code)}/media`)}">
        <label class="field"><span>הוספת תמונות וסרטונים</span><input type="file" name="media" accept="image/*,video/*" multiple></label>
        <button class="primary" type="submit">העלאה</button>
      </form>`
    : '';
  const leads = property.conversations.length
    ? `<div class="people">${property.conversations.map((lead) => personRow({ ...lead, property, messages: [] }, token)).join('')}</div>`
    : '<div class="empty">אף לקוח עדיין לא פנה על הנכס הזה.</div>';
  const publications = property.publications.length
    ? `<ul>${property.publications.map((item) => `<li>${escapeHtml(item.platform)} · ${escapeHtml(item.status)}${item.error ? ` · ${escapeHtml(item.error)}` : ''}</li>`).join('')}</ul>`
    : '<p class="muted">הנכס עוד לא נשלח לרשתות.</p>';
  return page(token, property.code, 'properties', `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(property.code)}</h1>
        <p>${escapeHtml(addressLine(property))} ${pill(statusLabel, tone)}</p>
      </div>
      <div class="price">${escapeHtml(money(property.price))}</div>
    </header>
    <div class="split">
      <div>
        <section class="block"><h2>תמונות וסרטונים</h2>${notice ? `<div class="alert">${escapeHtml(notice)}</div>` : ''}${gallery}${upload}</section>
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
        </section>
      </div>
    </div>`);
}

function filters(token, current) {
  const items = [
    ['', 'הכל'],
    ['hot', 'ליד חם'],
    ['active', 'בשיחה'],
    ['closed', 'נסגר'],
  ];
  return `<nav class="filters">${items.map(([value, label]) => {
    const path = value ? `/leads?status=${value}` : '/leads';
    const active = (current || '') === value ? 'active' : '';
    return `<a class="${active}" href="${href(token, path)}">${label}</a>`;
  }).join('')}</nav>`;
}

export function leadsPage(token, leads, filter) {
  const empty = filter
    ? 'אין לקוחות בסינון הזה.'
    : 'עדיין לא הגיע לקוח מהוואטסאפ. כשמישהו נכנס מקישור המודעה, הוא מופיע כאן עם מה שהבוט ענה לו.';
  const rows = leads.length
    ? `<div class="people">${leads.map((lead) => personRow(lead, token)).join('')}</div>`
    : `<div class="empty">${empty}</div>`;
  return page(token, 'לקוחות', 'leads', `
    <header class="page-head">
      <div>
        <h1>לקוחות</h1>
        <p>פניות שנפתחו מול הבוט, עם כל השיחה.</p>
      </div>
    </header>
    ${filters(token, filter)}
    ${rows}`);
}

function messageItem(message) {
  const sender = ['lead', 'bot', 'notice'].includes(message.sender) ? message.sender : 'bot';
  const who = sender === 'lead' ? 'לקוח' : sender === 'notice' ? 'נשלח למתווך' : 'הבוט';
  const image = message.mediaUrl
    ? `<img src="${escapeHtml(message.mediaUrl)}" alt="" onerror="this.classList.add('broken')">`
    : '';
  return `<li class="msg ${sender}"><strong>${who}</strong>\n${escapeHtml(message.text || '')}${image}<time>${escapeHtml(formatWhen(message.timestamp))}</time></li>`;
}

export function leadPage(token, lead) {
  const [label, tone] = leadStatus(lead.status);
  const property = lead.property;
  const propertyBlock = property
    ? `<a class="card" href="${href(token, `/properties/${encodeURIComponent(property.code)}`)}">
        ${photo(property.media?.[0]?.cloudUrl, property.code)}
        <div class="mini"><div class="code">${escapeHtml(property.code)}</div><strong>${escapeHtml(money(property.price))}</strong><div>${escapeHtml(addressLine(property))}</div></div>
      </a>`
    : '<div class="empty">השיחה לא קושרה לנכס.</div>';
  const phone = lead.leadPhone || '';
  return page(token, customerName(lead), 'leads', `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(customerName(lead))} ${pill(label, tone)}</h1>
        <p class="row-links">
          <span>${escapeHtml(formatPhone(phone))}</span>
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
    </div>`);
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
  const alert = errors.length ? `<div class="alert">${errors.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>` : '';
  return page(token, 'דירה חדשה', 'office', `
    <header class="page-head">
      <div>
        <h1>דירה חדשה</h1>
        <p>תעודת הנכס של ${escapeHtml(broker.fullName)}. השדות עם כוכבית נדרשים.</p>
      </div>
    </header>
    ${alert}
    <form class="block sheet" method="post" enctype="multipart/form-data" action="${href(token, `/office/${broker.id}/properties`)}">
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
        ${yesNo('parking', 'חניה *', values.parking)}
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
      <label class="field"><span>תמונות וסרטונים</span><input type="file" name="media" accept="image/*,video/*" multiple><small>עד 20 קבצים.</small></label>
      <button class="primary" type="submit">שמירת הנכס</button>
    </form>`);
}

export function missingPage(token, active, title, text) {
  return page(token, title, active, `<header class="page-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div></header>`);
}
