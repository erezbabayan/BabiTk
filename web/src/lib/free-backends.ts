/** Completely-free (or free-tier) backends that can replace Convex Cloud. */

export type FreeBackendOption = {
  name: string;
  url: string;
  summary: string;
};

export const FREE_BACKEND_OPTIONS: FreeBackendOption[] = [
  {
    name: "Supabase Free",
    url: "https://supabase.com/pricing",
    summary:
      "כבר קיים בקוד של BabiTk. תוכנית חינמית עם מסד Postgres, התחברות ושמירת נתונים בענן.",
  },
  {
    name: "Firebase Spark",
    url: "https://firebase.google.com/pricing",
    summary: "תוכנית חינמית של Google — התחברות, מסד נתונים בזמן אמת ואחסון בלי כרטיס אשראי.",
  },
  {
    name: "Appwrite Cloud",
    url: "https://appwrite.io/pricing",
    summary: "תוכנית חינמית לענן — משתמשים, מסד נתונים, קבצים ופונקציות.",
  },
  {
    name: "Convex בקוד פתוח (עצמאי)",
    url: "https://docs.convex.dev/self-hosting",
    summary:
      "אותו קוד Convex בלי לשלם לחברה — מריצים על שרת Always Free (למשל Oracle Cloud).",
  },
  {
    name: "PocketBase",
    url: "https://pocketbase.io",
    summary: "קובץ אחד חינמי לגמרי (MIT) — מסד, התחברות וקבצים על כל שרת או מחשב.",
  },
];
