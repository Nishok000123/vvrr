import { db } from '../shared/db.js';

const mediaId = 'c9a4739a-5057-4ee5-b6f6-dfffd690756b'; // Maharaja (2024) Tamil
console.log('Queueing job for Maharaja (2024) Tamil...');

const { error } = await db.from('generation_jobs').insert({ media_id: mediaId });
if (error) console.error('Insert error:', error.message);
else console.log('Job queued successfully!');
