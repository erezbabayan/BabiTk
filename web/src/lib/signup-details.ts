export type SignupDetails = {
  firstName: string;
  lastName: string;
  phone: string;
  username: string;
};

const USERNAME_PATTERN = /^[^\s]{2,32}$/;

export function validateUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("יש להזין שם משתמש");
  if (trimmed.includes("@")) {
    throw new Error("שם משתמש לא יכול להיות אימייל. בחרו כינוי קצר, למשל erezbababan");
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error("שם משתמש חייב להיות 2–32 תווים בלי רווחים");
  }
  return trimmed;
}

export function validateSignupPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("הסיסמה חייבת להכיל לפחות 8 תווים");
  }
}

export function validateSignupDetails(details: SignupDetails): void {
  const firstName = details.firstName.trim();
  const lastName = details.lastName.trim();
  const phone = details.phone.trim();
  validateUsername(details.username);

  if (!firstName) throw new Error("יש להזין שם פרטי");
  if (!lastName) throw new Error("יש להזין שם משפחה");
  if (!phone) throw new Error("יש להזין מספר טלפון");

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("מספר טלפון לא תקין");
  }
}
