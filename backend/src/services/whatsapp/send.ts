import { env } from "../../config/env.js";
import type { WhatsAppProviderId } from "../../types/whatsapp.js";
import { sendWhatsAppOutbound } from "./outbound.js";

export async function sendWhatsAppText(
  to: string,
  body: string,
  provider: WhatsAppProviderId = env.whatsappProvider,
): Promise<void> {
  await sendWhatsAppOutbound({ to, body }, provider);
}
