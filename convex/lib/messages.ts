export const UNLINKED_PHONE_MESSAGE =
  "מספר הטלפון שלך לא מקושר לחשבון MindTasker. פתח הגדרות → וואטסאפ באפליקציה או ב-Web.";

export const WHATSAPP_REJECTION_MESSAGE =
  "לא הצלחתי לזהות משימה או הערה בהודעה זו.";

export const AUDIO_QUOTA_MESSAGE =
  "חרגת ממכסת ההקלטות הקוליות החודשית. שדרג ל-Premium או נסה שוב בחודש הבא.";

export function buildIngestConfirmation(count: number): string {
  if (count <= 0) return WHATSAPP_REJECTION_MESSAGE;
  if (count === 1) return "נקלט פריט אחד ל-MindTasker ✓";
  return `נקלטו ${count} פריטים ל-MindTasker ✓`;
}
