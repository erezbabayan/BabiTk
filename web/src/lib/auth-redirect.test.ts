import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthRedirectUrl,
  formatOAuthSignInError,
  googleSignInOptions,
  readOAuthCallback,
  stripOAuthParamsFromUrl,
} from "./auth-redirect.ts";

describe("GitHub Pages OAuth redirect", () => {
  it("keeps /BabiTk/ and a trailing slash so Pages does not drop ?code=", () => {
    assert.equal(
      buildAuthRedirectUrl("https://erezbabayan.github.io", "/BabiTk/"),
      "https://erezbabayan.github.io/BabiTk/",
    );
    assert.equal(
      buildAuthRedirectUrl("https://erezbabayan.github.io/", "/BabiTk"),
      "https://erezbabayan.github.io/BabiTk/",
    );
  });

  it("uses localhost without a repo path during Vite dev", () => {
    assert.equal(
      buildAuthRedirectUrl("http://localhost:5173", "/"),
      "http://localhost:5173/",
    );
  });
});

describe("OAuth callback parsing", () => {
  it("reads PKCE code from the query", () => {
    const parsed = readOAuthCallback("?code=abc-123&state=s1", "");
    assert.equal(parsed.code, "abc-123");
    assert.equal(parsed.error, null);
  });

  it("reads errors from the hash when the query is empty", () => {
    const parsed = readOAuthCallback("", "#error=access_denied&error_description=user%20denied");
    assert.equal(parsed.error, "access_denied");
  });

  it("maps Google cancel and disabled-provider errors to Hebrew", () => {
    assert.match(formatOAuthSignInError("access_denied"), /בוטלה/);
    assert.match(
      formatOAuthSignInError("Unsupported provider: provider is not enabled"),
      /לא הופעלה/,
    );
    assert.match(formatOAuthSignInError("bad_oauth_state"), /אותו חלון/);
    assert.match(
      formatOAuthSignInError("A user with this email address has already been registered"),
      /סיסמה/,
    );
  });

  it("strips oauth params without dropping the app path", () => {
    const next = stripOAuthParamsFromUrl(
      "https://erezbabayan.github.io/BabiTk/?code=abc&state=x",
    );
    assert.equal(next, "/BabiTk/");
  });

  it("keeps unrelated query params after stripping the OAuth code", () => {
    const next = stripOAuthParamsFromUrl(
      "https://erezbabayan.github.io/BabiTk/?billing=success&code=abc",
    );
    assert.equal(next, "/BabiTk/?billing=success");
  });
});

describe("Google sign-in options", () => {
  it("does not send a bare origin without the Pages base path", () => {
    const redirectTo = buildAuthRedirectUrl(
      "https://erezbabayan.github.io",
      "/BabiTk/",
    );
    const spec = googleSignInOptions(redirectTo);
    assert.equal(spec.provider, "google");
    assert.equal(spec.options.redirectTo, "https://erezbabayan.github.io/BabiTk/");
    assert.equal(spec.options.queryParams.prompt, "select_account");
    assert.match(spec.options.scopes, /email/);
    assert.ok(spec.options.redirectTo.includes("/BabiTk/"));
  });
});
