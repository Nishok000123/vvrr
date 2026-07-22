import { db } from '../../../../src/shared/db.js';
import { required } from '../../../../src/shared/config.js';

type TmdbMovie = { title?: string; overview?: string; poster_path?: string; release_date?: string };

async function details(tmdbId: number): Promise<TmdbMovie | null> {
  const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(required('TMDB_API_KEY'))}`);
  return response.ok ? response.json() as Promise<TmdbMovie> : null;
}

export default async function handler(request: any, response: any): Promise<void> {
  if (request.query.id !== 'telegram') return response.status(404).json({ metas: [] });
  const extra = String(request.query.extra ?? '').replace(/\.json$/, '');
  const search = extra.startsWith('search=') ? decodeURIComponent(extra.slice(7)) : '';
  if (!search.trim()) return response.status(200).json({ metas: [] });

  const { data, error } = await db.from('media')
    .select('imdb_id, tmdb_id, normalized_title, file_name')
    .not('imdb_id', 'is', null)
    .or(`normalized_title.ilike.%${search}%,file_name.ilike.%${search}%`)
    .limit(25);
  if (error) throw error;

  const unique = new Map<string, { tmdb_id: number; normalized_title: string | null }>();
  for (const item of data ?? []) {
    if (item.imdb_id && item.tmdb_id && !unique.has(item.imdb_id)) unique.set(item.imdb_id, item as { imdb_id: string; tmdb_id: number; normalized_title: string | null });
  }
  const metas = await Promise.all([...unique.entries()].slice(0, 20).map(async ([imdbId, item]) => {
    const movie = await details(item.tmdb_id).catch(() => null);
    return {
      id: imdbId,
      type: 'movie',
      name: movie?.title ?? item.normalized_title ?? imdbId,
      description: movie?.overview ?? '',
      poster: movie?.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
      releaseInfo: movie?.release_date?.slice(0, 4)
    };
  }));
  response.status(200).json({ metas });
}
