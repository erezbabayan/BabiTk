import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { replyToSender, markSenderMessageRead } from "./replyToSender";
import {
  answerWhatsAppSystemQuestion,
  parseWhatsAppSystemQuestion,
} from "./whatsappSystemQuestion";

/**
 * If this WhatsApp text is a system question, reply in the same chat and
 * skip creating a task/note. Returns true when handled.
 */
export async function replyIfWhatsAppSystemQuestion(
  ctx: ActionCtx,
  params: {
    userId: Id<"users">;
    messageId: string;
    text: string;
    senderPhone?: string;
    chatId?: string;
  },
): Promise<boolean> {
  const parsed = parseWhatsAppSystemQuestion(params.text);
  if (parsed.kind === "none") return false;

  const items = await ctx.runQuery(internal.items.listOpenForSystemQuestion, {
    userId: params.userId,
  });
  const message = answerWhatsAppSystemQuestion(parsed, items);
  await replyToSender(ctx, params.senderPhone, message, { chatId: params.chatId });
  await markSenderMessageRead(ctx, {
    chatId: params.chatId,
    messageId: params.messageId,
  });
  await ctx.runMutation(internal.ingest.recordWhatsappSkip, {
    userId: params.userId,
    messageId: params.messageId,
  });
  return true;
}
