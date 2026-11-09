import { formatAmenities, formatPrice } from '../domain/card.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 11) {
    const local = `0${digits.slice(3)}`;
    if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone || '';
}

export function formatWhen(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function money(price) {
  return price == null ? 'מחיר לא צוין' : formatPrice(price);
}

export function amenitiesLine(amenities) {
  return formatAmenities(amenities);
}

const LEAD_STATUS = {
  active: ['בשיחה', 'open'],
  converted_hot_lead: ['ליד חם', 'hot'],
  closed: ['נסגר', 'muted'],
};

const PROPERTY_STATUS = {
  active: ['פעיל', 'open'],
  draft: ['וה', 'muted'],
  archived: ['בארכיון', 'muted'],
};

export function leadStatus(status) {
  return LEAD_STATUS[status] || [status || 'לא ידוע', 'muted'];
}

export function propertyStatus(status) {
  return PROPERTY_STATUS[status] || [status || 'לא ידוע', 'muted'];
}

export function pill(label, tone) {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

export function place(property) {
  if (!property) return '';
  return [property.neighborhood, property.city].filter(Boolean).join(', ');
}

export function addressLine(property) {
  if (!property) return 'נכס לא משויך';
  return [property.address, place(property)].filter(Boolean).join(' · ') || property.code;
}

const TAGS = {
  kitchen: 'מטבח',
  living_room: 'סלון',
  bedroom: 'חדר שינה',
  bathroom: 'אמבטיה',
  balcony: 'מרפסת',
  view: 'נוף',
  exterior: 'חוץ',
  mamad: 'ממ"ד',
};

export function tagLabel(tag) {
  return TAGS[tag] || tag;
}

export function href(token, path) {
  if (!token) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}token=${encodeURIComponent(token)}`;
}

export function customerName(lead) {
  return lead.contactName || 'מתעניין בלי שם';
}
