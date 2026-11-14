/**
 * Deno-safe re-export of Hebrew inbound parse for Edge Functions.
 * Relies on .ts extensions inside shared/ingest.
 */
export {
  buildSupabaseIngestRows,
  parseInboundText,
  layoutMetadataFromParsed,
  type InboundParsedFields,
  type IngestSourceType,
} from "../../../shared/ingest/supabaseIngestRows.ts";
