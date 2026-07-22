import { createTelegramClient } from '../worker/telegram.js';
import { indexSources } from '../worker/indexer.js';

console.log('Connecting to Telegram...');
const client = await createTelegramClient();
console.log('Indexing source channels...');
await indexSources(client);
console.log('✅ Indexing complete!');
await client.disconnect();
process.exit(0);
