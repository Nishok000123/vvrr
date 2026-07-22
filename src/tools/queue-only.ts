import { db } from '../shared/db.js';

// Queue all Maharaja Tamil releases for Koyeb worker to process
const mediaIds = [
  '0dd46549-63cd-41ac-9b49-65be4a62b3e9', // 1080p NF WEB-DL Tamil
  '43256626-852d-4874-94cd-72e14d4bf04b', // 720p NF WEB-DL Tamil
  'c9a4739a-5057-4ee5-b6f6-dfffd690756b', // 700MB Tamil HDRip
];

for (const id of mediaIds) {
  const { error } = await db.from('generation_jobs').insert({ media_id: id });
  if (error) console.error('Error queueing', id, error.message);
  else console.log('Queued:', id);
}

// Show current queue
const { data: pending } = await db.from('generation_jobs')
  .select('id, media_id, status, created_at')
  .in('status', ['queued', 'processing'])
  .order('created_at')
  .limit(10);
console.log('Pending jobs for Koyeb worker:', pending);
process.exit(0);
