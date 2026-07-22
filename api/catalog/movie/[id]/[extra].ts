import { db } from '../../../../src/shared/db.js';

const STOP_WORDS = new Set(['movie', 'movies', 'film', 'films', 'full', 'hd', 'download', 'watch', 'series', 'season', 'episode', 'ep']);

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
    if (cleanTitle.startsWith(w)) keywordScore += 5000;
    const wbRegex = new RegExp(`(?:^|\\s|\\[|\\()${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|\\]|\\)|-)`, 'i');
    if (wbRegex.test(cleanTitle)) keywordScore += 2500;
    else if (cleanTitle.includes(w)) keywordScore += 500;
    else if (cleanCaption.includes(w)) keywordScore += 50;
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

const QUALITY_SUFFIX_RE = /\b(480p|720p|1080p|2160p|4K|HEVC|x264|x265|WEB[-.]?DL|BluRay|HDRip|AMZN|NF|TRUE|HQ|DD[+]?\d.*|AAC.*|\d+MB.*|\d+\.\d+GB.*)\b.*/i;

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

    // Strip years, resolutions, stop words
    const cleanSearch = search.replace(/\b(202[0-9]|199[0-9]|200[0-9]|201[0-9]|720p|1080p|2160p|4k)\b/gi, '').trim() || search;
    const rawWords = cleanSearch.split(/\s+/).filter((w) => w.length > 0);
    const keywords = rawWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    const words = keywords.length ? keywords : rawWords;
    const firstWord = words[0];

    // Single DB query - no double query, no TMDB call
    const { data: rows } = await db.from('media')
      .select('id, imdb_id, normalized_title, file_name, caption, file_size')
      .or(`file_name.ilike.%${firstWord}%,normalized_title.ilike.%${firstWord}%,caption.ilike.%${firstWord}%`)
      .limit(80);

    // Score and sort
    const scored = (rows ?? []).sort((a, b) => calculateScore(b, words) - calculateScore(a, words));

    // Deduplicate by imdb_id OR clean title (strip quality suffix for key)
    const seen = new Set<string>();
    const unique: typeof scored = [];
    for (const item of scored) {
      const raw = (item.file_name || item.normalized_title || '').replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '');
      const titleKey = item.imdb_id ||
        raw
          .replace(/\.[A-Za-z0-9]{2,5}$/, '')
          .replace(QUALITY_SUFFIX_RE, '')
          .trim().toLowerCase();
      if (!seen.has(titleKey)) {
        seen.add(titleKey);
        unique.push(item);
      }
    }

    const metas = unique.slice(0, 20).map((item) => {
      const cleanName = (item.file_name || item.normalized_title || 'Telegram File')
        .replace(/^@[A-Za-z0-9_]+\s*[-_:]*\s*/g, '')
        .replace(/\.[A-Za-z0-9]{2,5}$/, '')
        .replace(/\[.*?\]/g, '')
        .replace(/➠.*$/g, '')
        .replace(QUALITY_SUFFIX_RE, '')
        .trim();

      return {
        id: item.imdb_id || `tg:${item.id}`,
        type: catalogType,
        name: cleanName || 'Telegram Stream',
        description: item.normalized_title || item.file_name || '',
      };
    });

    response.status(200).json({ metas });
  } catch (err: any) {
    console.error('Catalog handler error:', err?.message || err);
    response.status(200).json({ metas: [] });
  }
}
