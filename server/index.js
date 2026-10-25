import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadAccounts } from './accounts.js';
import { startCleanup } from './cleanup.js';
import { CLIENT_ORIGIN, PORT } from './config.js';
import routes from './routes.js';
import { registerHandlers } from './socketHandlers.js';
import { initStorage, wipeStorage } from './storage.js';

await initStorage();
await loadAccounts();

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use('/api', routes);

// In production one process serves both the API and the built React app.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN },
  maxHttpBufferSize: 2 * 1024 * 1024, // one 512 KB chunk plus overhead; nothing bigger gets through
});
registerHandlers(io);
startCleanup(io);

server.listen(PORT, () => console.log(`DoquMay server on http://localhost:${PORT}`));

const shutdown = async () => { await wipeStorage(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
