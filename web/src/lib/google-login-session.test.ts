import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  googleAuthorizationCodeFromBody,
  googleIdentityFromTokenInfo,
  googleIdTokenFromBody,
  sessionTokensFromUnknown,
} from "../../../supabase/functions/_shared/google-login.ts";
import { googleLoginReady } from "./google-calendar-setup.ts";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";

describe("Google identity from tokeninfo", () => {
  it("accepts a verified Google ID token payload for the configured client", () => {
    const identity = googleIdentityFromTokenInfo(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "google-user-1",
        email: "ErezBabayan@gmail.com",
        email_verified: "true",
        name: "Erez",
      },
      CLIENT_ID,
    );
    assert.equal(identity.email, "erezbabayan@gmail.com");
    assert.equal(identity.sub, "google-user-1");
    assert.equal(identity.name, "Erez");
  });

  it("rejects a token issued for a different client or unverified email", () => {
    assert.throws(
      () =>
        googleIdentityFromTokenInfo(
          {
            iss: "https://accounts.google.com",
            aud: "other.apps.googleusercontent.com",
            sub: "x",
            email: "a@b.com",
            email_verified: true,
          },
          CLIENT_ID,
        ),
      /invalid_google_audience/,
    );
    assert.throws(
      () =>
        googleIdentityFromTokenInfo(
          {
            iss: "https://accounts.google.com",
            aud: CLIENT_ID,
            sub: "x",
            email: "a@b.com",
            email_verified: false,
          },
          CLIENT_ID,
        ),
      /unverified_google_email/,
    );
  });
});

describe("Google login request bodies", () => {
  it("reads a GIS authorization code and a JWT id token", () => {
    assert.equal(googleAuthorizationCodeFromBody({ code: "4/0ASomethingLong" }), "4/0ASomethingLong");
    assert.equal(
      googleIdTokenFromBody({ idToken: "aaa.bbb.ccc" }),
      "aaa.bbb.ccc",
    );
    assert.throws(() => googleAuthorizationCodeFromBody({}), /missing_google_code/);
    assert.throws(() => googleIdTokenFromBody({ idToken: "not-a-jwt" }), /missing_google_id_token/);
  });

  it("extracts session tokens from a nested Supabase session", () => {
    const tokens = sessionTokensFromUnknown({
      session: {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
        token_type: "bearer",
      },
    });
    assert.equal(tokens.access_token, "access");
    assert.equal(tokens.refresh_token, "refresh");
  });
});

describe("googleLoginReady", () => {
  it("is ready when Auth is on or a public client ID is present", () => {
    assert.equal(
      googleLoginReady({ authProviderEnabled: true, googleClientId: null }),
      true,
    );
    assert.equal(
      googleLoginReady({
        authProviderEnabled: false,
        googleClientId: CLIENT_ID,
      }),
      true,
    );
    assert.equal(
      googleLoginReady({ authProviderEnabled: false, googleClientId: null }),
      false,
    );
  });
});
