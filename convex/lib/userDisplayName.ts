export type UserNameParts = {
  firstName: string;
  lastName: string;
};

export function splitFullName(fullName: string): UserNameParts {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function resolveStoredUserNameParts(user: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): UserNameParts | null {
  const first = user.firstName?.trim() ?? "";
  const last = user.lastName?.trim() ?? "";
  if (first || last) {
    return { firstName: first, lastName: last };
  }
  if (user.name?.trim()) {
    const split = splitFullName(user.name);
    if (split.firstName || split.lastName) {
      return split;
    }
  }
  return null;
}
