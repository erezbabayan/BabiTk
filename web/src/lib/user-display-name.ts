export type UserNameParts = {
  firstName: string;
  lastName: string;
};

function splitFullName(fullName: string): UserNameParts {
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

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Resolve first + last name from Convex user fields or Supabase OAuth metadata. */
export function resolveUserNameParts(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  userMetadata?: Record<string, unknown> | null;
}): UserNameParts | null {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  if (first || last) {
    return { firstName: first, lastName: last };
  }

  const meta = input.userMetadata;
  if (meta) {
    const given =
      readMetadataString(meta, "given_name") ?? readMetadataString(meta, "first_name");
    const family =
      readMetadataString(meta, "family_name") ?? readMetadataString(meta, "last_name");
    if (given || family) {
      return { firstName: given ?? "", lastName: family ?? "" };
    }

    const full =
      readMetadataString(meta, "full_name") ?? readMetadataString(meta, "name");
    if (full) {
      const split = splitFullName(full);
      if (split.firstName || split.lastName) {
        return split;
      }
    }
  }

  if (input.name?.trim()) {
    const split = splitFullName(input.name);
    if (split.firstName || split.lastName) {
      return split;
    }
  }

  return null;
}

export function formatUserHeaderName(parts: UserNameParts): string {
  return [parts.firstName.trim(), parts.lastName.trim()].filter(Boolean).join(" ");
}
