import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { handlePaywallError, requireAiParseQuota } from "../middleware/usage.js";
import { ingestText } from "../services/ingest.service.js";
import { uploadSourceMedia } from "../services/items.service.js";
import { parseInputWithAI, processNotebookOCR, transcribeAudio } from "../services/openai.service.js";
import { getUserTagNames } from "../services/user-tags.service.js";
import { assertAiParseQuota, incrementAiParseUsage, estimateTextParseUnits, incrementAudioUsage } from "../services/usage.service.js";
import { requireAudioQuota } from "../middleware/usage.js";

const parseBodySchema = z.object({
  text: z.string().trim().min(3, "Text must be at least 3 characters"),
  timezone: z.string().min(1).optional(),
  locale: z.string().min(2).optional(),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  app.post("/parse", { preHandler: requireAuth }, async (request, reply) => {
    const body = parseBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: "validation_error",
        message: body.error.flatten(),
      });
    }

    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const units = estimateTextParseUnits(body.data.text);
      await requireAiParseQuota(request, reply, body.data.text);
      if (reply.sent) return;

      const allowedTags = await getUserTagNames(request.user.id);
      const result = await parseInputWithAI({ ...body.data, allowedTags });
      await incrementAiParseUsage(request.user.id, "ai_parse", units, {
        text_length: body.data.text.length,
        estimated_tokens: units,
      });
      return reply.send(result);
    } catch (error) {
      if (handlePaywallError(error, reply)) return;
      request.log.error({ err: error }, "parseInputWithAI failed");
      return reply.status(502).send({
        error: "ai_parse_failed",
        message:
          error instanceof Error ? error.message : "Failed to parse input with AI",
      });
    }
  });

  app.post("/notebook-ocr", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: "validation_error", message: "Image file required" });
    }

    const buffer = await file.toBuffer();
    const mimeType = file.mimetype || "image/jpeg";

    try {
      await assertAiParseQuota(request.user.id);

      const { extractedText, metadata: ocrMetadata, imageBuffer, imageMimeType } =
        await processNotebookOCR(buffer, mimeType);
      const storageUrl = await uploadSourceMedia(
        request.user.id,
        file.filename || "notebook.jpg",
        imageBuffer,
        imageMimeType,
      );

      const result = await ingestText({
        userId: request.user.id,
        text: extractedText,
        sourceType: "notebook_ocr",
        rawText: ocrMetadata.raw_transcription,
        storageUrl,
        metadata: { channel: "api", filename: file.filename, ...ocrMetadata },
      });

      return reply.send({
        extractedText,
        rawTranscription: ocrMetadata.raw_transcription,
        correctedTranscription: ocrMetadata.corrected_transcription,
        ocrLines: ocrMetadata.ocr_lines ?? [],
        ...result,
      });
    } catch (error) {
      if (handlePaywallError(error, reply)) return;
      request.log.error({ err: error }, "notebook OCR failed");
      return reply.status(502).send({
        error: "notebook_ocr_failed",
        message: error instanceof Error ? error.message : "Notebook OCR failed",
      });
    }
  });

  app.post("/voice-ingest", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: "validation_error", message: "Audio file required" });
    }

    const buffer = await file.toBuffer();
    const mimeType = file.mimetype || "audio/m4a";

    try {
      const seconds = await requireAudioQuota(request, reply, buffer);
      if (reply.sent) return;

      const storageUrl = await uploadSourceMedia(
        request.user.id,
        file.filename || "recording.m4a",
        buffer,
        mimeType,
      );

      const { text, durationSeconds } = await transcribeAudio(
        buffer,
        file.filename || "recording.m4a",
        mimeType,
      );

      await incrementAudioUsage(request.user.id, durationSeconds);

      const result = await ingestText({
        userId: request.user.id,
        text,
        sourceType: "whatsapp_voice",
        rawText: text,
        storageUrl,
        metadata: { channel: "mobile", duration_seconds: durationSeconds },
      });

      return reply.send({ text, durationSeconds, ...result });
    } catch (error) {
      if (handlePaywallError(error, reply)) return;
      request.log.error({ err: error }, "voice ingest failed");
      return reply.status(502).send({
        error: "voice_ingest_failed",
        message: error instanceof Error ? error.message : "Voice ingest failed",
      });
    }
  });
};
