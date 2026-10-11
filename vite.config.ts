import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/release/**", "**/release-*/**", "**/artifacts/**"] },
  },
  build: { target: "es2022" },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["replicad-opencascadejs"] },
});
