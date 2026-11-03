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

export function parsePublishCommand(text) {
  const match = String(text || '').match(/פרסם(?:ו)?\s+(APT-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

export function isListGroupsIntent(text) {
  return /הקבוצות שלי|רשימת קבוצות/.test(String(text || ''));
}

export function parseAddGroup(text) {
  const match = String(text || '').match(/הוסף קבוצה\s+(\d{5,20})\s+(.{2,80})$/);
  if (!match) return null;
  return { groupId: match[1], name: match[2].trim() };
}

const HOT_LEAD = /לבוא לראות|לראות את (?:הדירה|הנכס)|לתאם (?:סיור|פגישה|ביקור)|תיאום (?:סיור|פגישה)|שיחזרו אלי|תחזירו אלי|תתקשרו|תחזור אלי|לחזור אלי|שמישהו יחזור|לקבוע (?:סיור|ביקור|פגישה)|לדבר עם (?:המתווך|סוכן|מישהו)|רוצה לבקר|מתי אפשר לראות|אפשר שמישהו/;

export function hotLeadSignal(text) {
  return HOT_LEAD.test(String(text || ''));
}
