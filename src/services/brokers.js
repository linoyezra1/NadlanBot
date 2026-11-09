import { normalizePhone } from '../domain/phone.js';
import { prisma } from '../db.js';

export async function openBroker({ phone, fullName, businessName }) {
  const phoneNumber = normalizePhone(phone);
  const name = String(fullName || '').replace(/\s+/g, ' ').trim();
  const business = String(businessName || '').replace(/\s+/g, ' ').trim() || null;
  if (!phoneNumber || phoneNumber.length < 11) {
    const error = new Error('מספר הטלפון לא תקין. לדוגמה: 050-1234567.');
    error.status = 400;
    throw error;
  }
  if (name.length < 2) {
    const error = new Error('חסר שם המתווך.');
    error.status = 400;
    throw error;
  }
  const existing = await prisma.broker.findUnique({ where: { phoneNumber } });
  const broker = await prisma.broker.upsert({
    where: { phoneNumber },
    update: { fullName: name, businessName: business, status: 'active' },
    create: { phoneNumber, fullName: name, businessName: business, status: 'active' },
  });
  return { broker, created: !existing };
}
