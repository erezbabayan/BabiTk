import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ANDROID_REMINDER_CHANNEL_ID,
  buildItemReminderPushMessages,
  type ExpoNotificationPushMessage,
  headlessPushTokens,
  isExpoPushToken,
  PUSH_FORMAT_HEADLESS,
  pushReminderFireStamp,
  REMINDER_CATEGORY_NOTE,
  REMINDER_CATEGORY_TASK,
  sendExpoPushMessages,
  shouldSendItemPush,
  summarizeExpoPushTickets,
  uniqueExpoPushTokens,
  withPushReminderStamp,
} from "../../../supabase/functions/_shared/expo-push.ts";
import {
  patchAfterReminderSent,
  resolveItemNotifyAt,
  stampWhatsAppReminderFireAt,
} from "../../../supabase/functions/_shared/whatsapp-reminders.ts";
import {
  headlessReminderFromTaskPayload,
  PUSH_FORMAT_HEADLESS as MOBILE_PUSH_FORMAT,
} from "../../../mobile/src/lib/reminder-notification-actions.ts";

const DUE = "2026-11-11T09:00:00.000Z";
const TOKEN = "ExponentPushToken[abc123]";

describe("expo push token selection", () => {
  it("keeps Expo tokens and drops anything else, once each", () => {
    assert.equal(isExpoPushToken(TOKEN), true);
    assert.equal(isExpoPushToken("ExpoPushToken[xyz]"), true);
    assert.equal(isExpoPushToken("ExponentPushToken[]"), false);
    assert.equal(isExpoPushToken("fcm-device-token"), false);
    assert.deepEqual(uniqueExpoPushTokens([TOKEN, TOKEN, "nope", "ExpoPushToken[xyz]"]), [
      TOKEN,
      "ExpoPushToken[xyz]",
    ]);
  });
});

describe("item reminder push payload", () => {
  it("uses the high-importance reminders channel and a stable data shape", () => {
    const [message] = buildItemReminderPushMessages([TOKEN, "not-a-token"], {
      id: "item-1",
      title: "  לקנות חלב  ",
      notifyAt: DUE,
    });
    assert.equal(ANDROID_REMINDER_CHANNEL_ID, "reminders");
    assert.deepEqual(message, {
      to: TOKEN,
      title: "תזכורת",
      body: "לקנות חלב",
      sound: "default",
      priority: "high",
      channelId: "reminders",
      categoryId: "item_reminder_task",
      data: { source: "server_push", itemId: "item-1", fireAt: DUE },
    });
  });

  it("gives notes the snooze-only category, tasks the full one", () => {
    const [note] = buildItemReminderPushMessages([TOKEN], {
      id: "n1",
      title: "רעיון",
      notifyAt: DUE,
      isActionable: false,
    });
    const [task] = buildItemReminderPushMessages([TOKEN], {
      id: "t1",
      title: "משימה",
      notifyAt: DUE,
      isActionable: true,
    });
    assert.equal((note as ExpoNotificationPushMessage | undefined)?.categoryId, REMINDER_CATEGORY_NOTE);
    assert.equal((task as ExpoNotificationPushMessage | undefined)?.categoryId, REMINDER_CATEGORY_TASK);
  });

  it("skips a disabled reminder the same way WhatsApp does", () => {
    assert.equal(
      resolveItemNotifyAt({
        is_actionable: true,
        due_date: DUE,
        metadata: { reminder_disabled: true },
      }),
      null,
    );
  });
});

describe("push stamp does not change the WhatsApp patch", () => {
  it("leaves metadata untouched when the push was not delivered", () => {
    const metadata = { analysis: { notify_at: DUE }, note: "keep" };
    const stamped = withPushReminderStamp(metadata, DUE, false);
    assert.equal(stamped, metadata);
    const whatsappOnly = patchAfterReminderSent({ due_date: DUE, metadata: stamped }, DUE);
    const expected = patchAfterReminderSent({ due_date: DUE, metadata }, DUE);
    assert.deepEqual(whatsappOnly, expected);
    assert.equal(pushReminderFireStamp(stampWhatsAppReminderFireAt(whatsappOnly.metadata, DUE)), null);
  });

  it("records the push once and still marks WhatsApp sent on the same fire", () => {
    const stamped = withPushReminderStamp({ note: "keep" }, DUE, true);
    assert.equal(shouldSendItemPush(stamped, DUE), false);
    assert.equal(shouldSendItemPush({ note: "keep" }, DUE), true);
    const after = patchAfterReminderSent({ due_date: DUE, metadata: stamped }, DUE);
    const finalMeta = stampWhatsAppReminderFireAt(after.metadata, DUE);
    assert.equal(finalMeta.push_reminder_fire_at, DUE);
    assert.equal(finalMeta.whatsapp_reminder_fire_at, DUE);
    assert.equal(finalMeta.reminder_sent, true);
    assert.equal(finalMeta.note, "keep");
    assert.equal(after.due_date, undefined);
  });

  it("keeps the push stamp when a recurring reminder rolls forward", () => {
    const stamped = withPushReminderStamp({ reminder_recurrence: "daily" }, DUE, true);
    const after = patchAfterReminderSent({ due_date: DUE, metadata: stamped }, DUE);
    assert.equal(after.metadata.push_reminder_fire_at, DUE);
    assert.equal(after.metadata.reminder_sent, false);
    assert.notEqual(after.due_date, DUE);
    assert.equal(shouldSendItemPush(after.metadata, String(after.due_date)), true);
  });
});

