import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  server: {
    port: 5173,
    ...(process.env.ADMIN_TLS_KEY && process.env.ADMIN_TLS_CERT
      ? {
          https: {
            key: fs.readFileSync(process.env.ADMIN_TLS_KEY),
            cert: fs.readFileSync(process.env.ADMIN_TLS_CERT),
          },
        }
      : {}),
    proxy: {
      "/v1": "http://localhost:3000",
      "/api/admin": "http://localhost:3000",
      "/cdn": "http://localhost:3000",
    },
  },
});
