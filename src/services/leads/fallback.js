import { formatAmenities, formatPrice, formatPublicSummary } from '../../domain/card.js';
import { HIDDEN_ANSWER } from '../../domain/disclosure.js';
import { hotLeadSignal } from '../../domain/intents.js';
import { image, text, video } from '../../domain/replies.js';
import { matchMedia } from '../../domain/tags.js';
import { withoutBuildingNumber } from '../../domain/waLink.js';
import { commentAnswer, isDetailsAsk } from '../../domain/details.js';

function isSideQuestion(message) {
  return /[?]/.test(message) || /מחיר|חדר|איפה|כתובת|קומה|תמונ|מ"ר|מ״ר/.test(message);
}

function answerQuestion(card, message) {
  const bits = [];
  if (/מחיר|עולה|כמה עולה|תקציב/.test(message)) {
    bits.push(card.price != null ? `המחיר המבוקש הוא ${formatPrice(card.price)}` : HIDDEN_ANSWER);
  }
  if (/חדר/.test(message)) {
    bits.push(card.rooms != null ? `בנכס ${card.rooms} חדרים` : HIDDEN_ANSWER);
  }
  if (/איפה|כתובת|מיקום|שכונ|עיר/.test(message)) {
    const place = [withoutBuildingNumber(card.address), card.neighborhood, card.city].filter(Boolean).join(', ');
    bits.push(place ? `הכתובת היא ${place}` : HIDDEN_ANSWER);
  }
  if (/קומה/.test(message)) {
    bits.push(card.floor ? `הקומה היא ${card.floor}` : HIDDEN_ANSWER);
  }
  if (/מ["״]ר|גודל|שטח/.test(message)) {
    bits.push(card.sizeSqm ? `השטח הוא ${card.sizeSqm} מ"ר` : HIDDEN_ANSWER);
  }
  if (/חניה|מעלית|מרפסת|ממ["״]ד|ממד/.test(message)) {
    bits.push(formatAmenities(card.amenities) || HIDDEN_ANSWER);
  }
  if (/פינוי|כניסה|פנוי/.test(message)) {
    bits.push(card.vacancyDate ? `תאריך הפינוי: ${card.vacancyDate}` : HIDDEN_ANSWER);
  }
  if (/ועד|כיוון|ארנונה|עמלה|תיווך/.test(message)) {
    bits.push(HIDDEN_ANSWER);
  }
  if (bits.length) return [...new Set(bits)].join('\n');
  const summary = formatPublicSummary(card);
  return summary || 'אפשר לשאול על המחיר, החדרים או המיקום, או לכתוב מתי נוח לסיור.';
}

function mediaReply(item) {
  const kind = item.mediaType || item.type;
  const url = item.url || item.cloudUrl;
  const caption = item.caption || '';
  return kind === 'video' ? video(url, caption) : image(url, caption);
}

export function fallbackLeadTurn({ card, incoming, state, recentLeadTexts = [] }) {
  const message = String(incoming || '').trim();
  const next = {
    step: state?.step || 'chat',
    name: state?.name || null,
    time: state?.time || null,
    mediaSends: state?.mediaSends || 0,
  };

  if (isDetailsAsk(message) && next.step === 'chat') {
    const facts = commentAnswer(card, message, '');
    if (facts) return { replies: [text(facts)], state: next, handoff: null };
  }

  if (next.step === 'name') {
    if (isSideQuestion(message)) {
      return {
        replies: [text(`${answerQuestion(card, message)}\n\nוכדי שהמתווך יחזור אליך, איך קוראים לך?`)],
        state: next,
        handoff: null,
      };
    }
    if (message.length < 2) {
      return { replies: [text('איך קוראים לך? שם מלא יעזור למתווך.')], state: next, handoff: null };
    }
    next.name = message.replace(/^(קוראים לי|שמי|אני)\s+/, '').trim();
    next.step = 'time';
    return {
      replies: [text(`${next.name}, מתי נוח לחזור אליך? אפשר שעה או יום, למשל מחר ב-17:00.`)],
      state: next,
      handoff: null,
    };
  }

  if (next.step === 'time') {
    if (message.length < 2) {
      return { replies: [text('באיזה יום ושעה נוח לחזור אליך?')], state: next, handoff: null };
    }
    next.time = message;
    next.step = 'handed_off';
    return {
      replies: [text(`תודה ${next.name}. העברתי את הפרטים למתווך, והוא יחזור אליך לתיאום.`)],
      state: next,
      handoff: {
        leadName: next.name,
        preferredTime: next.time,
        highlights: [...recentLeadTexts, message].filter(Boolean).slice(-6).join(' | ').slice(0, 500),
      },
    };
  }

  if (next.step === 'handed_off') {
    return { replies: [text(answerQuestion(card, message))], state: next, handoff: null };
  }

  if (/בעל הנכס|הבעלים|מי המוכר|שם הבעלים/.test(message)) {
    return {
      replies: [text('פרטי בעל הנכס לא נמסרים בשיחה. התיאום נעשה מול המתווך.')],
      state: next,
      handoff: null,
    };
  }

  if (hotLeadSignal(message)) {
    next.step = 'name';
    return {
      replies: [text('בשמחה. איך קוראים לך? אחר כך נדייק שעה נוחה שהמתווך יחזור אליך.')],
      state: next,
      handoff: null,
    };
  }

  if (/תמונ|סרטון|וידאו|גלריה|מטבח|סלון|שינה|מרפסת|ממ["״]ד/.test(message)) {
    if (next.mediaSends >= 4) {
      return {
        replies: [text('שלחתי את התמונות העיקריות. את השאר המתווך ישמח להראות בסיור.')],
        state: next,
        handoff: null,
      };
    }
    const matched = matchMedia(card.media || [], message);
    if (!matched.items.length) {
      return {
        replies: [text('עדיין אין לי קבצי מדיה לנכס הזה. אפשר לשאול על המחיר, החדרים או המיקום.')],
        state: next,
        handoff: null,
      };
    }
    next.mediaSends += 1;
    const replies = matched.items.map(mediaReply);
    replies.push(text(matched.matched
      ? 'שלחתי את מה שמתאים לבקשה. אם בא לך חדר מסוים אחר, תגיד.'
      : 'אין תיוג מדויק לבקשה, אז שלחתי את התמונות הכלליות של הנכס.'));
    return { replies, state: next, handoff: null };
  }

  return { replies: [text(answerQuestion(card, message))], state: next, handoff: null };
}
