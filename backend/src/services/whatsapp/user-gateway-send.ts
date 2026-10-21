import { sendWhatsAppOutbound } from "./outbound.js";

export interface UserGreenApiGateway {
  instance_id: string;
  api_token: string;
  api_url: string;
}

export async function sendViaUserGreenApi(
  gateway: UserGreenApiGateway,
  toPhoneOrChatId: string,
  message: string,
): Promise<void> {
  await sendWhatsAppOutbound(
    { to: toPhoneOrChatId, body: message },
    {
      instanceId: gateway.instance_id,
      token: gateway.api_token,
      baseUrl: gateway.api_url,
    },
  );
}
