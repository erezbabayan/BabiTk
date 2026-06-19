import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/** Persist inbound media in Convex file storage (replaces ephemeral Green-API URLs). */
export async function storeMediaBuffer(
  ctx: ActionCtx,
  buffer: Buffer,
  mimeType: string,
): Promise<Id<"_storage">> {
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
  return await ctx.storage.store(blob);
}
