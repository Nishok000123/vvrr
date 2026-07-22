import { db } from '../../../src/shared/db.js';
import { LINK_CACHE_MS } from '../../../src/shared/config.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Max files to forward per request - prevent bot spam
const MAX_QUEUE = 4;

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
  // Hard cap - never send more than MAX_QUEUE files to bots at once
  const toQueue = mediaIds.slice(0, MAX_QUEUE);
  for (const mediaId of toQueue) {
    const { data: existing } = await db.from('generation_jobs').select('id')
      .eq('media_id', mediaId).in('status', ['queued', 'processing']).limit(1).maybeSingle();
    if (existing) continue;
    await db.from('generation_jobs').insert({ media_id: mediaId });
  }
}

function qualityScore(item: any): number {
  const text = `${item?.file_name || ''} ${item?.normalized_title || ''} ${item?.caption || ''}`.toLowerCase();
  let score = 0;
  if (text.includes('2160p') || text.includes('4k') || text.includes('uhd')) score += 500;
  else if (text.includes('1080p')) score += 400;
  else if (text.includes('720p')) score += 300;
  else if (text.includes('480p')) score += 200;
  else if (text.includes('hdrip') || text.includes('web-dl') || text.includes('webrip')) score += 100;
  if (text.includes('10bit') || text.includes('hdr')) score += 50;
  if (text.includes('hevc') || text.includes('x265')) score += 30;
  if (text.includes('dd+') || text.includes('5.1')) score += 20;
  return score;
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

// Resolve exact title + year from Cinemeta to prevent partial-word false matches
async function resolveMovieTitle(imdbId: string): Promise<{ title: string; year: string | null } | null> {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`).catch(() => null);
    if (res && res.ok) {
      const json: any = await res.json();
      const name = json?.meta?.name;
      const released = json?.meta?.released || json?.meta?.releaseInfo || '';
      const year = released ? String(released).slice(0, 4) : null;
      if (name) return { title: name, year };
    }
  } catch {}

  // TMDB fallback
  const apiKey = process.env.TMDB_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`).catch(() => null);
      if (res && res.ok) {
        const json: any = await res.json();
        const movie = json?.movie_results?.[0];
        if (movie) {
          return { title: movie.title, year: movie.release_date?.slice(0, 4) || null };
        }
      }
    } catch {}
  }
  return null;
}

// Strict match: title must appear as a WHOLE WORD at start of file_name
// Prevents "Vikram On Duty" matching search for "Vikram (2022)"
function strictTitleFilter(items: any[], title: string, year: string | null): any[] {
  // Escape special regex chars in title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match title as whole word/phrase at start of clean filename, not partial
  const titleRegex = new RegExp(`^(?:@[A-Za-z0-9_]+\\s*[-_:]*\\s*)?${escapedTitle}`, 'i');
  
  const strict = items.filter((item) => {
    const fn = (item.file_name || '').replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '');
    const nt = item.normalized_title || '';
    // Must start with the exact title
    if (!titleRegex.test(fn) && !titleRegex.test(nt)) return false;
    // If year known, must contain that year (prevents Vikram 2022 vs Vikram Vedha 2022 mix)
    if (year) {
      const combinedText = `${fn} ${nt} ${item.caption || ''}`;
      if (!combinedText.includes(year)) return false;
    }
    return true;
  });

  // Fallback: if strict yields nothing, use loose but still whole-word title match
  if (!strict.length) {
    const looseRegex = new RegExp(`\\b${escapedTitle}\\b`, 'i');
    return items.filter((item) => {
      const fn = item.file_name || '';
      const nt = item.normalized_title || '';
      return looseRegex.test(fn) || looseRegex.test(nt);
    });
  }
  return strict;
}

export const config = { maxDuration: 45 };

