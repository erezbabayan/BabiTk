import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { GenericId } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { normalizePhone } from "./lib/phone";
import { splitFullName } from "./lib/userDisplayName";

const DEFAULT_AUDIO_SECONDS = 1800;
const LEGACY_DEMO_ID = "00000000-0000-4000-8000-000000000001";

function readProfileString(profile: Record<string, unknown>, key: string): string {
  const value = profile[key];
  return typeof value === "string" ? value.trim() : "";
}

async function applyUserDefaults(
  ctx: MutationCtx,
  userId: Id<"users">,
  existingUserId: Id<"users"> | null,
  profile: Record<string, unknown>,
) {
  const user = await ctx.db.get("users", userId);
  if (!user) return;

  const now = Date.now();
  const patch: Record<string, unknown> = {};

  if (user.phoneVerified === undefined) patch.phoneVerified = false;
  if (user.tier === undefined) patch.tier = "free";
  if (user.allocatedAudioSeconds === undefined) {
    patch.allocatedAudioSeconds = DEFAULT_AUDIO_SECONDS;
  }
  if (user.usedAudioSeconds === undefined) patch.usedAudioSeconds = 0;
  if (user.createdAt === undefined) patch.createdAt = now;
  patch.updatedAt = now;

  if (existingUserId === null && user.email && !user.legacyId) {
    patch.legacyId = `${userId}`;
  }

  const profileFirst = readProfileString(profile, "firstName");
  const profileLast = readProfileString(profile, "lastName");
  const profileName = readProfileString(profile, "name");
  const profilePhone = readProfileString(profile, "phone");

  if (profileFirst) patch.firstName = profileFirst;
  if (profileLast) patch.lastName = profileLast;
  if (profileFirst || profileLast) {
    patch.name = [profileFirst, profileLast].filter(Boolean).join(" ");
  } else if (profileName) {
    patch.name = profileName;
    const split = splitFullName(profileName);
    if (split.firstName) patch.firstName = split.firstName;
    if (split.lastName) patch.lastName = split.lastName;
  }

  if (profilePhone) {
    patch.phone = normalizePhone(profilePhone);
  }

  if (user.name && !patch.firstName && !patch.lastName && !user.firstName && !user.lastName) {
    const { firstName, lastName } = splitFullName(user.name);
    if (firstName) patch.firstName = firstName;
    if (lastName) patch.lastName = lastName;
  }

  if (user.firstName && user.lastName && !user.name && !patch.name) {
    patch.name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch("users", userId, patch);
  }
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "")
          .trim()
          .toLowerCase();
        if (!email) {
          throw new Error("יש להזין אימייל");
        }

        const flow = params.flow as string | undefined;
        if (flow !== "signUp") {
          return { email } as { email: string };
        }

        const firstName = String(params.firstName ?? "").trim();
        const lastName = String(params.lastName ?? "").trim();
        const phoneRaw = String(params.phone ?? "").trim();

        if (!firstName) throw new Error("יש להזין שם פרטי");
        if (!lastName) throw new Error("יש להזין שם משפחה");
        if (!phoneRaw) throw new Error("יש להזין מספר טלפון");

        const digits = phoneRaw.replace(/\D/g, "");
        if (digits.length < 9) {
          throw new Error("מספר טלפון לא תקין");
        }

        const phone = normalizePhone(phoneRaw);
        const name = [firstName, lastName].filter(Boolean).join(" ");

        return {
          email,
          firstName,
          lastName,
          name,
          phone,
          phoneVerified: false as const,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      if (existingUserId !== null) {
        await applyUserDefaults(ctx, existingUserId, existingUserId, profile);
        return existingUserId;
      }

      const email =
        typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
      let linkedUserId: Id<"users"> | null = null;

      if (email) {
        const matches = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), email))
          .take(2);
        if (matches.length === 1) {
          linkedUserId = matches[0]!._id;
        }
      }

      if (!linkedUserId) {
        const legacyMatches = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("legacyId"), LEGACY_DEMO_ID))
          .take(2);
        const legacyUser = legacyMatches.length === 1 ? legacyMatches[0]! : null;
        if (legacyUser) {
          const legacyEmail = legacyUser.email?.trim().toLowerCase() ?? "";
          const isDemoEmail = legacyEmail.endsWith("@demo.mindtasker.local");
          if (isDemoEmail || !legacyEmail) {
            linkedUserId = legacyUser._id;
          }
        }
      }

      const {
        emailVerified: profileEmailVerified,
        phoneVerified: profilePhoneVerified,
        ...profileFields
      } = profile;

      const userData = {
        ...(profileEmailVerified ? { emailVerificationTime: Date.now() } : null),
        ...(profilePhoneVerified ? { phoneVerificationTime: Date.now() } : null),
        ...profileFields,
      };

      let userId: Id<"users">;
      if (linkedUserId) {
        userId = linkedUserId;
        await ctx.db.patch("users", userId, userData);
        await applyUserDefaults(ctx, userId, linkedUserId, profile);
      } else {
        userId = await ctx.db.insert("users", userData);
        await applyUserDefaults(ctx, userId, null, profile);
      }

      return userId as GenericId<"users">;
    },
  },
});
