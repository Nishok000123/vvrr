import { db } from '../../../../src/shared/db.js';

type TmdbMovie = { title?: string; overview?: string; poster_path?: string; release_date?: string };

async function details(tmdbId: number): Promise<TmdbMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`).catch(() => null);
  return response && response.ok ? (response.json() as Promise<TmdbMovie>) : null;
}

export default async function handler(request: any, response: any): Promise<void> {
  try {
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
    let dbQuery = db.from('media').select('id, imdb_id, tmdb_id, normalized_title, file_name, caption');

    for (const word of words) {
      dbQuery = dbQuery.or(`normalized_title.ilike.%${word}%,file_name.ilike.%${word}%,caption.ilike.%${word}%`);
    }

    const { data, error } = await dbQuery.limit(30);

    if (error) {
      console.error('Catalog search error:', error.message);
      return response.status(200).json({ metas: [] });
    }

    const unique = new Map<string, { id: string; imdb_id: string | null; tmdb_id: number | null; normalized_title: string | null; file_name: string | null }>();

    for (const item of data ?? []) {
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
        type: 'movie',
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
