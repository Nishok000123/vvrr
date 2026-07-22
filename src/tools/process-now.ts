import { createTelegramClient } from '../worker/telegram.js';
import { processJobs } from '../worker/jobs.js';

console.log('Connecting to Telegram client...');
const client = await createTelegramClient();
console.log('Processing queued generation jobs...');
await processJobs(client);
console.log('Job processing complete!');
await client.disconnect();
process.exit(0);
