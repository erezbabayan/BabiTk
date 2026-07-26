/** Shared Hebrew copy for destructive confirm dialogs (web + mobile). */

export function deleteItemConfirmMessage(title: string): string {
  return `בטוח שברצונך למחוק את «${title}»?\nהפריט ייצא מהמערכת.`;
}

export function deleteListConfirmMessage(name: string): string {
  return `בטוח שברצונך למחוק את הרשימה «${name}»?\nהרשימה תצא מהמערכת.`;
}

export function permanentDeleteConfirmMessage(title: string): string {
  return `בטוח שברצונך למחוק את «${title}» לצמיתות?\nהפריט ייצא מהמערכת ולא ניתן לשחזר.`;
}

export function permanentDeleteManyConfirmMessage(count: number): string {
  return `בטוח שברצונך למחוק ${count} פריטים לצמיתות?\nלא ניתן לשחזר אחרי מחיקה זו.`;
}
