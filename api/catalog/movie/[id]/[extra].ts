import { db } from '../../../../src/shared/db.js';

type TmdbMovie = { title?: string; overview?: string; poster_path?: string; release_date?: string };

const STOP_WORDS = new Set(['movie', 'movies', 'film', 'films', 'full', 'hd', 'download', 'watch', 'series', 'season', 'episode', 'ep']);

async function details(tmdbId: number): Promise<TmdbMovie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`).catch(() => null);
  return response && response.ok ? (response.json() as Promise<TmdbMovie>) : null;
}

function calculateScore(item: any, searchWords: string[]): number {
  const cleanTitle = (item.file_name || item.normalized_title || '')
    .replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .toLowerCase();

  const cleanCaption = (item.caption || '')
    .replace(/https?:\/\/\S+/g, '')
    .toLowerCase();

  const fullText = `${cleanTitle} ${cleanCaption}`;

  let keywordScore = 0;
  for (const word of searchWords) {
    const w = word.toLowerCase();
    
    // Huge bonus if clean title STARTS with search term (e.g. "29 (2026)")
    if (cleanTitle.startsWith(w)) {
      keywordScore += 5000;
    }

    // High bonus for standalone title word boundary match
    const wordBoundaryRegex = new RegExp(`(?:^|\\s|\\[|\\()${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|\\]|\\)|-)`, 'i');
    if (wordBoundaryRegex.test(cleanTitle)) {
      keywordScore += 2500;
    } else if (cleanTitle.includes(w)) {
      keywordScore += 500;
    } else if (cleanCaption.includes(w)) {
      keywordScore += 50;
    }
  }

  let qualityScore = 0;
  if (fullText.includes('2160p') || fullText.includes('4k') || fullText.includes('uhd')) qualityScore += 500;
  else if (fullText.includes('1080p')) qualityScore += 400;
  else if (fullText.includes('720p')) qualityScore += 300;
  else if (fullText.includes('480p')) qualityScore += 200;

  if (fullText.includes('10bit') || fullText.includes('hdr')) qualityScore += 50;
  if (fullText.includes('hevc') || fullText.includes('x265')) qualityScore += 30;

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

    // Strip resolution, years, and stop words ("movie", "full", "hd", "download")
    const cleanSearch = search.replace(/\b(202[0-9]|199[0-9]|200[0-9]|201[0-9]|720p|1080p|2160p|4k)\b/gi, '').trim() || search;
    const rawWords = cleanSearch.split(/\s+/).filter((w) => w.length > 0);
    const keywords = rawWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    const words = keywords.length ? keywords : rawWords;

    // Search media table by main title / file_name first
    const firstWord = words[0];
    const { data: titleData } = await db.from('media')
      .select('id, imdb_id, tmdb_id, normalized_title, file_name, caption, file_size')
      .or(`file_name.ilike.%${firstWord}%,normalized_title.ilike.%${firstWord}%`)
      .limit(60);

    const { data: allData } = await db.from('media')
      .select('id, imdb_id, tmdb_id, normalized_title, file_name, caption, file_size')
      .or(`file_name.ilike.%${firstWord}%,normalized_title.ilike.%${firstWord}%,caption.ilike.%${firstWord}%`)
      .limit(60);

    const mergedMap = new Map<string, any>();
    for (const item of [...(titleData ?? []), ...(allData ?? [])]) {
      mergedMap.set(item.id, item);
    }
    const combinedData = [...mergedMap.values()];

    const items = combinedData.sort((a, b) => calculateScore(b, words) - calculateScore(a, words));

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
