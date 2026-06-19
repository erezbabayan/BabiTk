import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

export async function replyToSender(
  ctx: ActionCtx,
  senderPhone: string | undefined,
  message: string,
): Promise<void> {
  if (!senderPhone?.trim()) return;
  await ctx.runAction(internal.whatsappSend.sendReply, {
    toPhone: senderPhone,
    message,
  });
}
