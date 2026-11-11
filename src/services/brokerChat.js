import { prisma } from '../db.js';
import { logger } from '../logger.js';

const STEP_LABELS = {
  media: 'ממתין לתמונות',
  details: 'הזנת נכס חדש',
  edit: 'עריכת נכס',
  preview: 'תצוגה מקדימה',
  publish_ask: 'ממתין לאישור פרסום',
  marketing: 'אישור נוסח',
  channels: 'הפצה לפייסבוק',
  groups: 'הפצה לפייסבוק',
};

export function brokerStepLabel(step) {
  return STEP_LABELS[step] || '';
}

function clip(value) {
  return String(value || '').slice(0, 4000);
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

function when(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export async function recordBrokerExchange({ brokerId, event, replies, conversationId }) {
  if (!brokerId) return;
  if (event) {
    let mediaUrl = event.media?.url || null;
    if (event.media && conversationId) {
      const stored = await prisma.propertyMedia.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: { cloudUrl: true },
      });
      if (stored?.cloudUrl) mediaUrl = stored.cloudUrl;
    }
    const text = clip(event.text || event.media?.caption || '');
    if (text || mediaUrl) {
      await prisma.brokerChatMessage.create({
        data: { brokerId, sender: 'BROKER', text, mediaUrl },
      });
    }
  }
  for (const reply of replies || []) {
    const text = clip(reply.text || reply.caption || '');
    const mediaUrl = reply.url || null;
    if (!text && !mediaUrl) continue;
    await prisma.brokerChatMessage.create({
      data: { brokerId, sender: 'BOT', text, mediaUrl },
    });
  }
}

export async function rememberBrokerChat(event, result) {
  try {
    const broker = event?.from
      ? await prisma.broker.findUnique({ where: { phoneNumber: event.from }, select: { id: true } })
      : null;
    if (broker) {
      await recordBrokerExchange({
        brokerId: broker.id,
        event,
        replies: result?.replies,
        conversationId: result?.conversationId,
      });
    }
    for (const note of result?.notifications || []) {
      const phone = String(note.to || '');
      if (!phone || phone === event?.from) continue;
      const target = await prisma.broker.findUnique({ where: { phoneNumber: phone }, select: { id: true } });
      if (!target) continue;
      await recordBrokerExchange({ brokerId: target.id, replies: note.replies });
    }
  } catch (error) {
    logger.error('broker chat log failed', error.message);
  }
}

export async function backfillBrokerChat(brokerId) {
  const rows = await prisma.message.findMany({
    where: {
      conversation: { brokerId, role: 'broker' },
      sender: { in: ['broker', 'bot'] },
    },
    orderBy: { timestamp: 'asc' },
    take: 400,
    select: { sender: true, text: true, mediaUrl: true, timestamp: true },
  });
  if (!rows.length) return;
  const existing = await prisma.brokerChatMessage.findMany({
    where: { brokerId },
    select: { sender: true, text: true, createdAt: true },
  });
  const seen = new Set(existing.map((row) => `${row.sender}|${new Date(row.createdAt).toISOString()}|${row.text || ''}`));
  const fresh = rows.filter((row) => {
    const sender = row.sender === 'broker' ? 'BROKER' : 'BOT';
    return !seen.has(`${sender}|${new Date(row.timestamp).toISOString()}|${row.text || ''}`);
  });
  if (!fresh.length) return;
  await prisma.brokerChatMessage.createMany({
    data: fresh.map((row) => ({
      brokerId,
      sender: row.sender === 'broker' ? 'BROKER' : 'BOT',
      text: row.text || '',
      mediaUrl: row.mediaUrl,
      createdAt: row.timestamp,
    })),
  });
}

