import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import os from "os";
import path from "path";

export default defineConfig({
  plugins: [react(), basicSsl()],
  // Put the dep cache in the system temp dir to avoid OneDrive locking issues
  cacheDir: path.join(os.tmpdir(), "vite-gpflow"),
  server: {
    port: 5173,
    host: true,   // listen on 0.0.0.0 so phone/tablet can connect via local IP
    proxy: {
      // Proxy /api calls to the FastAPI backend in dev
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
