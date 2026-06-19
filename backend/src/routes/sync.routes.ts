import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireSyncAuth } from "../middleware/sync-auth.js";
import {
  addSyncItem,
  getSyncSnapshot,
  getSyncSnapshotIfChanged,
  getCurrentSyncVersion,
  getSyncTrashItems,
  hardDeleteSyncItem,
  patchSyncItem,
  softDeleteSyncItem,
  type SyncItem,
} from "../services/sync-store.service.js";
import { ingestTextToSyncStore } from "../services/sync-ingest.service.js";

const ingestTextSchema = z.object({
  text: z.string().trim().min(3),
  sourceType: z.enum(["whatsapp_text", "whatsapp_voice", "notebook_ocr"]).default("whatsapp_text"),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const itemSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  source_material_id: z.string().uuid().nullable().optional(),
  source_materials: z.unknown().nullable().optional(),
  title: z.string().min(1),
  content: z.string(),
  is_actionable: z.boolean(),
  status: z.enum(["inbox", "pending", "completed", "snoozed_archive"]),
  due_date: z.string().nullable(),
  completed_at: z.string().nullable().optional(),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
  sort_order: z.number().optional(),
  last_interacted_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const patchSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    is_actionable: z.boolean().optional(),
    status: z.enum(["inbox", "pending", "completed", "snoozed_archive"]).optional(),
    due_date: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    sort_order: z.number().optional(),
    last_interacted_at: z.string().optional(),
    deleted_at: z.string().nullable().optional(),
    source_material_id: z.string().uuid().nullable().optional(),
    source_materials: z.unknown().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireSyncAuth);

  app.get("/items", async (request, reply) => {
    const query = z.object({ sinceVersion: z.coerce.number().int().nonnegative().optional() }).safeParse(
      request.query,
    );
    const sinceVersion = query.success ? query.data.sinceVersion : undefined;

    if (sinceVersion !== undefined) {
      const result = await getSyncSnapshotIfChanged(sinceVersion);
      if (!result.changed) {
        return reply.send({ changed: false, version: result.version });
      }
      return reply.send({
        changed: true,
        version: result.version,
        items: result.items,
      });
    }

    const snapshot = await getSyncSnapshot();
    return reply.send(snapshot);
  });

  app.get("/trash", async (_request, reply) => {
    const items = await getSyncTrashItems();
    return reply.send({ items });
  });

  app.post("/ingest/text", async (request, reply) => {
    const body = ingestTextSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation_error", message: body.error.flatten() });
    }

    try {
      const result = await ingestTextToSyncStore({
        text: body.data.text,
        sourceType: body.data.sourceType,
        timezone: body.data.timezone,
        locale: body.data.locale,
        metadata: body.data.metadata,
      });
      return reply.status(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, "sync ingestText failed");
      return reply.status(502).send({
        error: "ingest_failed",
        message: error instanceof Error ? error.message : "Ingest failed",
      });
    }
  });

  app.post("/items", async (request, reply) => {
    const body = itemSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation_error", message: body.error.flatten() });
    }

    const item = await addSyncItem({
      ...body.data,
      completed_at: body.data.completed_at ?? null,
      sort_order: body.data.sort_order ?? Date.now(),
      deleted_at: null,
    } as SyncItem);

    return reply.status(201).send({ item, version: await getCurrentSyncVersion() });
  });

  app.patch("/items/:id", async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const body = patchSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "validation_error" });
    }

    const item = await patchSyncItem(params.data.id, body.data as Partial<SyncItem>);
    if (!item) {
      return reply.status(404).send({ error: "not_found" });
    }

    return reply.send({ item, version: await getCurrentSyncVersion() });
  });

  app.delete("/items/:id/permanent", async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "validation_error" });
    }

    const ok = await hardDeleteSyncItem(params.data.id);
    if (!ok) {
      return reply.status(404).send({ error: "not_found" });
    }

    return reply.send({ ok: true, version: await getCurrentSyncVersion() });
  });

  app.delete("/items/:id", async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "validation_error" });
    }

    const ok = await softDeleteSyncItem(params.data.id);
    if (!ok) {
      return reply.status(404).send({ error: "not_found" });
    }

    return reply.send({ ok: true, version: await getCurrentSyncVersion() });
  });
};