export function brokerChatPage({ broker, brokers, messages, step }) {
  const label = brokerStepLabel(step);
  const rows = (brokers || []).map((item) => {
    const last = item.chatMessages?.[0]?.createdAt || item.conversations?.[0]?.updatedAt;
    const on = item.id === broker.id;
    const initial = String(item.fullName || '?').trim().charAt(0);
    return `<a class="who${on ? ' on' : ''}" href="/admin/brokers/${escapeHtml(item.id)}/chat">
      <span class="avatar">${escapeHtml(initial)}</span>
      <span>
        <strong>${escapeHtml(item.fullName)}</strong>
        <small dir="ltr">${escapeHtml(item.phoneNumber)}</small>
        <small>${last ? escapeHtml(when(last)) : 'אין פעילות'}</small>
      </span>
      <i class="${last && Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000 ? 'live' : ''}"></i>
    </a>`;
  }).join('');
  const bubbles = (messages || []).map((message) => {
    const side = message.sender === 'BOT' ? 'bot' : 'broker';
    const image = message.mediaUrl
      ? `<a href="${escapeHtml(message.mediaUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(message.mediaUrl)}" alt="תמונה מהשיחה"></a>`
      : '';
    return `<article class="bubble ${side}">${image}${message.text ? `<p>${escapeHtml(message.text)}</p>` : ''}<time>${escapeHtml(when(message.createdAt))}</time></article>`;
  }).join('');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>שיחה עם ${escapeHtml(broker.fullName)}</title>
  <style>
    body { margin: 0; overflow-x: hidden; width: 100%; max-width: 100vw; font-family: "Segoe UI", Arial, sans-serif; background: #efeae2; color: #111; }
    .audit { display: grid; grid-template-columns: 280px minmax(0, 1fr); height: 100vh; width: 100%; max-width: 100%; }
    .menu-btn { display: none; min-height: 44px; margin-top: 8px; padding: 8px 14px; border: 0; border-radius: 999px; background: #111; color: #fff; }
    .people { background: #fff; border-left: 1px solid #ddd; overflow: auto; }
    .people h1 { font-size: 18px; margin: 16px; }
    .people h1 a { color: inherit; text-decoration: none; }
    .who { display: flex; gap: 10px; align-items: center; padding: 12px 14px; text-decoration: none; color: inherit; border-bottom: 1px solid #f2f2f2; }
    .who.on { background: #f0f2f5; }
    .who strong, .who small { display: block; }
    .who small { color: #667781; font-size: 12px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #dfe5e7; display: grid; place-items: center; font-weight: 700; }
    .who i { width: 8px; height: 8px; border-radius: 50%; background: #cfd4d8; margin-inline-start: auto; }
    .who i.live { background: #25d366; }
    .pane { display: flex; flex-direction: column; min-width: 0; }
    header.bar { background: #f0f2f5; padding: 12px 16px; border-bottom: 1px solid #ddd; }
    header.bar strong { display: block; }
    header.bar span { color: #667781; font-size: 13px; }
    .badge { display: inline-block; margin-top: 6px; background: #fff; border-radius: 999px; padding: 3px 10px; font-size: 12px; }
    #chat-log { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; direction: ltr; }
    .bubble { max-width: min(70%, 420px); border-radius: 10px; padding: 8px 10px; box-shadow: 0 1px 1px rgba(0,0,0,.08); direction: rtl; }
    .bubble p { margin: 0; white-space: pre-wrap; }
    .bubble time { display: block; margin-top: 4px; color: #667781; font-size: 11px; text-align: left; }
    .bubble.bot { margin-right: auto; background: #d9fdd3; }
    .bubble.broker { margin-left: auto; background: #fff; }
    .bubble img { display: block; max-width: 100%; border-radius: 8px; margin-bottom: 6px; }
    .who { min-height: 44px; }
    .empty { margin: auto; color: #667781; direction: rtl; }
    @media (max-width: 768px) {
      .audit { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
      .people { display: none; position: fixed; inset: 0; z-index: 5; }
      .people.open { display: block; }
      .menu-btn { display: inline-flex; align-items: center; }
      .bubble { max-width: 85%; }
    }
  </style>
</head>
<body>
<div class="audit">
  <aside class="people">
    <h1><a href="/admin">מתווכים</a></h1>
    ${rows || '<p>אין מתווכים</p>'}
  </aside>
  <section class="pane">
    <header class="bar">
      <strong>${escapeHtml(broker.fullName)}</strong>
      <span dir="ltr">${escapeHtml(broker.phoneNumber)}</span>
      <div class="badge">${escapeHtml(label || 'אין תהליך פעיל')}</div>
      <button class="menu-btn" id="people-open" type="button">מתווכים</button>
    </header>
    <div id="chat-log">${bubbles || '<p class="empty">עדיין אין הודעות בשיחה הזו.</p>'}</div>
  </section>
</div>
<script>
  const log = document.getElementById('chat-log');
  if (log) log.scrollTop = log.scrollHeight;
  document.getElementById('people-open')?.addEventListener('click', () => {
    document.querySelector('.people')?.classList.toggle('open');
  });
</script>
</body>
</html>`;
}
