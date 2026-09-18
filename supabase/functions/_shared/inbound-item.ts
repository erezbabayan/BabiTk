/**
 * Deno-safe re-export of Hebrew inbound parse for Edge Functions.
 * Relies on .ts extensions inside convex/lib/ingest.
 */
export {
  buildSupabaseIngestRows,
  parseInboundText,
  layoutMetadataFromParsed,
  type InboundParsedFields,
  type IngestSourceType,
} from "../../../convex/lib/ingest/supabaseIngestRows.ts";
