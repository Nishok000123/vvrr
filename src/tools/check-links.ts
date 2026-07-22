import { db } from '../shared/db.js';

const mediaId = 'c9a4739a-5057-4ee5-b6f6-dfffd690756b'; // Maharaja (2024) Tamil
const { data: links } = await db.from('direct_links').select('url, created_at').eq('media_id', mediaId);

console.log('Direct Links for Maharaja (2024) Tamil:', links);

const { data: allLinks } = await db.from('direct_links').select('url, media_id, created_at').order('created_at', { ascending: false }).limit(10);
console.log('Recent Direct Links in DB:', allLinks);
