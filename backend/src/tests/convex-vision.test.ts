import { describe, it } from "node:test";

import assert from "node:assert/strict";



import {

  notebookLinguisticEditPrompt,

  notebookVisionTranscriptionPrompt,

  type NotebookOcrMetadata,

} from "../../../convex/lib/ingest/notebookOcr.js";



describe("Convex Vision OCR prompts", () => {

  it("vision prompt requests verbatim transcription", () => {

    assert.match(notebookVisionTranscriptionPrompt, /מילה במילה/);

    assert.match(notebookVisionTranscriptionPrompt, /סימן שאלה/);

  });



  it("linguistic edit prompt forbids inventing content", () => {

    assert.match(notebookLinguisticEditPrompt, /אל תוסיף מידע/);

    assert.match(notebookLinguisticEditPrompt, /JSON/);

  });



  it("notebook OCR metadata shape covers raw and corrected text", () => {

    const metadata: NotebookOcrMetadata = {

      raw_transcription: "לקנות חלב בשעב ?",

      corrected_transcription: "לקנות חלב בשעה ?",

    };

    assert.ok(metadata.raw_transcription.includes("?"));

    assert.match(metadata.corrected_transcription, /בשעה/);

  });

});



describe("Green-API image webhook shape", () => {

  it("parser exposes imageUrl for imageMessage", async () => {

    const { parseGreenApiWebhook } = await import("../../../convex/lib/greenApiParser.js");

    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "img1",
      instanceData: { wid: "972526448067@c.us" },
      senderData: {
        chatId: "120363000000000001@g.us",
        sender: "972526448067@c.us",
      },
      messageData: {
        typeMessage: "imageMessage",
        fileMessageData: {
          downloadUrl: "https://api.greenapi.com/download/photo.jpg",
          mimeType: "image/jpeg",
        },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
    assert.equal(messages[0]?.imageUrl, "https://api.greenapi.com/download/photo.jpg");
  });

  it("parser accepts imageMessage without downloadUrl in capture group", async () => {
    const { parseGreenApiWebhook } = await import("../../../convex/lib/greenApiParser.js");
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "outgoingMessageReceived",
      idMessage: "img-no-url",
      instanceData: { wid: "972526448067@c.us" },
      senderData: {
        chatId: "120363000000000001@g.us",
        sender: "972526448067@c.us",
      },
      messageData: {
        typeMessage: "imageMessage",
        fileMessageData: { mimeType: "image/jpeg" },
      },
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
    assert.equal(messages[0]?.chatId, "120363000000000001@g.us");
  });

});



describe("Vision pipeline module", () => {

  it("exports processNotebookImage action", async () => {

    const vision = await import("../../../convex/visionPipeline.js");

    assert.equal(typeof vision.processNotebookImage, "function");

  });



  it("openaiPipeline exposes vision and refine helpers", async () => {

    const pipeline = await import("../../../convex/openaiPipeline.js");

    assert.equal(typeof pipeline.transcribeNotebookImageVision, "function");

    assert.equal(typeof pipeline.refineNotebookTranscription, "function");

    assert.equal(typeof pipeline.processNotebookOcr, "function");

  });

});

