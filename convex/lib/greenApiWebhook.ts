const DEFAULT_SETTINGS = {
  incomingWebhook: "yes",
  outgoingWebhook: "yes",
  outgoingMessageWebhook: "yes",
  enableMessagesHistory: "yes",
  outgoingAPIMessageWebhook: "no",
  stateWebhook: "yes",
  keepOnlineStatus: "yes",
  markIncomingMessagesReaded: "no",
  markIncomingMessagesReadedOnReply: "no",
} as const;

/** Green-API setSettings body — token goes in webhookUrlToken, never in the URL. */
export function greenApiSetSettingsBody(
  webhookUrl: string,
  webhookUrlToken: string,
): Record<string, string> {
  return {
    webhookUrl,
    webhookUrlToken,
    ...DEFAULT_SETTINGS,
  };
}

export function webhookUrlHasQueryToken(webhookUrl: string): boolean {
  try {
    return new URL(webhookUrl).searchParams.has("token");
  } catch {
    return /[?&]token=/.test(webhookUrl);
  }
}
