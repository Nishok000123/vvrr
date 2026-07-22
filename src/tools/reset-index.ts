import { db } from '../shared/db.js';

console.log('Resetting index: clearing media table and last_message_id on all source channels...');

// 1. Clear all indexed media
const { error: mediaError, count } = await db.from('media').delete().gte('created_at', '2000-01-01');
if (mediaError) { console.error('Error clearing media:', mediaError.message); process.exit(1); }
console.log('Cleared media rows:', count);

// 2. Also clear direct_links and generation_jobs (they reference old media IDs)
await db.from('direct_links').delete().gte('created_at', '2000-01-01');
await db.from('generation_jobs').delete().gte('created_at', '2000-01-01');
console.log('Cleared direct_links and generation_jobs.');

// 3. Reset last_message_id to 0 on all source channels
const { data: sources, error: srcError } = await db.from('source_channels').select('id, telegram_channel');
if (srcError) { console.error('Error fetching sources:', srcError.message); process.exit(1); }

for (const src of sources ?? []) {
  await db.from('source_channels').update({ last_message_id: 0 }).eq('id', src.id);
  console.log(`Reset last_message_id=0 for channel: ${src.telegram_channel}`);
}

console.log('Done! Koyeb worker will now re-index all channels from scratch on next 15-min tick.');
process.exit(0);
