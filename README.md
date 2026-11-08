 NadlanBot

בוט WhatsApp למתווכי נדל"ן: קליטת נכס מתוך הצ'אט, שמירת תעודת זהות ומדיה, מענה אנושי למתעניינים, וזיהוי ליד חם שמועבר למתווך. ההפצה לפייסבוק, אינסטגרם וטיקטוק נעשית רק דרך הממשקים הרשמיים.

## הרצה מקומית

```bash
npm install
npm start
```

בלי `DATABASE_URL` השרת מרים PostgreSQL מקומי על פורט 5433 ושומר את הנתונים בתיקייה `.pgdata`. בפעם הראשונה נוצר מתווך הדגמה במספר `972501234567`.

לוח התפעול: [http://localhost:3000/admin](http://localhost:3000/admin)

אפשר גם לשלוח הודעה בלי וואטסאפ:

```bash
curl -X POST http://localhost:3000/simulate -H "Content-Type: application/json" -d "{\"from\":\"972501234567\",\"text\":\"דירה חדשה\"}"
```

בדיקות:

```bash
npm test
npm run demo
```

## מה המתווך כותב

- `דירה חדשה` — קליטת תמונות, פרטי הנכס ופרטי בעלים חסויים, ואז תצוגה מקדימה.
- `הנכסים שלי`
- `פרסם APT-104`
- `הוסף קבוצה <מזהה> <שם>`
- `הקבוצות שלי`
- `ביטול`

אחרי השמירה הבוט מציע נוסח פרסום וקישור `wa.me` עם קוד הנכס, למשל `APT-101`.

## מה קורה למתעניין

הוא נכנס מהקישור שבמודעה. הבוט מזהה את `APT-104`, עונה רק לפי תעודת הנכס, שולח תמונות לפי בקשה, ולא רואה את פרטי הבעלים. ברגע שהוא מבקש סיור או שיחת טלפון, הבוט אוסף שם ושעה ושולח למתווך סיכום ליד חם.

בלי מפתח OpenAI המענה עובד במצב גיבוי מתוך תעודת הנכס. עם `OPENAI_API_KEY` השיחה עוברת דרך GPT ו-Function Calling.

## חיבור WhatsApp, Meta ו-TikTok

המערכת לא משתמשת בסקרייפינג. צריך:

1. ב-Twilio, ב-WhatsApp Sender, ה-Webhook הוא `POST https://<הדומיין>/webhook`.
2. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, ו-`TWILIO_WHATSAPP_NUMBER` או `TWILIO_MESSAGING_SERVICE_SID`.
3. `PUBLIC_BASE_URL` חייב להיות אותו דומיין ציבורי, כי חתימת Twilio נבדקת מולו. בפרודקשן בלי `TWILIO_AUTH_TOKEN` הקריאות נדחות.
4. לפרסום בפייסבוק: `META_PAGE_ID` ו-`META_PAGE_ACCESS_TOKEN` עם `pages_manage_posts`. לאינסטגרם גם `META_IG_USER_ID` ו-`instagram_content_publish`.

שיחת מתעניין נפתחת על ידו, ולכן יש חלון שירות של 24 שעות בלי תבנית. עדכון למתווך מחוץ לחלון דורש תבנית מאושרת עם משתנה גוף אחד: `TWILIO_CONTENT_SID`.

מדיה מקומית לא מתאימה לפרסום ברשת, כי מטא וטיקטוק צריכים כתובת `https` ציבורית. בפרודקשן מגדירים `STORAGE_PROVIDER=cloudinary` או `s3`, ו-`PUBLIC_BASE_URL`.

הוספת מתווך אמיתי:

```bash
npm run broker:add -- 972501234567 "דנה לוי" "משרד לוי"
```

## פריסה

`Dockerfile` ו-`railway.toml` מריצים `prisma db push` ואז את השרת. ב-Railway מגדירים `DATABASE_URL` של PostgreSQL ו-`NODE_ENV=production`. ה-CRM ולוח התפעול נפתחים בקישור, בלי סיסמה.

משתני הסביבה המלאים נמצאים ב-`.env.example`.
