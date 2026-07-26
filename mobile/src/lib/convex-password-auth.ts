import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { writeConvexAuthTokens } from "./auth-storage";

export type PasswordAuthParams = {
  email: string;
  password: string;
  flow: "signIn" | "signUp";
  firstName?: string;
  lastName?: string;
  phone?: string;
};

function normalizePasswordAuthParams(
  params: PasswordAuthParams,
): Record<string, string> {
  const normalized: Record<string, string> = {
    email: params.email.trim().toLowerCase(),
    password: params.password,
    flow: params.flow,
  };

  if (params.flow === "signUp") {
    if (params.firstName) normalized.firstName = params.firstName.trim();
    if (params.lastName) normalized.lastName = params.lastName.trim();
    if (params.phone) normalized.phone = params.phone.trim();
  }

  return normalized;
}

/** Password sign-in/up over HTTP — reliable on React Native (WebSocket auth can fail). */
export async function signInWithPasswordViaHttp(
  convexUrl: string,
  params: PasswordAuthParams,
): Promise<{ token: string; refreshToken: string }> {
  const client = new ConvexHttpClient(convexUrl);
  const result = (await client.action(api.auth.signIn, {
    provider: "password",
    params: normalizePasswordAuthParams(params),
  })) as {
    tokens?: { token: string; refreshToken: string } | null;
  };

  const token = result.tokens?.token;
  const refreshToken = result.tokens?.refreshToken;
  if (!token || !refreshToken) {
    throw new Error("לא התקבלו אסימוני התחברות מהשרת");
  }

  return { token, refreshToken };
}

export async function persistPasswordAuthTokens(
  token: string,
  refreshToken: string,
): Promise<void> {
  await writeConvexAuthTokens(token, refreshToken);
}
