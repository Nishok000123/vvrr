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
  const rawId = String(request.query.id ?? '').replace(/\.json$/, '');

  let mediaIds: string[] = [];

  if (rawId.startsWith('tg:')) {
    mediaIds = [rawId.slice(3)];
  } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    mediaIds = [rawId];
  } else {
    // 1. Check if media table already has this imdb_id
    const { data: media } = await db.from('media').select('id').eq('imdb_id', rawId).limit(10);
    mediaIds = (media ?? []).map((item) => item.id);

    // 2. Fallback: If no imdb_id match, resolve title via Cinemeta / TMDB and match media table by title!
    if (!mediaIds.length && /^tt\d+$/i.test(rawId)) {
      try {
        let title: string | null = null;

        // Try Cinemeta
        const stremioMetaRes = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${rawId}.json`).catch(() => null);
        if (stremioMetaRes && stremioMetaRes.ok) {
          const metaJson: any = await stremioMetaRes.json();
          title = metaJson?.meta?.name || null;
        }

        // Try TMDB if Cinemeta name missing
        const apiKey = process.env.TMDB_API_KEY;
        if (!title && apiKey) {
          const tmdbRes = await fetch(`https://api.themoviedb.org/3/find/${rawId}?api_key=${apiKey}&external_source=imdb_id`).catch(() => null);
          if (tmdbRes && tmdbRes.ok) {
            const tmdbJson: any = await tmdbRes.json();
            title = tmdbJson?.movie_results?.[0]?.title || tmdbJson?.tv_results?.[0]?.name || null;
          }
        }

        if (title) {
          const words = title.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
          const conditions = words.flatMap((w: string) => [
            `file_name.ilike.%${w}%`,
            `normalized_title.ilike.%${w}%`,
            `caption.ilike.%${w}%`
          ]).join(',');

          const { data: titleMatches } = await db.from('media').select('id').or(conditions).limit(10);
          if (titleMatches && titleMatches.length) {
            mediaIds = titleMatches.map((m) => m.id);
            // Associate imdb_id in database for instant future lookups
            await db.from('media').update({ imdb_id: rawId }).in('id', mediaIds);
          }
        }
      } catch (e: any) {
        console.error(`IMDb title resolution error for ${rawId}:`, e?.message);
      }
    }
  }

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
  response.status(200).json({ streams: links.map((link) => ({ name: 'Telegram Bridge', title: '⚡ Fast Stream Link', url: link.url })) });
}
