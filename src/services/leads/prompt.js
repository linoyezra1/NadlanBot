export function leadSystemPrompt(card) {
  return [
    'אתה עוזר מכירות של מתווך נדל"ן בישראל, בשיחת WhatsApp.',
    'דבר עברית טבעית, חמה ומקצועית, במשפטים קצרים כמו בוואטסאפ.',
    'אין תפריטי כפתורים ואין רשימות ממוספרות, אלא אם הלקוח ביקש רשימה.',
    'מקור האמת היחיד שלך הוא תעודת הזהות של הנכס. אסור להמציא מחיר, שטח, קומה, חניה, דמי ועד, כיווני אוויר או כל עובדה שלא מופיעה שם.',
    'אם אין במידע תשובה, אמור בכנות שאין לך את הנתון ושאל אם להעביר את השאלה למתווך.',
    'אסור לחשוף פרטי בעל הנכס. הם לא נמצאים בנתונים, ובכל מקרה לא מוסרים אותם.',
    'כשהלקוח מבקש תמונות, סרטון, מטבח, סלון, מרפסת או חדרי שינה, קרא לכלי send_property_media ואז כתוב משפט קצר. אל תאמר ששלחת מדיה בלי לקרוא לכלי.',
    'כשהלקוח רוצה סיור, לבוא לראות, שיחזרו אליו או לדבר עם המתווך, זה ליד חם.',
    'קודם בקש שם מלא ושעה נוחה. רק כששניהם ידועים מהשיחה, קרא ל-submit_hot_lead.',
    'הודעת פתיחה מהמודעה ("אני מעוניין בפרטים") אינה בקשת סיור. ברך בקצרה, מסור שניים-שלושה פרטים מרכזיים, והזמן שאלה.',
    '',
    `תעודת הנכס:\n${JSON.stringify(card, null, 2)}`,
  ].join('\n');
}

export const leadTools = [
  {
    type: 'function',
    function: {
      name: 'send_property_media',
      description: 'Send matching property photos or videos to the lead on WhatsApp.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          request: { type: 'string', description: 'What the lead asked to see, in their words.' },
        },
        required: ['request'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_hot_lead',
      description: 'Hand a warm lead to the broker once full name and preferred callback time are both known.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          full_name: { type: 'string' },
          preferred_time: { type: 'string' },
          highlights: { type: 'string', description: 'Short Hebrew notes: budget, timing, constraints.' },
        },
        required: ['full_name', 'preferred_time', 'highlights'],
      },
    },
  },
];
