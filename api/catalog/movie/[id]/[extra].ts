import { db } from '../../../../src/shared/db.js';

type TmdbMovie = { title?: string; overview?: string; poster_path?: string; release_date?: string };

async function details(tmdbId: number): Promise<TmdbMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`).catch(() => null);
  return response && response.ok ? (response.json() as Promise<TmdbMovie>) : null;
}

function calculateScore(item: any, searchWords: string[]): number {
  const text = `${item.file_name || ''} ${item.normalized_title || ''} ${item.caption || ''}`.toLowerCase();
  
  let keywordScore = 0;
  for (const word of searchWords) {
    if (text.includes(word.toLowerCase())) {
      keywordScore += 100;
    }
  }

  let qualityScore = 0;
  if (text.includes('2160p') || text.includes('4k') || text.includes('uhd')) qualityScore += 500;
  else if (text.includes('1080p')) qualityScore += 400;
  else if (text.includes('720p')) qualityScore += 300;
  else if (text.includes('480p')) qualityScore += 200;
  else if (text.includes('hdrip') || text.includes('web-dl') || text.includes('webrip')) qualityScore += 100;

  if (text.includes('10bit') || text.includes('hdr')) qualityScore += 50;
  if (text.includes('hevc') || text.includes('x265')) qualityScore += 30;
  if (text.includes('dd+') || text.includes('5.1')) qualityScore += 20;

  return keywordScore * 10 + qualityScore;
}

export default async function handler(request: any, response: any): Promise<void> {
  try {
    const catalogType = String(request.query.type || 'movie');
    const rawExtra = Array.isArray(request.query.extra) ? request.query.extra.join('/') : String(request.query.extra ?? '');
    const searchParam = request.query.search ? String(request.query.search) : '';
    const extraStr = rawExtra.replace(/\.json$/, '');
    
    let search = searchParam.trim();
    if (!search && extraStr.startsWith('search=')) {
      search = decodeURIComponent(extraStr.slice(7)).trim();
    } else if (!search && extraStr && extraStr !== 'telegram') {
      search = decodeURIComponent(extraStr).trim();
    }

    if (!search) return response.status(200).json({ metas: [] });

    const words = search.split(/\s+/).filter((w) => w.length > 0);
    const conditions = words.flatMap((w) => [
      `normalized_title.ilike.%${w}%`,
      `file_name.ilike.%${w}%`,
      `caption.ilike.%${w}%`
    ]).join(',');

    const { data, error } = await db.from('media')
      .select('id, imdb_id, tmdb_id, normalized_title, file_name, caption')
      .or(conditions)
      .limit(60);

    if (error) {
      console.error('Catalog search error:', error.message);
      return response.status(200).json({ metas: [] });
    }

    const items = (data ?? []).sort((a, b) => calculateScore(b, words) - calculateScore(a, words));

    const unique = new Map<string, { id: string; imdb_id: string | null; tmdb_id: number | null; normalized_title: string | null; file_name: string | null }>();

    for (const item of items) {
      const key = item.imdb_id || item.id;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }

    const metas = await Promise.all([...unique.values()].slice(0, 20).map(async (item) => {
      let movie: TmdbMovie | null = null;
      if (item.tmdb_id) {
        movie = await details(item.tmdb_id);
      }

      const cleanTitle = (item.file_name || item.normalized_title || 'Telegram File')
        .replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '')
        .replace(/\.[A-Za-z0-9]{2,4}$/, '')
        .replace(/\[.*?\]/g, '')
        .replace(/➠.*$/g, '')
        .trim();

      const id = item.imdb_id || `tg:${item.id}`;

      return {
        id,
        type: catalogType,
        name: movie?.title || cleanTitle || 'Telegram Stream',
        description: movie?.overview || item.file_name || item.normalized_title || 'Indexed Telegram stream',
        poster: movie?.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        releaseInfo: movie?.release_date?.slice(0, 4)
      };
    }));

    response.status(200).json({ metas });
  } catch (err: any) {
    console.error('Catalog handler error:', err?.message || err);
    response.status(200).json({ metas: [] });
  }
}
