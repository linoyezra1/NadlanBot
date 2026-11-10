import { deliver, markRead } from './whatsapp.js';
import { deliverCloud } from './whatsappCloud.js';

export async function deliverResult(event, result) {
  await markRead(event.messageId);
  const sent = event.channel === 'meta'
    ? await deliverCloud(event.meta, event.from, result.replies)
    : await deliver(event.from, result.replies);
  const notes = [];
  for (const notification of result.notifications || []) {
    notes.push({
      to: notification.to,
      sent: await deliver(notification.to, notification.replies),
    });
  }
  return { sent, notes };
}
