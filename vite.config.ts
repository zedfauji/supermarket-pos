import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src/app"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@widgets": path.resolve(__dirname, "./src/widgets"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@entities": path.resolve(__dirname, "./src/entities"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },

  optimizeDeps: {
    include: ['immer'],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    // Distinct from sibling project /mnt/ai/bola8pos-kiro/bar-pos, which is fixed on 1420/1421.
    port: 1520,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1521,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      // 4. also ignore Playwright's own output directories — traces/videos/
      //    screenshots are written continuously *during* an e2e run, and
      //    without this, Vite's fs watcher treats those writes as source
      //    changes and full-page-reloads the app under test mid-run,
      //    intermittently wiping in-progress dialog/form state and causing
      //    flaky "element not found" failures unrelated to the app itself.
      ignored: [
        "**/src-tauri/**",
        "**/e2e-results/**",
        "**/playwright-report/**",
        "**/e2e-blob-reports/**",
      ],
    },
  },
}));
