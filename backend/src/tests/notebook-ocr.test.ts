import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLikelyImageBytes,
  mimeForImageContainer,
  sniffImageContainer,
} from "../../../supabase/functions/_shared/image-bytes.ts";
import { parseGreenApiDownloadFileBody } from "../../../supabase/functions/_shared/green-api-media.ts";
import {
  historyImageMessage,
  parseGreenApiWebhook,
} from "../../../supabase/functions/_shared/green-api.ts";
import {
  clipOcrText,
  isVisionOcrConfigured,
  MAX_OCR_OUTPUT_CHARS,
  notebookVisionTranscriptionPrompt,
  textFromGeminiGenerateContent,
} from "../../../supabase/functions/_shared/notebook-ocr.ts";
import {
  needsOcrTranscription,
  OCR_PENDING_TITLE,
  OCR_UNAVAILABLE_TITLE,
} from "../../../supabase/functions/_shared/voice-text.ts";

function jpegHeader(): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.fill(1, 4);
  return bytes;
}

function pngHeader(): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.fill(1, 8);
  return bytes;
}

describe("notebook image sniff", () => {
  it("detects JPEG and PNG magic bytes", () => {
    assert.equal(sniffImageContainer(jpegHeader()), "jpeg");
    assert.equal(isLikelyImageBytes(jpegHeader()), true);
    assert.equal(sniffImageContainer(pngHeader()), "png");
    assert.equal(mimeForImageContainer("png"), "image/png");
  });

  it("parses Green-API downloadFile raw JPEG bodies", () => {
    const parsed = parseGreenApiDownloadFileBody(jpegHeader(), "application/octet-stream");
    assert.equal(parsed.bytes?.byteLength, 80);
    assert.equal(parsed.mimeType, "image/jpeg");
  });
});

describe("notebook OCR helpers", () => {
  it("asks vision to transcribe print and handwriting verbatim", () => {
    assert.match(notebookVisionTranscriptionPrompt, /מילה במילה/);
    assert.match(notebookVisionTranscriptionPrompt, /כתב יד/);
    assert.match(notebookVisionTranscriptionPrompt, /מסמך מודפס/);
  });

  it("clips OCR output to one dense page", () => {
    const clipped = clipOcrText("א".repeat(MAX_OCR_OUTPUT_CHARS + 40));
    assert.equal(clipped.length, MAX_OCR_OUTPUT_CHARS);
  });

  it("reads Gemini generateContent text parts", () => {
    const text = textFromGeminiGenerateContent({
      candidates: [
        { content: { parts: [{ text: "קנה חלב" }, { text: "\nשלם חשבון" }] } },
      ],
    });
    assert.equal(text, "קנה חלב\nשלם חשבון");
  });

  it("treats Gemini, Groq, or OpenAI as a configured vision engine", () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-gemini";
    try {
      assert.equal(isVisionOcrConfigured(), true);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });

  it("surfaces Gemini API error messages", () => {
    assert.throws(
      () => textFromGeminiGenerateContent({ error: { message: "API key not valid" } }),
      /API key not valid/,
    );
  });

  it("treats pending scan rows as needing OCR, not failed rows", () => {
    assert.equal(needsOcrTranscription(OCR_PENDING_TITLE, ""), true);
    assert.equal(needsOcrTranscription("תמונה מוואטסאפ", "תמונה מוואטסאפ"), true);
    assert.equal(needsOcrTranscription(OCR_UNAVAILABLE_TITLE, "זיהוי נכשל"), false);
  });
});

describe("Green-API notebook photo webhook", () => {
  const group = "120363000000000001@g.us";
  const owner = "972526448067@c.us";

  it("captures imageMessage jpegUrl without a caption", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "img-jpeg-url",
      instanceData: { wid: owner },
      senderData: { chatId: group, sender: owner },
      messageData: {
        typeMessage: "imageMessage",
        fileMessageData: {
          jpegUrl: "https://media.example.com/page.jpeg",
          mimeType: "image/jpeg",
        },
      },
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
    assert.equal(messages[0]?.imageUrl, "https://media.example.com/page.jpeg");
  });

  it("captures imageMessage without a caption", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "img-scan",
      instanceData: { wid: owner },
      senderData: { chatId: group, sender: owner },
      messageData: {
        typeMessage: "imageMessage",
        fileMessageData: {
          downloadUrl: "https://media.example.com/page.jpg",
          mimeType: "image/jpeg",
        },
      },
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
    assert.equal(messages[0]?.imageUrl, "https://media.example.com/page.jpg");
  });

  it("captures a documentMessage that is actually a photo", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "doc-scan",
      instanceData: { wid: owner },
      senderData: { chatId: group, sender: owner },
      messageData: {
        typeMessage: "documentMessage",
        fileMessageData: {
          downloadUrl: "https://media.example.com/note.png",
          mimeType: "image/png",
          fileName: "note.png",
        },
      },
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
  });

  it("maps group history photos into image messages for catch-up", () => {
    const photo = historyImageMessage(group, {
      idMessage: "hist-img",
      typeMessage: "imageMessage",
      type: "outgoing",
      downloadUrl: "https://media.example.com/note.jpg",
      mimeType: "image/jpeg",
    });
    assert.equal(photo?.type, "image");
    assert.equal(photo?.chatId, group);
    assert.equal(photo?.imageUrl, "https://media.example.com/note.jpg");
    assert.equal(
      historyImageMessage(group, {
        idMessage: "hist-api",
        typeMessage: "imageMessage",
        sendByApi: true,
      }),
      null,
    );
  });

  it("does not ingest a PDF document as an image", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "pdf-scan",
      instanceData: { wid: owner },
      senderData: { chatId: group, sender: owner },
      messageData: {
        typeMessage: "documentMessage",
        fileMessageData: {
          mimeType: "application/pdf",
          fileName: "invoice.pdf",
        },
      },
    });
    assert.equal(messages.length, 0);
  });
});
