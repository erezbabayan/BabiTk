export type SignupDetails = {
  firstName: string;
  lastName: string;
  phone: string;
};

export function validateSignupDetails(details: SignupDetails): void {
  const firstName = details.firstName.trim();
  const lastName = details.lastName.trim();
  const phone = details.phone.trim();

  if (!firstName) throw new Error("יש להזין שם פרטי");
  if (!lastName) throw new Error("יש להזין שם משפחה");
  if (!phone) throw new Error("יש להזין מספר טלפון");

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("מספר טלפון לא תקין");
  }
}
