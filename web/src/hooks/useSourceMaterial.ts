import { useCallback, useEffect, useState } from "react";
import { isDemoMode, supabase } from "../lib/supabase";
import type { SourceMaterial } from "../types";

export function useSourceMaterial(
  sourceId: string | null | undefined,
  embedded?: SourceMaterial | null,
) {
  const [material, setMaterial] = useState<SourceMaterial | null>(embedded ?? null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (embedded) {
      setMaterial(embedded);
      setMediaUrl(null);
      setLoading(false);
      return;
    }

    if (!sourceId || sourceId.startsWith("inline-") || sourceId.startsWith("demo-src-")) {
      setMaterial(embedded ?? null);
      setMediaUrl(null);
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("source_materials")
      .select("id, source_type, storage_url, raw_text, metadata")
      .eq("id", sourceId)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    setMaterial({
      ...(data as SourceMaterial),
      metadata: (data.metadata as SourceMaterial["metadata"]) ?? null,
    });

    if (data.storage_url) {
      const { data: signed } = await supabase.storage
        .from("source-materials")
        .createSignedUrl(data.storage_url, 3600);
      setMediaUrl(signed?.signedUrl ?? null);
    } else {
      setMediaUrl(null);
    }

    setLoading(false);
  }, [sourceId, embedded]);

  useEffect(() => {
    void load();
  }, [load]);

  return { material, mediaUrl, loading, reload: load };
}
