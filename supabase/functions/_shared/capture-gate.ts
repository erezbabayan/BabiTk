/**
 * Capture-group gate for Edge Functions.
 * Keep in sync with convex/lib/whatsappCaptureGroup.ts evaluateCaptureGate.
 */

import {
  isGroupWhatsAppChat,
  isPersonalWhatsAppChat,
  normalizeGroupChatId,
  personalCaptureChatId,
} from "./green-api.ts";

export function isDefaultPersonalCaptureName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    trimmed.includes("הודעה לעצמי") ||
    lower.includes("babitk") ||
    lower.includes("message yourself")
  );
}

export function isNamedMessageYourselfChat(chatName?: string): boolean {
  const name = chatName?.trim() ?? "";
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    name.includes("הודעה לעצמי") ||
    lower.includes("message yourself") ||
    lower.includes("babitk")
  );
}

export type CaptureGateUser = {
  phone?: string | null;
  captureGroupChatId?: string | null;
  captureGroupName?: string | null;
};

export type CaptureGateDecision =
  | { allowed: true; bind?: { chatId: string; name: string | null } }
  | { allowed: false; reason: string };

export function evaluateCaptureGate(
  user: CaptureGateUser,
  chatId: string,
  chatName?: string,
): CaptureGateDecision {
  const incoming = normalizeGroupChatId(chatId);
  const configured = user.captureGroupChatId?.trim() ?? "";
  const configuredName = user.captureGroupName?.trim() ?? "";
  const personalId = personalCaptureChatId(user.phone);

  if (configuredName && chatName?.trim() && configuredName === chatName.trim()) {
    if (normalizeGroupChatId(configured) !== incoming) {
      return { allowed: true, bind: { chatId: incoming, name: configuredName } };
    }
    return { allowed: true };
  }

  if (!configured) {
    const personalMatch = personalId
      ? normalizeGroupChatId(personalId) === incoming
      : false;
    if (personalMatch || (isPersonalWhatsAppChat(incoming) && isNamedMessageYourselfChat(chatName))) {
      return {
        allowed: true,
        bind: {
          chatId: incoming,
          name: chatName?.trim() || configuredName || "הודעה לעצמי",
        },
      };
    }
    return { allowed: false, reason: "capture_group_not_set" };
  }

  const configuredNorm = normalizeGroupChatId(configured);
  if (configuredNorm === incoming) {
    return { allowed: true };
  }

  if (
    isGroupWhatsAppChat(configuredNorm) &&
    personalId &&
    normalizeGroupChatId(personalId) === incoming
  ) {
    return { allowed: true };
  }

  if (isPersonalWhatsAppChat(configuredNorm) && isGroupWhatsAppChat(incoming)) {
    if (isDefaultPersonalCaptureName(configuredName)) {
      return {
        allowed: true,
        bind: {
          chatId: incoming,
          name: chatName?.trim() || "קבוצת קליטה",
        },
      };
    }
  }

  return { allowed: false, reason: "wrong_capture_group" };
}
