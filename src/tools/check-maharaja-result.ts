import { db } from '../shared/db.js';

const mediaIds = [
  '0dd46549-63cd-41ac-9b49-65be4a62b3e9',
  '43256626-852d-4874-94cd-72e14d4bf04b',
  'c9a4739a-5057-4ee5-b6f6-dfffd690756b',
];

const { data: links } = await db.from('direct_links')
  .select('url, media_id, created_at')
  .in('media_id', mediaIds)
  .order('created_at', { ascending: false });

const { data: jobs } = await db.from('generation_jobs')
  .select('media_id, status, error, completed_at')
  .in('media_id', mediaIds)
  .order('created_at', { ascending: false })
  .limit(9);

console.log('Jobs:', jobs);
console.log('Links:', links);
process.exit(0);
