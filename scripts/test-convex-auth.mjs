/**
 * Integration test for Convex Auth password sign-up/sign-in + viewer query.
 * Run: node scripts/test-convex-auth.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvLocal(name) {
  const text = readFileSync(join(root, ".env.local"), "utf8");
  const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

const convexUrl = process.env.VITE_CONVEX_URL ?? readEnvLocal("CONVEX_URL");
const siteUrl = process.env.CONVEX_SITE_URL ?? readEnvLocal("CONVEX_SITE_URL");

const email = `auth-test-${Date.now()}@test.mindtasker.local`;
const password = "TestPass123!";

const client = new ConvexHttpClient(convexUrl);

async function signIn(flow) {
  const result = await client.action(api.auth.signIn, {
    provider: "password",
    params: { flow, email, password },
  });
  return result;
}

async function main() {
  console.log("Convex URL:", convexUrl);
  console.log("Site URL:", siteUrl);
  console.log("Test email:", email);

  const envRes = await fetch(`${siteUrl}/api/auth`);
  console.log("\nGET /api/auth status:", envRes.status);

  try {
    console.log("\n--- signUp ---");
    const signUp = await signIn("signUp");
    console.log("signUp result:", JSON.stringify(signUp));

    if (signUp?.tokens?.token) {
      client.setAuth(signUp.tokens.token);
      console.log("Set JWT on client");
    }

    console.log("\n--- viewer after signUp (with token) ---");
    const viewerAfterSignUp = await client.query(api.users.viewer, {});
    console.log("viewer:", JSON.stringify(viewerAfterSignUp));

    console.log("\n--- isAuthenticated ---");
    const authed = await client.query(api.auth.isAuthenticated, {});
    console.log("isAuthenticated:", authed);

    if (!viewerAfterSignUp) {
      console.error("\nFAIL: viewer is null after signUp");
      process.exit(1);
    }

    console.log("\n--- signIn (same account) ---");
    client.setAuth(null);
    const signInResult = await signIn("signIn");
    console.log("signIn result:", JSON.stringify(signInResult));
    if (signInResult?.tokens?.token) {
      client.setAuth(signInResult.tokens.token);
    }
    const viewerAfterSignIn = await client.query(api.users.viewer, {});
    console.log("viewer after signIn:", JSON.stringify(viewerAfterSignIn));
    if (!viewerAfterSignIn) {
      console.error("\nFAIL: viewer is null after signIn");
      process.exit(1);
    }

    console.log("\nPASS: password auth works for", email);

    console.log("\n--- Google OAuth probe ---");
    try {
      await client.action(api.auth.signIn, {
        provider: "google",
        params: {},
      });
      console.log("Google signIn initiated (unexpected without redirect)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("Google error (expected if not configured):", msg.slice(0, 200));
    }
  } catch (error) {
    console.error("\nAUTH ERROR:", error);
    process.exit(1);
  }
}

main();
