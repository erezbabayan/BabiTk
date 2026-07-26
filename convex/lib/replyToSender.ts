import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Mark the inbound WhatsApp message as read (double read ticks).
 * Used instead of sending a confirmation text reply.
 */
export async function markSenderMessageRead(
  ctx: ActionCtx,
  options: { chatId?: string; messageId?: string },
): Promise<void> {
  const chatId = options.chatId?.trim();
  if (!chatId) return;
  await ctx.runAction(internal.whatsappSend.markRead, {
    chatId,
    messageId: options.messageId,
  });
}

/**
 * Rare operational replies (unlinked phone, etc.). Prefer mark-as-read for capture.
 */
export async function replyToSender(
  ctx: ActionCtx,
  senderPhone: string | undefined,
  message: string,
  options?: { chatId?: string },
): Promise<void> {
  const toPhone = senderPhone?.trim() || options?.chatId?.trim();
  if (!toPhone) return;
  await ctx.runAction(internal.whatsappSend.sendReply, {
    toPhone,
    message,
    chatId: options?.chatId,
    sameChat: true,
  });
}
