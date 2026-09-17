export function formatIngestError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message === "Failed to fetch") {
      return "לא ניתן להתחבר לשרת. נסה שוב או בדוק את החיבור.";
    }
    if (/^API error (404|405|501|502|503)$/.test(message)) {
      return "";
    }
    if (
      /edge function/i.test(message) ||
      /failed to send a request/i.test(message) ||
      /functionshttperror/i.test(message) ||
      /requested function was not found/i.test(message)
    ) {
      return "תמלול ההקלטה נכשל. נסו שוב בעוד רגע.";
    }
    return error.message;
  }
  return "שגיאה בקליטה";
}
