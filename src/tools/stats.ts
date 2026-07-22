import { db } from '../shared/db.js';

const { data, error } = await db.from('media').select('id, file_name, normalized_title, tmdb_id, imdb_id').limit(5);
if (error) console.error(error.message);
else console.log('Sample indexed media:', data);
