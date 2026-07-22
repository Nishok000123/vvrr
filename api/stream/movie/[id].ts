import { db } from '../../../src/shared/db.js';
import { LINK_CACHE_MS } from '../../../src/shared/config.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cachedLinks(mediaIds: string[]): Promise<Array<{ url: string; media_id: string }>> {
  if (!mediaIds.length) return [];
  const cutoff = new Date(Date.now() - LINK_CACHE_MS).toISOString();
  const { data, error } = await db.from('direct_links').select('url, media_id, created_at')
    .in('media_id', mediaIds).gte('created_at', cutoff).order('created_at', { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).filter((link) => !seen.has(link.url) && !!seen.add(link.url)).map((link) => ({ url: link.url, media_id: link.media_id }));
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

function calculateScore(item: any): number {
  const text = `${item?.file_name || ''} ${item?.normalized_title || ''} ${item?.caption || ''}`.toLowerCase();
  let qualityScore = 0;
  if (text.includes('2160p') || text.includes('4k') || text.includes('uhd')) qualityScore += 500;
  else if (text.includes('1080p')) qualityScore += 400;
  else if (text.includes('720p')) qualityScore += 300;
  else if (text.includes('480p')) qualityScore += 200;
  else if (text.includes('hdrip') || text.includes('web-dl') || text.includes('webrip')) qualityScore += 100;

  if (text.includes('10bit') || text.includes('hdr')) qualityScore += 50;
  if (text.includes('hevc') || text.includes('x265')) qualityScore += 30;
  if (text.includes('dd+') || text.includes('5.1')) qualityScore += 20;

  return qualityScore;
}

function formatStreamTitle(mediaItem: any): string {
  const fileName = mediaItem?.file_name || mediaItem?.normalized_title || 'Telegram File';
  const caption = mediaItem?.caption || '';
  const text = `${fileName} ${caption}`;

  let quality = '';
  if (/2160p|4k|uhd/i.test(text)) quality = '4K 2160p';
  else if (/1080p/i.test(text)) quality = '1080p';
  else if (/720p/i.test(text)) quality = '720p';
  else if (/480p/i.test(text)) quality = '480p';
  else if (/hdrip|web-dl|webrip/i.test(text)) quality = 'HDRip';
  else quality = 'HD';

  let codec = '';
  if (/10bit/i.test(text)) codec += '10Bit ';
  if (/hevc|x265/i.test(text)) codec += 'HEVC';
  else if (/x264|avc/i.test(text)) codec += 'x264';
  codec = codec.trim();

  let audio = '';
  if (/dd\+?5\.1|5\.1|6ch/i.test(text)) audio = 'DD+ 5.1';
  else if (/aac/i.test(text)) audio = 'AAC';

  let sizeStr = '';
  if (mediaItem?.file_size) {
    const mb = Number(mediaItem.file_size) / (1024 * 1024);
    sizeStr = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
  } else {
    const sizeMatch = text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|MiB|GiB))/i);
    if (sizeMatch) sizeStr = sizeMatch[1];
  }

  const tagParts = [quality, codec, audio, sizeStr].filter(Boolean).join(' • ');
  const cleanName = fileName.replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '').trim();

  return `⚡ ${tagParts}\n📁 ${cleanName}`;
}

export const config = { maxDuration: 45 };

export default async function handler(request: any, response: any): Promise<void> {
  const rawId = String(request.query.id ?? '').replace(/\.json$/, '');

  let mediaIds: string[] = [];
  const parts = rawId.split(':');

  if (rawId.startsWith('tg:')) {
    mediaIds = [rawId.slice(3)];
  } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    mediaIds = [rawId];
  } else if (parts.length >= 3 && /^tt\d+$/i.test(parts[0])) {
    const seriesImdbId = parts[0];
    const seasonNum = parseInt(parts[1], 10);
    const episodeNum = parseInt(parts[2], 10);
    const sStr = String(seasonNum).padStart(2, '0');
    const eStr = String(episodeNum).padStart(2, '0');
    const sTag = `S${sStr}E${eStr}`;
    const altTag = `${seasonNum}x${eStr}`;

    const { data: epMedia } = await db.from('media')
      .select('id, file_name, normalized_title, caption, file_size')
      .or(`file_name.ilike.%${sTag}%,normalized_title.ilike.%${sTag}%,caption.ilike.%${sTag}%,file_name.ilike.%${altTag}%`)
      .limit(20);

    mediaIds = (epMedia ?? []).map((m) => m.id);

    if (!mediaIds.length) {
      try {
        const seriesMetaRes = await fetch(`https://v3-cinemeta.strem.io/meta/series/${seriesImdbId}.json`).catch(() => null);
        if (seriesMetaRes && seriesMetaRes.ok) {
          const metaJson: any = await seriesMetaRes.json();
          const seriesName = metaJson?.meta?.name;
          if (seriesName) {
            const cleanName = seriesName.replace(/[^\w\s]/g, '').trim();
            const { data: nameMatches } = await db.from('media')
              .select('id, file_name, normalized_title, caption, file_size')
              .or(`file_name.ilike.%${cleanName}%,normalized_title.ilike.%${cleanName}%`)
              .or(`file_name.ilike.%${sTag}%,caption.ilike.%${sTag}%,file_name.ilike.%${altTag}%`)
              .limit(20);

            if (nameMatches && nameMatches.length) {
              mediaIds = nameMatches.map((m) => m.id);
            }
          }
        }
      } catch (e: any) {
        console.error(`Series episode resolution error for ${rawId}:`, e?.message);
      }
    }
  } else {
    let movieTitle: string | null = null;
    if (/^tt\d+$/i.test(rawId)) {
      const stremioMetaRes = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${rawId}.json`).catch(() => null);
      if (stremioMetaRes && stremioMetaRes.ok) {
        const metaJson: any = await stremioMetaRes.json();
        movieTitle = metaJson?.meta?.name || null;
      }
      const apiKey = process.env.TMDB_API_KEY;
      if (!movieTitle && apiKey) {
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/find/${rawId}?api_key=${apiKey}&external_source=imdb_id`).catch(() => null);
        if (tmdbRes && tmdbRes.ok) {
          const tmdbJson: any = await tmdbRes.json();
          movieTitle = tmdbJson?.movie_results?.[0]?.title || null;
        }
      }
    }

    let dbQuery = db.from('media').select('id, file_name, normalized_title, caption, file_size');
    if (movieTitle) {
      const firstWord = movieTitle.replace(/[^\w\s]/g, '').split(/\s+/)[0];
      dbQuery = dbQuery.or(`imdb_id.eq.${rawId},normalized_title.ilike.%${firstWord}%,file_name.ilike.%${firstWord}%`);
    } else {
      dbQuery = dbQuery.eq('imdb_id', rawId);
    }

    const { data: media } = await dbQuery.limit(30);
    mediaIds = (media ?? []).map((item) => item.id);
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

  const { data: mediaMapData } = await db.from('media')
    .select('id, file_name, normalized_title, caption, file_size')
    .in('id', mediaIds);
  const mediaMap = new Map((mediaMapData ?? []).map((m: any) => [m.id, m]));

  const streams = links
    .map((link) => {
      const item = mediaMap.get(link.media_id);
      return {
        name: 'Telegram Bridge',
        title: formatStreamTitle(item),
        url: link.url,
        score: calculateScore(item)
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...rest }) => rest);

  response.status(200).json({ streams });
}
