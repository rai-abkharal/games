import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`🚀 Mini-Games Catalog & CDN Backend is running!`);
  console.log(`📡 URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`🎮 Catalog: http://localhost:${PORT}/api/games`);
  console.log(`🩺 Health:  http://localhost:${PORT}/api/health`);
});
