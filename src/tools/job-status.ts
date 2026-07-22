import { db } from '../shared/db.js';

const { data: jobs } = await db.from('generation_jobs').select('*').order('created_at', { ascending: false }).limit(5);
console.log('Recent Generation Jobs:', jobs);