export default async function handler(request: any, response: any): Promise<void> {
  const rawId = String(request.query.id ?? '').replace(/\.json$/, '');

  let mediaIds: string[] = [];
  const parts = rawId.split(':');

  if (rawId.startsWith('tg:')) {
    // Direct internal ID - single file only
    mediaIds = [rawId.slice(3)];

  } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    mediaIds = [rawId];

  } else if (parts.length >= 3 && /^tt\d+$/i.test(parts[0])) {
    // Series episode: tt1234567:1:2
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

    if (epMedia && epMedia.length) {
      // For series, also resolve the series name to filter out false matches
      const seriesMeta = await resolveMovieTitle(seriesImdbId).catch(() => null);
      let filtered = epMedia;
      if (seriesMeta?.title) {
        filtered = strictTitleFilter(epMedia, seriesMeta.title, null);
        if (!filtered.length) filtered = epMedia; // fallback to all episode matches
      }
      // Pick best MAX_QUEUE by quality
      filtered.sort((a, b) => qualityScore(b) - qualityScore(a));
      mediaIds = filtered.slice(0, MAX_QUEUE).map((m) => m.id);
    }

    if (!mediaIds.length) {
      // Try resolving series title and searching by name + episode tag
      try {
        const seriesMeta = await resolveMovieTitle(seriesImdbId);
        if (seriesMeta?.title) {
          const cleanName = seriesMeta.title.replace(/[^\w\s]/g, '').trim();
          const { data: nameMatches } = await db.from('media')
            .select('id, file_name, normalized_title, caption, file_size')
            .or(`file_name.ilike.%${cleanName}%,normalized_title.ilike.%${cleanName}%`)
            .or(`file_name.ilike.%${sTag}%,caption.ilike.%${sTag}%`)
            .limit(20);

          if (nameMatches && nameMatches.length) {
            const filtered = strictTitleFilter(nameMatches, seriesMeta.title, null);
            const best = (filtered.length ? filtered : nameMatches).sort((a, b) => qualityScore(b) - qualityScore(a));
            mediaIds = best.slice(0, MAX_QUEUE).map((m) => m.id);
          }
        }
      } catch (e: any) {
        console.error(`Series resolution error for ${rawId}:`, e?.message);
      }
    }

  } else if (/^tt\d+$/i.test(rawId)) {
    // Movie by IMDb ID
    // Step 1: exact imdb_id match in DB
    const { data: exactMatch } = await db.from('media')
      .select('id, file_name, normalized_title, caption, file_size')
      .eq('imdb_id', rawId)
      .limit(20);

    let candidates = exactMatch ?? [];

    // Step 2: if no exact match, resolve title from Cinemeta and do strict search
    if (!candidates.length) {
      const movieMeta = await resolveMovieTitle(rawId);
      if (movieMeta?.title) {
        // Search ALL words of title (not just first word!)
        const titleWords = movieMeta.title.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 1);
        const firstWord = titleWords[0];
        
        const { data: titleMatches } = await db.from('media')
          .select('id, file_name, normalized_title, caption, file_size, imdb_id')
          .or(`file_name.ilike.%${firstWord}%,normalized_title.ilike.%${firstWord}%`)
          .limit(60);

        if (titleMatches && titleMatches.length) {
          // Strict filter: must match full title + year
          candidates = strictTitleFilter(titleMatches, movieMeta.title, movieMeta.year);

          // Update imdb_id for matched rows (background, non-blocking)
          if (candidates.length) {
            const idsToUpdate = candidates.filter((c: any) => !c.imdb_id).map((c: any) => c.id);
            if (idsToUpdate.length) {
              void db.from('media').update({ imdb_id: rawId }).in('id', idsToUpdate);
            }
          }
        }
      }
    }

    // Pick best MAX_QUEUE by quality score
    candidates.sort((a, b) => qualityScore(b) - qualityScore(a));
    mediaIds = candidates.slice(0, MAX_QUEUE).map((item) => item.id);
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
        score: qualityScore(item)
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...rest }) => rest);

  response.status(200).json({ streams });
}
