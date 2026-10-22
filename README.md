# BabiTk — מנהל משימות והערות חכם

**קליטה חכמה של משימות והערות** מוואטסאפ (טקסט וקול), מהודעות, ומסריקת מחברת — עם סיווג בינה מלאכותית, לוח עמודות ותזכורות.

## כניסה למערכת (קישור קבוע)

**https://erezbabayan.github.io/BabiTk/**

האתר מחובר ל־**Supabase Free** (ענן חינמי, משתמשים רבים). כל אחד נרשם עם אימייל וסיסמה ורואה **רק את הלוח שלו**.

וואטסאפ דורש גם שרת API נפרד; הקליטה המהירה והלוח עובדים מול Supabase.

### חלופות חינמיות ל־Convex Cloud

אין חברה שמציעה ענן בזמן־אמת בלי מגבלות ולנצח. אלה האפשרויות החינמיות ביותר ל־BabiTk:

| אפשרות | מחיר | מתאים ל־BabiTk |
|--------|------|----------------|
| **[Supabase Free](https://supabase.com/pricing)** | חינם (עם תקרה) | **מומלץ** — כבר כתוב בקוד (`web/` + `backend/` + `supabase/`) |
| **[Firebase Spark](https://firebase.google.com/pricing)** | חינם לגמרי עד התקרה | התחברות + מסד בזמן אמת, בלי כרטיס אשראי |
| **[Appwrite Cloud](https://appwrite.io/pricing)** | חינם (עם תקרה) | משתמשים, מסד, קבצים |
| **[Convex בקוד פתוח](https://docs.convex.dev/self-hosting)** | חינם על שרת שלכם | שומר את תיקיית `convex/` — למשל Oracle Cloud Always Free |
| **[PocketBase](https://pocketbase.io)** | חינם לגמרי (MIT) | קובץ אחד על כל שרת או מחשב, בלי מנוי |

פרויקט Convex **חדש** בתוכנית Free גם יעבוד זמנית, עד שהתקרה תיחסם שוב.

---

## מה המערכת עושה

| תחום | פירוט |
|------|--------|
| **קליטה** | וואטסאפ, הקלטה קולית, זיהוי טקסט במחברת, הקלדה מהירה |
| **בינה מלאכותית** | פירוק טקסט בעברית, דחיפות, תאריכים יחסיים («מחר ב-10»), תגיות |
| **לוח עבודה** | תיבת כניסה, משימות, הערות, ארכיון, חיפוש סמנטי |
| **חיבורים** | מסד נתונים בענן, מנוי פרימיום, יומן גוגל, צינור וואטסאפ |
| **פריסה** | GitHub Pages (ציבורי), בדיקות אוטומטיות, עדכון אחרי כל push ל-main |

## התחלה מהירה — מחשב מקומי

```powershell
.\scripts\install-git-hooks.ps1   # פעם אחת: תזכורת לפני שמירה בגיט
.\scripts\run-dev.ps1
```

- ממשק משתמש: http://localhost:5173  
- בדיקת תקינות שרת: http://localhost:3001/health  
- פריסה ציבורית: https://erezbabayan.github.io/BabiTk/

> **מצב הדגמה:** פעיל כברירת מחדל בפיתוח מקומי (ללא חיבור לענן), כל עוד בקובץ ההגדרות של הממשק מסומן מצב הדגמה.

## חיבור למסד הנתונים בענן

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_DB_PASSWORD = "..."
$env:SUPABASE_CREATE = "1"
.\scripts\setup-supabase.ps1
node scripts\check-env.mjs
node scripts\verify-stack.mjs
```

## הפעלה בשרת ייצור

פרטים מלאים: [מדריך פריסה](./DEPLOYMENT.md)

```bash
cp .env.production.example .env.production
docker compose up -d --build
```

הממשק הציבורי מתעדכן אוטומטית מ-GitHub Pages אחרי כל push מוצלח ל-`main`.

## סקריפטים שימושיים

| סקריפט | מה הוא עושה |
|--------|-------------|
| `scripts/run-dev.ps1` | מפעיל שרת API וממשק אינטרנט |
| `scripts/setup-supabase.ps1` | יוצר/מחבר ענן + מיגרציות + קבצי הגדרות |
| `scripts/connect-github.ps1` | חיבור ראשוני לחשבון גיטהאב |
| `scripts/install-git-hooks.ps1` | מתקין תזכורות לפני שמירה וחוסם קבצי סודות |
| `scripts/verify-stack.mjs` | בודק שכל שכבות המערכת תקינות |
| `scripts/check-env.mjs` | מאמת קבצי הגדרות סביבה |
| `scripts/check-integrations.mjs` | בודק תשלומים, וואטסאפ ויומן |
| `scripts/mint-device-token.mjs` | מנפיק טוקן מכשיר לקליטת קול (`voice-ingest`). מדפיס את הטוקן פעם אחת ושומר רק גיבוב |

## קליטת משימה משרת קול (Raspberry Pi)

פונקציית Edge‏ `voice-ingest` יוצרת משימה למשתמש לפי טוקן מכשיר. אין JWT של משתמש. הטוקן יכול ליצור משימות רק עבור המשתמש שאליו הוא הונפק.

```http
POST https://ghibfuinantybqidwadj.supabase.co/functions/v1/voice-ingest
Authorization: Bearer <טוקן-מכשיר>
Content-Type: application/json
```

גוף הבקשה: `title` (חובה), `due_date` (`YYYY-MM-DD`, אופציונלי), `due_time` (`HH:MM` לפי שעון ירושלים, אופציונלי), `notes`, `source` (`voice`), `location`, `client_id` לאידמפוטנטיות, `type` (`task` או `note`, ברירת מחדל `task`) ו־`board` (`notebook` או `default`, ברירת מחדל `default`). בלי שעה, תאריך נשמר ב־09:00. מיקום נכנס לתוכן (`מיקום: …`) כי אין עמודת מיקום. המחברת היא עמודת `inbox`. גם `default` וגם `notebook` נכנסים אליה, כמו קליטת וואטסאפ. `type: task` שומר `is_actionable: true` (משימה) ו־`type: note` שומר `false` (הערה). מועד ותזכורת נשמרים לשני הסוגים. הצ'יפ «מהכפתור» נשאר כי `metadata.source` הוא `voice`.

הנפקת טוקן למשתמש (המפתח הסודי לא נשמר בגיט):

```bash
node --experimental-strip-types scripts/mint-device-token.mjs erezbabayan@gmail.com
```

הסקריפט קורא `SUPABASE_SERVICE_ROLE_KEY` מהסביבה או מ־`backend/.env`. הוא מדפיס את הטוקן פעם אחת.

## אפליקציית מובייל

```powershell
cd mobile
copy .env.example .env
npm install
npm run android
npx eas build --profile production
```

## מבנה הפרויקט

| תיקייה | תפקיד |
|--------|--------|
| `backend/` | שרת API — וואטסאפ, בינה מלאכותית, תשלומים, גיבויים |
| `web/` | ממשק משתמש באינטרנט |
| `mobile/` | אפליקציה לנייד |
| `convex/` | עיבוד הודעות וואטסאפ וזיהוי מחברת |
| `supabase/` | סכמת מסד נתונים, הרשאות וחיפוש וקטורי |

---

**פרויקט** — © erezbabayan · [קוד ב-GitHub](https://github.com/erezbabayan/BabiTk)
