import { db } from '../shared/db.js';
import { createTelegramClient } from '../worker/telegram.js';
import { processJobs } from '../worker/jobs.js';

const search = 'Maharaja';
const { data, error } = await db.from('media')
  .select('id, file_name, normalized_title, caption, file_size')
  .or(`file_name.ilike.%${search}%,normalized_title.ilike.%${search}%,caption.ilike.%${search}%`)
  .limit(10);

console.log(`Matches for '${search}':`, data?.length ?? 0);
if (data && data.length) {
  console.log('Found Maharaja media:', data);
  const mediaId = data[0].id;
  console.log(`Queueing stream generation for media ID: ${mediaId}`);
  await db.from('generation_jobs').insert({ media_id: mediaId });

  console.log('Connecting to Telegram client...');
  const client = await createTelegramClient();
  console.log('Processing stream link job...');
  await processJobs(client);
  
  const { data: links } = await db.from('direct_links').select('url, created_at').eq('media_id', mediaId);
  console.log('Direct Links for Maharaja:', links);
  await client.disconnect();
} else {
  console.log('Maharaja not found in media table yet!');
}
process.exit(0);
