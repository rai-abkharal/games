import dotenv from "dotenv";
import { createApp } from "./app";
import fs from "node:fs";
import https from "node:https";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const app = createApp();
if (process.env.ADMIN_TLS_KEY && process.env.ADMIN_TLS_CERT) {
  https
    .createServer(
      {
        key: fs.readFileSync(process.env.ADMIN_TLS_KEY),
        cert: fs.readFileSync(process.env.ADMIN_TLS_CERT),
      },
      app,
    )
    .listen(Number(process.env.PREVIEW_TLS_PORT || 5444), "127.0.0.1");
}

app.listen(PORT, HOST, () => {
  console.log(`🚀 Mini-Games Catalog & CDN Backend is running!`);
  console.log(
    `📡 URL: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`,
  );
  console.log(`🎮 Catalog: http://localhost:${PORT}/api/games`);
  console.log(`🩺 Health:  http://localhost:${PORT}/api/health`);
});
