import { db } from '../shared/db.js';

const search = '29 Tamil 2026';
const words = search.split(/\s+/).filter(Boolean);

// Test matching any of the search words
const conditions = words.flatMap((w) => [
  `normalized_title.ilike.%${w}%`,
  `file_name.ilike.%${w}%`,
  `caption.ilike.%${w}%`
]).join(',');

const { data, error } = await db.from('media')
  .select('id, file_name, normalized_title')
  .or(conditions)
  .limit(10);

console.log('Result count for any word in "29 Tamil 2026":', data?.length ?? 0);
console.log('Sample matches:', data);
if (error) console.error('Error:', error.message);
