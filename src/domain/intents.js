import { parseChannels } from './channels.js';

export function extractPropertyCode(text) {
  const match = String(text || '').match(/\b(APT-\d+)\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function isExactCancel(text) {
  return /^(ביטול|בטל|עצור|stop)$/i.test(String(text || '').trim());
}

export function isExactConfirm(text) {
  return /^(כן|אישור|אשר|שמור|שמירה|מאשר|יאללה|בסדר|מצוין)$/i.test(String(text || '').trim());
}

export function isDoneMedia(text) {
  return /^(סיימתי|המשך|זהו|זה הכל|נגמר|בלי מדיה)$/i.test(String(text || '').trim());
}

export function isGuidedRequest(text) {
  return /שלב\s*אחר\s*שלב|שאלה\s*שאלה/.test(String(text || ''));
}

export function isNewPropertyIntent(text) {
  return /דירה חדשה|נכס חדש|להעלות נכס|להעלות דירה|קליטת נכס|יש לי דירה/.test(String(text || ''));
}

export function isListIntent(text) {
  return /הנכסים שלי|רשימת נכסים|הדירות שלי/.test(String(text || ''));
}

export function parsePublishRequest(text) {
  const source = String(text || '').trim();
  if (!/פרסם/.test(source)) return null;
  const code = extractPropertyCode(source);
  if (!code) return null;
  return { code, channels: parseChannels(source) };
}

export function parsePublishCommand(text) {
  return parsePublishRequest(text)?.code || null;
}

export function isMenuIntent(text) {
  return /^(תפריט|menu)$/i.test(String(text || '').trim());
}

export function isFreshPropertyCommand(text) {
  return /^(דירה חדשה|נכס חדש)[.!?]?$/.test(String(text || '').trim());
}

export function parseDeleteRequest(text) {
  const match = String(text || '').trim().match(/^(?:מחק|למחוק)\s+(APT-\d+)\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

export function parseEditRequest(text) {
  const match = String(text || '').trim().match(/^(?:ערוך|לערוך)\s+(APT-\d+)\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

export function brokerInterrupt(text) {
  const source = String(text || '').trim();
  if (!source || source.length > 80) return null;
  if (isExactCancel(source)) return { kind: 'cancel' };
  if (isMenuIntent(source)) return { kind: 'menu' };
  if (isFreshPropertyCommand(source)) return { kind: 'new' };
  if (/^פרסם/.test(source)) {
    const publish = parsePublishRequest(source);
    if (publish) return { kind: 'publish', code: publish.code, channels: publish.channels };
  }
  const deleted = parseDeleteRequest(source);
  if (deleted) return { kind: 'delete', code: deleted };
  const edited = parseEditRequest(source);
  if (edited) return { kind: 'edit', code: edited };
  return null;
}

export function isListGroupsIntent(text) {
  return /הקבוצות שלי|רשימת קבוצות/.test(String(text || ''));
}

export function isConnectSocialIntent(text) {
  return /חבר(?:ת)? (?:את )?(?:ה)?(?:חשבונות|רשתות)|חיבור (?:סושיאל|רשתות)/.test(String(text || ''));
}

export function parseAddGroup(text) {
  const match = String(text || '').match(/הוסף קבוצה\s+(\d{5,20})\s+(.{2,80})$/);
  if (!match) return null;
  return { groupId: match[1], name: match[2].trim() };
}

const HOT_LEAD = /לבוא לראות|לראות את (?:הדירה|הנכס)|לתאם (?:סיור|פגישה|ביקור)|תיאום (?:סיור|פגישה)|שיחזרו אלי|תחזירו אלי|תתקשרו|תחזור אלי|לחזור אלי|שמישהו יחזור|לקבוע (?:סיור|ביקור|פגישה)|לדבר עם (?:המתווך|סוכן|מישהו)|רוצה לבקר|מתי אפשר לראות|אפשר שמישהו|אפשר לבוא|מתי מראים/;

export function hotLeadSignal(text) {
  return HOT_LEAD.test(String(text || ''));
}
