export type GoogleIdentity = {
  email: string;
  sub: string;
  name?: string;
  picture?: string;
};

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function emailVerified(record: Record<string, unknown>): boolean {
  const value = record.email_verified;
  return value === true || value === "true";
}

/** Map Google tokeninfo / id_token JSON to a verified identity, or throw. */
export function googleIdentityFromTokenInfo(
  data: unknown,
  clientId: string,
): GoogleIdentity {
  const record = asRecord(data);
  if (!record) {
    throw new Error("invalid_google_token");
  }
  const aud = stringField(record, "aud");
  const iss = stringField(record, "iss");
  const email = stringField(record, "email").toLowerCase();
  const sub = stringField(record, "sub");
  if (!clientId || aud !== clientId) {
    throw new Error("invalid_google_audience");
  }
  if (!GOOGLE_ISSUERS.has(iss)) {
    throw new Error("invalid_google_issuer");
  }
  if (!email.includes("@") || !sub) {
    throw new Error("invalid_google_email");
  }
  if (!emailVerified(record)) {
    throw new Error("unverified_google_email");
  }
  const name = stringField(record, "name");
  const picture = stringField(record, "picture");
  return {
    email,
    sub,
    ...(name ? { name } : {}),
    ...(picture ? { picture } : {}),
  };
}

export function googleAuthorizationCodeFromBody(body: unknown): string {
  const record = asRecord(body);
  const code = record ? stringField(record, "code") : "";
  if (!code || code.length < 8) {
    throw new Error("missing_google_code");
  }
  return code;
}

export function googleIdTokenFromBody(body: unknown): string {
  const record = asRecord(body);
  const token = record
    ? stringField(record, "idToken") || stringField(record, "credential")
    : "";
  if (!token || token.split(".").length !== 3) {
    throw new Error("missing_google_id_token");
  }
  return token;
}

export type AuthSessionTokens = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
};

export function sessionTokensFromUnknown(data: unknown): AuthSessionTokens {
  const record = asRecord(data);
  const nested = record ? asRecord(record.session) : null;
  const source = nested ?? record;
  const accessToken = source ? stringField(source, "access_token") : "";
  const refreshToken = source ? stringField(source, "refresh_token") : "";
  if (!accessToken || !refreshToken) {
    throw new Error("session_issue_failed");
  }
  const expiresIn = source && typeof source.expires_in === "number" ? source.expires_in : undefined;
  const tokenType = source ? stringField(source, "token_type") : "";
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    ...(expiresIn ? { expires_in: expiresIn } : {}),
    ...(tokenType ? { token_type: tokenType } : {}),
  };
}
