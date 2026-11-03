export function text(body) {
  return { type: 'text', text: String(body || '') };
}

export function buttons(body, items) {
  return { type: 'buttons', text: String(body || ''), buttons: items.slice(0, 3) };
}

export function image(url, caption = '') {
  return { type: 'image', url, caption };
}

export function video(url, caption = '') {
  return { type: 'video', url, caption };
}

export function expandReplies(replies) {
  const expanded = [];
  for (const reply of replies || []) {
    if (!reply) continue;
    if (reply.type === 'text' && reply.text.length > 3500) {
      for (let index = 0; index < reply.text.length; index += 3500) {
        expanded.push(text(reply.text.slice(index, index + 3500)));
      }
      continue;
    }
    expanded.push(reply);
  }
  return expanded;
}
