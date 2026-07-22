import { createTelegramClient } from '../worker/telegram.js';
import { processJobs } from '../worker/jobs.js';
import { db } from '../shared/db.js';

const mediaIds = [
  '0dd46549-63cd-41ac-9b49-65be4a62b3e9', // 1080p 2.7GB Tamil
  '43256626-852d-4874-94cd-72e14d4bf04b', // 720p 1GB Tamil
  'c9a4739a-5057-4ee5-b6f6-dfffd690756b'  // 700MB Tamil
];

console.log('Queueing jobs for all Maharaja releases...');
for (const id of mediaIds) {
  await db.from('generation_jobs').insert({ media_id: id });
}

console.log('Connecting to Telegram client...');
const client = await createTelegramClient();

console.log('Processing jobs...');
await processJobs(client);

console.log('Fetching generated links...');
for (const id of mediaIds) {
  const { data: media } = await db.from('media').select('file_name, file_size').eq('id', id).single();
  const { data: links } = await db.from('direct_links').select('url').eq('media_id', id);
  console.log(`\n=== ${media?.file_name} ===`);
  console.log('Links:', links?.map((l) => l.url));
}

await client.disconnect();
process.exit(0);
