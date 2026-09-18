export const ONBOARDING_SKIPPED_SETTINGS = [
  "user",
  "premium",
  "tags",
  "trash",
  "admin",
] as const;

export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "ברוכים הבאים ל-BabiTk",
    body: "נעבור יחד על ההגדרות הכלליות. אפשר לדלג על שלב, ואפשר לשנות הכל אחר כך בתפריט ההגדרות.",
    settingsSection: null,
  },
  {
    id: "notifications",
    title: "התראות",
    body: "בחרו איך לקבל תזכורות. ההגדרות האלה זמינות גם בהגדרות → התראות.",
    settingsSection: "notifications",
  },
  {
    id: "whatsapp",
    title: "וואטסאפ",
    body: "חברו טלפון או קבוצת קליטה. אפשר לחבר או לשנות אחר כך בהגדרות → וואטסאפ.",
    settingsSection: "whatsapp",
  },
  {
    id: "voice",
    title: "הקלטה קולית",
    body: "כך קולטים משימות בהקלטה. אין מה להפעיל כאן — ההסבר נשאר גם בהגדרות → הקלטה קולית.",
    settingsSection: "voice",
  },
  {
    id: "notebook",
    title: "סריקת מחברת",
    body: "צילום דף יוצר משימות והערות. ההסבר זמין גם בהגדרות → סריקת מחברת.",
    settingsSection: "notebook",
  },
  {
    id: "text",
    title: "קליטת טקסט",
    body: "אפשר להקליד או לשתף טקסט ללוח. ההסבר זמין גם בהגדרות → קליטת טקסט.",
    settingsSection: "text",
  },
  {
    id: "boards",
    title: "בורדים",
    body: "הגדירו כמה זמן פריטים נשארים במחברת. אפשר לשנות אחר כך בהגדרות → הגדרות בורדים.",
    settingsSection: "boards",
  },
  {
    id: "calendar",
    title: "Google Calendar",
    body: "חברו את היומן כדי שמשימות עם תאריך יופיעו ב-Google Calendar. אפשר לחבר או לנתק אחר כך בהגדרות.",
    settingsSection: "calendar",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export type OnboardingSettingsSection = Exclude<
  (typeof ONBOARDING_STEPS)[number]["settingsSection"],
  null
>;

export function onboardingSettingsSections(): OnboardingSettingsSection[] {
  return ONBOARDING_STEPS.map((step) => step.settingsSection).filter(
    (section): section is OnboardingSettingsSection => section !== null,
  );
}

export function isOnboardingSettingsSection(
  section: string,
): section is OnboardingSettingsSection {
  return onboardingSettingsSections().includes(section as OnboardingSettingsSection);
}
