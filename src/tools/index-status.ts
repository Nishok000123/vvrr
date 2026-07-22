import { db } from '../shared/db.js';

const { count: total } = await db.from('media').select('*', { count: 'exact', head: true });

const { data: sources } = await db.from('source_channels').select('telegram_channel, last_message_id, enabled');

const { data: recent } = await db.from('media')
  .select('file_name, normalized_title, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

const { data: jobs } = await db.from('generation_jobs')
  .select('status')
  .in('status', ['queued', 'processing']);

console.log('=== INDEX STATUS ===');
console.log('Total media indexed:', total);
console.log('\nSource channels:');
for (const s of sources ?? []) {
  console.log(` ${s.telegram_channel} | enabled=${s.enabled} | last_message_id=${s.last_message_id}`);
}
console.log('\nMost recently indexed:');
for (const r of recent ?? []) {
  console.log(` [${r.created_at?.slice(0,19)}] ${r.file_name || r.normalized_title}`);
}
console.log('\nPending jobs (queued/processing):', jobs?.length ?? 0);
process.exit(0);
