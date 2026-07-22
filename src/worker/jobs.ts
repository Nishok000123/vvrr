import { db, type Media } from '../shared/db.js';

type Job = { id: string; media_id: string };
type Bot = { id: string; username: string; url_pattern: string | null };

function extractUrl(text: string, pattern: string | null): string | null {
  const match = pattern ? new RegExp(pattern).exec(text)?.[0] : text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  return match?.replace(/[),.;]+$/, '') ?? null;
}

async function waitForBotUrl(client: any, bot: Bot, notBefore: number): Promise<string | null> {
  const entity = await client.getEntity(bot.username);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const messages = await client.getMessages(entity, { limit: 10 });
    for (const message of messages as any[]) {
      const timestamp = Number(message.date ?? 0) * 1000;
      if (timestamp < notBefore - 2000) continue;
      const url = extractUrl(String(message.message ?? ''), bot.url_pattern);
      if (url) return url;
    }
  }
  return null;
}

async function runJob(client: any, job: Job): Promise<void> {
  const { data: media, error: mediaError } = await db.from('media').select('*').eq('id', job.media_id).single();
  if (mediaError) throw mediaError;
  const item = media as Media;
  const { data: source, error: sourceError } = await db.from('source_channels').select('telegram_channel').eq('id', item.source_id).single();
  if (sourceError) throw sourceError;
  const { data: bots, error: botsError } = await db.from('link_bots').select('id, username, url_pattern').eq('enabled', true);
  if (botsError) throw botsError;
  const started = Date.now();
  const sourceEntity = await client.getEntity(source.telegram_channel);

  const links = await Promise.all((bots ?? []).map(async (bot: Bot) => {
    const destination = await client.getEntity(bot.username);
    await client.forwardMessages(destination, { messages: [item.telegram_message_id], fromPeer: sourceEntity });
    return { bot, url: await waitForBotUrl(client, bot, started) };
  }));
  const rows = links.filter((item) => item.url).map((item) => ({ media_id: job.media_id, link_bot_id: item.bot.id, url: item.url! }));
  if (rows.length) {
    const { error } = await db.from('direct_links').upsert(rows, { onConflict: 'media_id,link_bot_id,url', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { error } = await db.from('generation_jobs').update({ status: rows.length ? 'complete' : 'failed', completed_at: new Date().toISOString(), error: rows.length ? null : 'No link bot returned a URL' }).eq('id', job.id);
  if (error) throw error;
}

export async function processJobs(client: any): Promise<void> {
  const { data: jobs, error } = await db.from('generation_jobs').select('id, media_id').eq('status', 'queued').order('created_at').limit(3);
  if (error) throw error;
  for (const job of (jobs ?? []) as Job[]) {
    const claim = await db.from('generation_jobs').update({ status: 'processing' }).eq('id', job.id).eq('status', 'queued').select('id').maybeSingle();
    if (claim.error || !claim.data) continue;
    await runJob(client, job).catch(async (cause: Error) => {
      await db.from('generation_jobs').update({ status: 'failed', error: cause.message, completed_at: new Date().toISOString() }).eq('id', job.id);
    });
  }
}

export async function cleanupLinks(): Promise<void> {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from('direct_links').delete().lt('created_at', cutoff);
  if (error) throw error;
}
