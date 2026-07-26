"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  fetchGreenApiCaptureChats,
  type GreenApiCredentials,
} from "./lib/greenApiSend";
import { normalizeGroupChatId } from "./lib/whatsappCaptureGroup";

type BindResult = {
  ok: boolean;
  chatId?: string;
  name?: string;
  reason?: string;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickMatchingGroup(
  groups: Array<{ chatId: string; name: string }>,
  wanted: string,
): { chatId: string; name: string } | null {
  const needle = normalizeName(wanted);
  if (!needle) return null;

  const exact = groups.find((row) => normalizeName(row.name) === needle);
  if (exact) return exact;

  // Prefer shortest partial match (e.g. "משימות" → "משימות ארז")
  const partials = groups
    .filter((row) => normalizeName(row.name).includes(needle))
    .sort((a, b) => a.name.length - b.name.length);
  return partials[0] ?? null;
}

/**
 * List WhatsApp groups for search-based binding.
 * Does not block on yellowCard — list APIs often still work.
 */
export const listCaptureGroups = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    groups: v.array(
      v.object({
        chatId: v.string(),
        name: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    ok: boolean;
    groups: Array<{ chatId: string; name: string }>;
    reason?: string;
  }> => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) {
      return { ok: false, groups: [], reason: "Not authenticated" };
    }

    const greenApiCredentials: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!greenApiCredentials) {
      return {
        ok: false,
        groups: [],
        reason: "Green-API לא מוגדר — אי אפשר לטעון קבוצות",
      };
    }

    try {
      const rows = await fetchGreenApiCaptureChats(greenApiCredentials);
      return {
        ok: true,
        groups: rows.map((row) => ({
          chatId: normalizeGroupChatId(row.chatId),
          name: row.name,
        })),
      };
    } catch (error) {
      return {
        ok: false,
        groups: [],
        reason:
          error instanceof Error
            ? error.message
            : "טעינת רשימת הקבוצות נכשלה",
      };
    }
  },
});

/**
 * Bind an existing WhatsApp group by name (default: the user's display name).
 * Never creates a new group. Supports partial name match (e.g. משימות → משימות ארז).
 */
export const bindExistingCaptureGroup = action({
  args: {
    groupName: v.optional(v.string()),
    replaceExisting: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    chatId: v.optional(v.string()),
    name: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<BindResult> => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) {
      return { ok: false, reason: "Not authenticated" };
    }

    const profile: {
      phone: string | null;
      phoneVerified: boolean;
      captureGroupChatId: string | null;
      captureGroupName: string | null;
      userName: string | null;
    } | null = await ctx.runQuery(internal.users.getCaptureSetupInternal, {
      userId,
    });
    if (!profile?.phone || !profile.phoneVerified) {
      return {
        ok: false,
        reason: "קודם קשר מספר וואטסאפ מאומת בהגדרות",
      };
    }

    const wantedName =
      args.groupName?.trim() ||
      profile.userName?.trim() ||
      "";
    if (!wantedName) {
      return {
        ok: false,
        reason: "הזינו שם קבוצה קיימת לחיבור",
      };
    }

    const replaceExisting = args.replaceExisting !== false;
    const existing = profile.captureGroupChatId?.trim();
    if (
      existing &&
      existing.endsWith("@g.us") &&
      normalizeName(profile.captureGroupName ?? "").includes(
        normalizeName(wantedName),
      ) &&
      !replaceExisting
    ) {
      return {
        ok: true,
        chatId: existing,
        name: profile.captureGroupName ?? wantedName,
        reason: "already_configured",
      };
    }

    const greenApiCredentials: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!greenApiCredentials) {
      return { ok: false, reason: "Green-API לא מוגדר במערכת" };
    }

    try {
      const chats = await fetchGreenApiCaptureChats(greenApiCredentials);
      const found = pickMatchingGroup(
        chats.map((row) => ({
          chatId: normalizeGroupChatId(row.chatId),
          name: row.name,
        })),
        wantedName,
      );
      if (!found) {
        return {
          ok: false,
          reason: `לא נמצאה קבוצה עם «${wantedName}» בשם. בדקו את האיות או שלחו הודעה מהקבוצה לחיבור.`,
        };
      }

      await ctx.runMutation(internal.users.bindCaptureGroupInternal, {
        userId,
        chatId: found.chatId,
        name: found.name.trim() || wantedName,
      });

      return {
        ok: true,
        chatId: found.chatId,
        name: found.name.trim() || wantedName,
        reason: "bound_existing",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason:
          message ||
          `חיבור לקבוצה «${wantedName}» נכשל. שלחו הודעה מהקבוצה בוואטסאפ.`,
      };
    }
  },
});

/** Alias for older clients — binds existing group by user name, never creates. */
export const createBabiTkCaptureGroup = action({
  args: {
    replaceExisting: v.optional(v.boolean()),
    groupName: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    chatId: v.optional(v.string()),
    name: v.optional(v.string()),
    inviteLink: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<BindResult & { inviteLink?: string }> => {
    // Inline same logic via bindExistingCaptureGroup path — call shared query/mutation
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) {
      return { ok: false, reason: "Not authenticated" };
    }

    const profile: {
      phone: string | null;
      phoneVerified: boolean;
      captureGroupChatId: string | null;
      captureGroupName: string | null;
      userName: string | null;
    } | null = await ctx.runQuery(internal.users.getCaptureSetupInternal, {
      userId,
    });
    if (!profile?.phone || !profile.phoneVerified) {
      return {
        ok: false,
        reason: "קודם קשר מספר וואטסאפ מאומת בהגדרות",
      };
    }

    const wantedName =
      args.groupName?.trim() || profile.userName?.trim() || "";
    if (!wantedName) {
      return { ok: false, reason: "הזינו שם קבוצה קיימת לחיבור" };
    }

    const greenApiCredentials: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!greenApiCredentials) {
      return { ok: false, reason: "Green-API לא מוגדר במערכת" };
    }

    try {
      const chats = await fetchGreenApiCaptureChats(greenApiCredentials);
      const found = pickMatchingGroup(
        chats.map((row) => ({
          chatId: normalizeGroupChatId(row.chatId),
          name: row.name,
        })),
        wantedName,
      );
      if (!found) {
        return {
          ok: false,
          reason: `לא נמצאה קבוצה עם «${wantedName}» בשם.`,
        };
      }
      await ctx.runMutation(internal.users.bindCaptureGroupInternal, {
        userId,
        chatId: found.chatId,
        name: found.name.trim() || wantedName,
      });
      return {
        ok: true,
        chatId: found.chatId,
        name: found.name.trim() || wantedName,
        reason: "bound_existing",
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "חיבור נכשל",
      };
    }
  },
});
