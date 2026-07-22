import { createTelegramClient } from '../worker/telegram.js';
import { processJobs } from '../worker/jobs.js';
import { db } from '../shared/db.js';

const mediaId = 'b35260f5-c72c-474b-bc1f-3321e62830f2'; // VadaChennai

console.log('Queueing job for VadaChennai...');
await db.from('generation_jobs').insert({ media_id: mediaId });

console.log('Connecting to Telegram client...');
const client = await createTelegramClient();

console.log('Processing stream link generation job...');
await processJobs(client);

console.log('Done!');
await client.disconnect();
process.exit(0);
