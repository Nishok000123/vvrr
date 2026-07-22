import { db } from '../shared/db.js';

const search = 'vadachennai';
const { data, error } = await db.from('media')
  .select('id, file_name, normalized_title, caption')
  .or(`file_name.ilike.%${search}%,normalized_title.ilike.%${search}%,caption.ilike.%${search}%,file_name.ilike.%vada%,file_name.ilike.%chennai%`)
  .limit(20);

console.log(`Matches for '${search}':`, data?.length ?? 0);
console.log('Results:', data);
