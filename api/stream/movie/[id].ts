import { db } from '../../../src/shared/db.js';
import { LINK_CACHE_MS } from '../../../src/shared/config.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cachedLinks(mediaIds: string[]): Promise<Array<{ url: string }>> {
  if (!mediaIds.length) return [];
  const cutoff = new Date(Date.now() - LINK_CACHE_MS).toISOString();
  const { data, error } = await db.from('direct_links').select('url, media_id, created_at')
    .in('media_id', mediaIds).gte('created_at', cutoff).order('created_at', { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).filter((link) => !seen.has(link.url) && !!seen.add(link.url)).map((link) => ({ url: link.url }));
}

async function queueJobs(mediaIds: string[]): Promise<void> {
  for (const mediaId of mediaIds) {
    const { data: existing, error: existingError } = await db.from('generation_jobs').select('id')
      .eq('media_id', mediaId).in('status', ['queued', 'processing']).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;
    const { error } = await db.from('generation_jobs').insert({ media_id: mediaId });
    if (error) throw error;
  }
}

export const config = { maxDuration: 45 };

export default async function handler(request: any, response: any): Promise<void> {
  const imdbId = String(request.query.id ?? '').replace(/\.json$/, '');
  const { data: media, error } = await db.from('media').select('id').eq('imdb_id', imdbId).limit(10);
  if (error) throw error;
  const mediaIds = (media ?? []).map((item) => item.id);
  if (!mediaIds.length) return response.status(200).json({ streams: [] });

  let links = await cachedLinks(mediaIds);
  if (!links.length) {
    await queueJobs(mediaIds);
    const deadline = Date.now() + 42_000;
    while (Date.now() < deadline) {
      await wait(2_000);
      links = await cachedLinks(mediaIds);
      if (links.length) break;
    }
  }
  response.status(200).json({ streams: links.map((link) => ({ name: 'Telegram Bridge', title: 'Telegram direct link', url: link.url })) });
}
