import { createServer } from 'node:http';
import { required } from '../shared/config.js';
import { createTelegramClient, saveTelegramSession } from './telegram.js';
import { indexSources } from './indexer.js';
import { cleanupLinks, processJobs } from './jobs.js';

const client = await createTelegramClient();
const port = Number(process.env.WORKER_PORT ?? 8000);
const interval = Number(process.env.POLL_INTERVAL_MS ?? 5000);
let lastCleanup = 0;

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, '0.0.0.0');

async function tick(): Promise<void> {
  await indexSources(client);
  await processJobs(client);
  await saveTelegramSession(client);
  if (Date.now() - lastCleanup > 60 * 60 * 1000) {
    await cleanupLinks();
    lastCleanup = Date.now();
  }
}

console.log(`Telegram worker listening on ${port}; polling every ${interval}ms.`);
for (;;) {
  await tick().catch((error: Error) => console.error('Worker tick failed:', error.message));
  await new Promise((resolve) => setTimeout(resolve, interval));
}