describe("sendExpoPushMessages", () => {
  it("posts once and reports DeviceNotRegistered without logging the token", async () => {
    const bodies: unknown[] = [];
    const auths: Array<string | null> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const headers = new Headers(init?.headers);
      auths.push(headers.get("authorization"));
      return new Response(
        JSON.stringify({
          data: [
            { status: "ok", id: "ticket-1" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      );
    };
    const messages = buildItemReminderPushMessages([TOKEN, "ExpoPushToken[dead]"], {
      id: "item-1",
      title: "חלב",
      notifyAt: DUE,
    });
    const result = await sendExpoPushMessages(messages, {
      accessToken: "expo-secret",
      fetchImpl,
    });
    assert.equal(bodies.length, 1);
    assert.equal(result.delivered, 1);
    assert.deepEqual(result.invalidTokens, ["ExpoPushToken[dead]"]);
    assert.equal(auths[0], "Bearer expo-secret");
    assert.deepEqual(
      summarizeExpoPushTickets([TOKEN], { data: { status: "ok", id: "one" } }),
      { delivered: 1, invalidTokens: [] },
    );
  });

  it("does not call Expo when there is no token, and does not stamp a failed send", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("nope", { status: 500 });
    };
    const empty = await sendExpoPushMessages([], { fetchImpl });
    assert.deepEqual(empty, { delivered: 0, invalidTokens: [] });
    assert.equal(calls, 0);
    const failed = await sendExpoPushMessages(
      buildItemReminderPushMessages([TOKEN], { id: "item-1", title: "חלב", notifyAt: DUE }),
      { fetchImpl },
    );
    assert.equal(failed.delivered, 0);
    assert.equal(shouldSendItemPush(withPushReminderStamp({}, DUE, false), DUE), true);
  });
});

describe("reminder function wiring", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../supabase/functions/whatsapp-send-reminders/index.ts", import.meta.url)),
    "utf8",
  );

  it("still stamps WhatsApp only after a successful send, and pushes beside that", () => {
    assert.match(source, /if \(!delivered\) continue;/);
    assert.match(source, /metadata: metadataForWrite/);
    assert.match(source, /stampWhatsAppReminderFireAt\(after\.metadata, notifyAt\)/);
    assert.match(source, /deliverItemPush\(item\.user_id, item, notifyAt\)/);
    assert.match(source, /shouldSendItemPush\(metadata, notifyAt\)/);
  });
});

