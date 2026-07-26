import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { Jimp } from "jimp";
import jsQR from "jsqr";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2] ?? "exp://10.0.0.14:8081";
const pngPath = path.join(root, "assets", "expo-connect-qr.png");
const htmlPath = path.join(root, "assets", "expo-connect-qr.html");

await QRCode.toFile(pngPath, url, {
  errorCorrectionLevel: "H",
  width: 1024,
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
});

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MindTasker Expo QR</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      font-family: "Segoe UI", Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
    }
    img {
      width: min(90vw, 520px);
      height: auto;
      image-rendering: pixelated;
      border: 1px solid #e2e8f0;
    }
    code {
      font-size: 18px;
      background: #f1f5f9;
      padding: 8px 12px;
      border-radius: 8px;
      direction: ltr;
    }
    p { color: #64748b; max-width: 480px; text-align: center; margin: 0; }
  </style>
</head>
<body>
  <h1>סרוק עם Expo Go</h1>
  <img src="./expo-connect-qr.png" alt="Expo QR" />
  <code>${url}</code>
  <p>פתח Expo Go ← Scan QR. אל תסרוק עם מצלמת המערכת.</p>
</body>
</html>
`;

fs.writeFileSync(htmlPath, html, "utf8");

const img = await Jimp.read(pngPath);
const decoded = jsQR(
  new Uint8ClampedArray(img.bitmap.data),
  img.bitmap.width,
  img.bitmap.height,
);

if (!decoded || decoded.data !== url) {
  console.error("QR verify failed:", decoded?.data ?? null);
  process.exit(1);
}

console.log("ok", url);
console.log("png", pngPath);
console.log("html", htmlPath);
