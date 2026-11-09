import { config } from '../config.js';
import { normalizePhone } from './phone.js';

export function buildWaLink(displayNumber, code, message) {
  const number = normalizePhone(displayNumber);
  if (!number || !code) return null;
  const text = message || `שלום, אני מעוניין בפרטים על דירה ${code}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function clickToWhatsAppLink(code) {
  return buildWaLink(config.whatsappDisplayNumber, code);
}

export function shortClickToWhatsAppLink(code) {
  return buildWaLink(config.whatsappDisplayNumber, code, code);
}

export function postWaMe(code) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number || !code) return null;
  return `wa.me/${number}?text=פרטים_על_${code}`;
}

export function forwardWaMe(code) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number || !code) return null;
  return `wa.me/${number}?text=${encodeURIComponent(code)}`;
}
