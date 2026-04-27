import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "os";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Put the dep cache in the system temp dir to avoid OneDrive locking issues
  cacheDir: path.join(os.tmpdir(), "vite-gpflow"),
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to the FastAPI backend in dev
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
