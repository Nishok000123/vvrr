import { db } from '../shared/db.js';

const search = '29 tamil movie';
const words = search.split(/\s+/).filter((w) => w.length > 0);
const conditions = words.flatMap((w) => [
  `normalized_title.ilike.%${w}%`,
  `file_name.ilike.%${w}%`,
  `caption.ilike.%${w}%`
]).join(',');

const { data, error } = await db.from('media')
  .select('id, file_name, normalized_title, caption, tmdb_id, imdb_id')
  .or(conditions)
  .limit(20);

console.log('Search words:', words);
console.log('Total DB matches:', data?.length ?? 0);
console.log('Matches:', data);
