import { db } from '../shared/db.js';

const search = 'Joe';
const { data, error } = await db.from('media')
  .select('id, imdb_id, tmdb_id, normalized_title, file_name, caption')
  .or(`normalized_title.ilike.%${search}%,file_name.ilike.%${search}%`)
  .limit(10);

console.log('Search result count:', data?.length ?? 0);
console.log('Sample matches:', data);
if (error) console.error('Error:', error.message);
