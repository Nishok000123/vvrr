import { db } from '../shared/db.js';

const { data: jobs } = await db.from('generation_jobs').select('*').limit(5);
console.log('Recent Generation Jobs:', jobs);

const { data: links } = await db.from('direct_links').select('*').limit(5);
console.log('Recent Direct Links:', links);
