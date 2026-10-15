/**
 * Read an environment variable in Edge (Deno) or Node tests without a
 * hard `Deno` identifier, so backend `tsc` can typecheck shared modules.
 */
type DenoLike = {
  env?: { get?: (name: string) => string | undefined };
};

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

export function readRuntimeEnv(name: string): string {
  const global = globalThis as { Deno?: DenoLike; process?: ProcessLike };
  const fromDeno = global.Deno?.env?.get?.(name);
  if (typeof fromDeno === "string" && fromDeno.trim()) return fromDeno.trim();
  const fromProcess = global.process?.env?.[name];
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}
