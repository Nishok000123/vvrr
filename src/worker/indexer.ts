import { db } from '../shared/db.js';

type Source = { id: string; telegram_channel: string; last_message_id: number };

// Strip Telegram channel prefix tags and download link noise from filenames
function cleanFileName(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/^@[A-Za-z0-9_]+\s*[-_:|]*\s*/g, '')   // @Channel_Name - prefix
    .replace(/➠[^\n]*/g, '')                          // ➠Fast Download Link...
    .replace(/https?:\/\/\S+/g, '')                   // any URL
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

// Clean caption but keep quality tags since we use them for matching
function cleanCaption(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/➠[^\n]*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

// Extract a clean normalized title from file_name for display/search
function extractTitle(fileName: string | null, caption: string | null): string {
  const source = fileName || caption || '';
  return source
    .replace(/^@[A-Za-z0-9_]+\s*[-_:|]*\s*/g, '')
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .replace(/➠.*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function mediaDetails(message: any): { fileName: string | null; caption: string | null; fileSize: number | null } | null {
  const document = message.document ?? message.video;
  if (!document) return null;
  const attribute = document.attributes?.find((item: any) => typeof item.fileName === 'string');
  return {
    fileName: cleanFileName(attribute?.fileName ?? message.file?.name ?? null),
    caption: cleanCaption(typeof message.message === 'string' ? message.message : null),
    fileSize: Number(document.size ?? 0) || null
  };
}

export async function indexSources(client: any): Promise<void> {
  const { data: sources, error } = await db.from('source_channels').select('id, telegram_channel, last_message_id').eq('enabled', true);
  if (error) throw error;
  for (const source of (sources ?? []) as Source[]) {
    await indexSource(client, source).catch((err: Error) => {
      console.error(`Error indexing source channel ${source.telegram_channel}:`, err.message);
    });
  }
}

async function indexSource(client: any, source: Source): Promise<void> {
  const channelId = /^ -?\d+$/.test(source.telegram_channel.trim()) ? BigInt(source.telegram_channel.trim()) : source.telegram_channel;
  const channel = await client.getEntity(channelId);
  let newestId = source.last_message_id;
  let batchCount = 0;
  let indexedCount = 0;

  console.log(`[Indexer] Starting channel ${source.telegram_channel} from message_id=${source.last_message_id}`);

  for await (const message of client.iterMessages(channel, { minId: source.last_message_id, reverse: true })) {
    const msgId = Number(message.id);
    if (msgId > newestId) newestId = msgId;

    const details = mediaDetails(message);
    if (details) {
      const normalizedTitle = extractTitle(details.fileName, details.caption);

      await db.from('media').upsert({
        source_id: source.id,
        telegram_message_id: msgId,
        file_name: details.fileName,
        caption: details.caption,
        file_size: details.fileSize,
        normalized_title: normalizedTitle,
        // imdb_id/tmdb_id resolved lazily at stream time via Cinemeta — not here
        // This avoids TMDB API rate limits during bulk indexing
        tmdb_id: null,
        imdb_id: null
      }, { onConflict: 'source_id,telegram_message_id', ignoreDuplicates: true });

      indexedCount++;
    }

    batchCount++;
    if (batchCount % 50 === 0) {
      await db.from('source_channels').update({ last_message_id: newestId }).eq('id', source.id);
      await new Promise((resolve) => setTimeout(resolve, 200)); // gentle flood-wait pause
    }
  }

  if (newestId !== source.last_message_id) {
    await db.from('source_channels').update({ last_message_id: newestId }).eq('id', source.id);
  }

  console.log(`[Indexer] Done channel ${source.telegram_channel}: ${indexedCount} media files indexed, last_id=${newestId}`);
}
