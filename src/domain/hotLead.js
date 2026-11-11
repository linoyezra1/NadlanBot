export function formatHotLead({ code, address, neighborhood, city, leadName, leadPhone, preferredTime, highlights }) {
  const place = [address, neighborhood, city].filter(Boolean).join(', ');
  return [
    '🔥 ליד חם',
    `נכס: ${code || 'לא זוהה'}${place ? ` | ${place}` : ''}`,
    `לקוח: ${leadName || 'לא נמסר'}`,
    `טלפון: ${leadPhone || 'לא נמסר'}`,
    preferredTime ? `שעה מועדפת: ${preferredTime}` : null,
    highlights ? `דגשים: ${highlights}` : null,
    'כדאי לחזור אליו טלפונית עכשיו.',
  ].filter(Boolean).join('\n');
}

export function formatLeadUpdate({ name, phone, text }) {
  const who = [name, phone].filter(Boolean).join(' ');
  const quote = String(text || '').trim();
  const lines = ['*עדכון*', '', `הלקוח ${who}`.trim()];
  if (quote) lines.push(`"${quote}"`);
  return lines.join('\n');
}

export function highlightsFromTranscript(messages) {
  return (messages || [])
    .filter((message) => message.sender === 'lead' && message.text)
    .slice(-6)
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500);
}
