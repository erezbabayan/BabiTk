import { getMindTaskerAppLinks } from "../src/lib/app-links.js";
import { sendMindTaskerAppLinksNow } from "../src/services/backup-notification.service.js";

const links = getMindTaskerAppLinks();
const result = await sendMindTaskerAppLinksNow();

console.log(
  JSON.stringify(
    {
      web: links.web,
      android: links.android,
      whatsappSent: result.sent,
      whatsappSkipped: result.skipped,
      message: result.message,
    },
    null,
    2,
  ),
);
