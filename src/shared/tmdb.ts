import { required } from './config.js';

export type TmdbMatch = { tmdbId: number; imdbId: string } | null;

export async function findMovie(title: string): Promise<TmdbMatch> {
  if (!title) return null;
  const key = required('TMDB_API_KEY');
  const search = new URL('https://api.themoviedb.org/3/search/movie');
  search.searchParams.set('api_key', key);
  search.searchParams.set('query', title);
  const result = await fetch(search);
  if (!result.ok) return null;
  const body = await result.json() as { results?: Array<{ id: number }> };
  const tmdbId = body.results?.[0]?.id;
  if (!tmdbId) return null;
  const external = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${encodeURIComponent(key)}`);
  if (!external.ok) return null;
  const externalBody = await external.json() as { imdb_id?: string };
  return externalBody.imdb_id ? { tmdbId, imdbId: externalBody.imdb_id } : null;
}
