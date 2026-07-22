import { db } from '../shared/db.js';
import { titleFromMedia } from '../shared/title.js';
import { findMovie } from '../shared/tmdb.js';

type Source = { id: string; telegram_channel: string; last_message_id: number };

function mediaDetails(message: any): { fileName: string | null; caption: string | null; fileSize: number | null } | null {
  const document = message.document ?? message.video;
  if (!document) return null;
  const attribute = document.attributes?.find((item: any) => typeof item.fileName === 'string');
  return {
    fileName: attribute?.fileName ?? message.file?.name ?? null,
    caption: typeof message.message === 'string' ? message.message : null,
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

  for await (const message of client.iterMessages(channel, { minId: source.last_message_id, reverse: true })) {
    const msgId = Number(message.id);
    if (msgId > newestId) newestId = msgId;

    const details = mediaDetails(message);
    if (details) {
      const title = titleFromMedia(details.fileName, details.caption);
      const match = await findMovie(title).catch(() => null);

      await db.from('media').upsert({
        source_id: source.id,
        telegram_message_id: msgId,
        file_name: details.fileName,
        caption: details.caption,
        file_size: details.fileSize,
        normalized_title: title,
        tmdb_id: match?.tmdbId ?? null,
        imdb_id: match?.imdbId ?? null
      }, { onConflict: 'source_id,telegram_message_id', ignoreDuplicates: true });
    }

    batchCount++;
    if (batchCount % 50 === 0) {
      await db.from('source_channels').update({ last_message_id: newestId }).eq('id', source.id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (newestId !== source.last_message_id) {
    await db.from('source_channels').update({ last_message_id: newestId }).eq('id', source.id);
  }
}
