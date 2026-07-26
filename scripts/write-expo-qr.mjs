import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const url = process.argv[2] ?? "exp://n4a_0fq-anonymous-8081.exp.direct";
const out = process.argv[3] ?? "assets/expo-connect-qr.png";

try {
  const require = createRequire(import.meta.url);
  const QR = require("qrcode");
  await QR.toFile(out, url, { width: 512, margin: 2 });
  console.log(`Wrote ${out} for ${url}`);
} catch (error) {
  console.error("qrcode package unavailable:", error instanceof Error ? error.message : error);
  writeFileSync(
    out.replace(/\.png$/, ".txt"),
    url + "\n",
    "utf8",
  );
  console.log(`Wrote text URL instead: ${url}`);
  process.exitCode = 1;
}