describe("android FCM client config script", () => {
  const script = fileURLToPath(new URL("../../../scripts/apply-android-fcm-client.mjs", import.meta.url));

  function run(secret: string | undefined) {
    const root = mkdtempSync(path.join(tmpdir(), "babitk-fcm-"));
    const mobile = path.join(root, "mobile");
    mkdirSync(mobile, { recursive: true });
    writeFileSync(
      path.join(mobile, "app.json"),
      `${JSON.stringify({ expo: { android: { package: "com.mindtasker.app" } } }, null, 2)}\n`,
    );
    // mkdir via write of app.json's parent
    const env: NodeJS.ProcessEnv = { ...process.env, ANDROID_FCM_ROOT: root };
    if (secret === undefined) delete env.GOOGLE_SERVICES_JSON;
    else env.GOOGLE_SERVICES_JSON = secret;
    const result = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
    return { root, ...result };
  }

  it("leaves the project alone when the secret is missing", () => {
    const { status, stdout, root } = run(undefined);
    assert.equal(status, 0);
    assert.match(stdout, /GOOGLE_SERVICES_JSON is not set/);
    const app = JSON.parse(readFileSync(path.join(root, "mobile/app.json"), "utf8"));
    assert.equal(app.expo.android.googleServicesFile, undefined);
  });

  it("refuses a service-account key and does not print it", () => {
    const privateKey = "-----BEGIN PRIVATE KEY-----not-a-real-key-----END PRIVATE KEY-----";
    const { status, stdout, stderr, root } = run(
      JSON.stringify({ type: "service_account", private_key: privateKey, project_id: "demo" }),
    );
    assert.equal(status, 1);
    assert.match(stderr, /service account key/);
    assert.equal(stdout.includes(privateKey), false);
    assert.equal(stderr.includes(privateKey), false);
    const app = JSON.parse(readFileSync(path.join(root, "mobile/app.json"), "utf8"));
    assert.equal(app.expo.android.googleServicesFile, undefined);
  });

  it("writes google-services.json only for the BabiTk package", () => {
    const apiKey = "AIza-test-client-key";
    const config = {
      project_info: { project_id: "babitk-demo" },
      client: [
        {
          client_info: { android_client_info: { package_name: "com.mindtasker.app" } },
          api_key: [{ current_key: apiKey }],
        },
      ],
    };
    const { status, stdout, stderr, root } = run(JSON.stringify(config));
    assert.equal(status, 0, stderr);
    assert.match(stdout, /com\.mindtasker\.app/);
    assert.equal(stdout.includes(apiKey), false);
    const written = JSON.parse(readFileSync(path.join(root, "mobile/google-services.json"), "utf8"));
    assert.equal(written.client[0].api_key[0].current_key, apiKey);
    const app = JSON.parse(readFileSync(path.join(root, "mobile/app.json"), "utf8"));
    assert.equal(app.expo.android.googleServicesFile, "./google-services.json");

    const wrong = run(
      JSON.stringify({
        project_info: { project_id: "other" },
        client: [{ client_info: { android_client_info: { package_name: "com.other.app" } } }],
      }),
    );
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /com\.mindtasker\.app/);
  });
});

describe("headless reminder push (buttons in background/killed)", () => {
  it("sends data-only to headless-capable tokens and the classic message to the rest", () => {
    const OLD = "ExponentPushToken[old]";
    const headless = headlessPushTokens([
      { token: TOKEN, push_format: PUSH_FORMAT_HEADLESS },
      { token: OLD, push_format: null },
      { token: "junk", push_format: PUSH_FORMAT_HEADLESS },
      { token: "ExponentPushToken[nocol]" },
    ]);
    assert.deepEqual([...headless], [TOKEN]);
    const [newer, older] = buildItemReminderPushMessages(
      [TOKEN, OLD],
      { id: "item-1", title: " לקנות חלב ", notifyAt: DUE, isActionable: true },
      { headlessTokens: headless },
    );
    assert.deepEqual(newer, {
      to: TOKEN,
      priority: "high",
      _contentAvailable: true,
      data: {
        source: "server_push",
        kind: "item_reminder",
        itemId: "item-1",
        fireAt: DUE,
        reminderTitle: "תזכורת",
        reminderBody: "לקנות חלב",
        categoryId: REMINDER_CATEGORY_TASK,
      },
    });
    // No title/body/channelId at top level, or Expo turns it into a tray Notification Message.
    assert.equal("title" in (newer as object), false);
    assert.equal("channelId" in (newer as object), false);
    assert.equal((older as { title?: string }).title, "תזכורת");
  });

  it("phone side reads the task payload the way Android delivers it (data.dataString)", () => {
    const [message] = buildItemReminderPushMessages(
      [TOKEN],
      { id: "n1", title: "רעיון", notifyAt: DUE, isActionable: false },
      { headlessTokens: new Set([TOKEN]) },
    );
    const payload = { notification: null, data: { dataString: JSON.stringify(message?.data) } };
    const reminder = headlessReminderFromTaskPayload(payload);
    assert.ok(reminder);
    assert.equal(reminder.title, "תזכורת");
    assert.equal(reminder.body, "רעיון");
    assert.equal(reminder.categoryId, REMINDER_CATEGORY_NOTE);
    assert.deepEqual(reminder.data, { source: "server_push", itemId: "n1", fireAt: DUE });
    assert.match(reminder.identifier, /^server_reminder_n1_[0-9A-Za-z]+$/);
    assert.equal(MOBILE_PUSH_FORMAT, PUSH_FORMAT_HEADLESS);
  });

  it("ignores responses, other pushes and bad JSON", () => {
    assert.equal(headlessReminderFromTaskPayload({ actionIdentifier: "x", notification: {} }), null);
    assert.equal(headlessReminderFromTaskPayload({ data: { dataString: "{" } }), null);
    assert.equal(
      headlessReminderFromTaskPayload({ data: { dataString: JSON.stringify({ source: "other" }) } }),
      null,
    );
    assert.equal(headlessReminderFromTaskPayload(null), null);
  });
});
