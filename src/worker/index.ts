import { createServer } from 'node:http';
import { createTelegramClient, saveTelegramSession } from './telegram.js';
import { indexSources } from './indexer.js';
import { cleanupLinks, processJobs } from './jobs.js';

const client = await createTelegramClient();
const port = Number(process.env.WORKER_PORT ?? 8000);
const interval = Number(process.env.POLL_INTERVAL_MS ?? 2000);
let lastCleanup = 0;
let lastIndexTime = 0;
let isIndexing = false;

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, '0.0.0.0');

console.log(`Telegram worker listening on ${port}; polling jobs every ${interval}ms.`);

for (;;) {
  try {
    // 1. Process queued stream link jobs FIRST with highest priority!
    await processJobs(client);

    // 2. Periodically run indexer in background every 15 minutes (non-blocking)
    if (!isIndexing && Date.now() - lastIndexTime > 15 * 60 * 1000) {
      lastIndexTime = Date.now();
      isIndexing = true;
      indexSources(client)
        .catch((err) => console.error('Background index error:', err.message))
        .finally(() => { isIndexing = false; });
    }

    // 3. Hourly link cleanup & session save
    if (Date.now() - lastCleanup > 60 * 60 * 1000) {
      await cleanupLinks().catch(() => {});
      await saveTelegramSession(client).catch(() => {});
      lastCleanup = Date.now();
    }
  } catch (error: any) {
    console.error('Worker tick error:', error?.message || error);
  }

  await new Promise((resolve) => setTimeout(resolve, interval));
}
