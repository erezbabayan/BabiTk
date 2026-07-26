import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const convexUrl = env.VITE_CONVEX_URL || env.CONVEX_URL || "";
  const define: Record<string, string> = {};

  if (convexUrl && !env.VITE_CONVEX_URL) {
    define["import.meta.env.VITE_CONVEX_URL"] = JSON.stringify(convexUrl);
  }
  if (convexUrl && env.VITE_USE_CONVEX === undefined) {
    define["import.meta.env.VITE_USE_CONVEX"] = JSON.stringify("true");
  }

  return {
    plugins: [react(), tailwindcss()],
    envDir: repoRoot,
    define: Object.keys(define).length > 0 ? define : undefined,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("convex") || id.includes("@convex-dev")) {
              return "convex";
            }
            if (id.includes("@tanstack/react-virtual")) {
              return "virtual";
            }
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("scheduler")
            ) {
              return "react-vendor";
            }
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://localhost:3001",
      },
    },
  };
});
