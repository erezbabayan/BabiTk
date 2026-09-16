import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, "..");

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    envDir: repoRoot,
    // GitHub Pages project site: https://erezbabayan.github.io/BabiTk/
    base: process.env.VITE_BASE_PATH || "/",
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) {
              return "supabase";
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
