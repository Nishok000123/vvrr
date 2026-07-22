import { db, type Media } from '../shared/db.js';

type Job = { id: string; media_id: string };
type Bot = { id: string; username: string; url_pattern: string | null };

const PREFERRED_PRIORITY: string[] = [
  '-1002407145439',
  'filetolinkzeus_bot',
  'dd_bypass_bot',
  'filetolink_4gb_ultraspeedv3_bot',
  'reaperfiletolinkbot'
];

function getBotPriority(username: string): number {
  const clean = username.replace(/^@/, '').toLowerCase().trim();
  const index = PREFERRED_PRIORITY.findIndex((item) => item.toLowerCase() === clean);
  return index >= 0 ? index : 999;
}

function processDirectUrl(rawUrl: string): string {
  let clean = rawUrl.replace(/[),.;]+$/, '');
  // Convert Zeus bot landing download page to direct fast stream link!
  if (clean.includes('filetolinkzeus.com/download/')) {
    clean = clean.replace('/download/', '/stream/');
  }
  return clean;
}

function extractUrl(text: string, pattern: string | null): string | null {
  if (pattern) {
    try {
      const match = new RegExp(pattern, 'i').exec(text)?.[0];
      if (match) return processDirectUrl(match);
    } catch {}
  }

  // 1. Stream / Watch links (Highest preference for video playback)
  const watchMatch =
    text.match(/(?:watch|stream)[^\s<>"']*(https?:\/\/[^\s<>"']+)/i) ||
    text.match(/(https?:\/\/[^\s<>"']*(?:watch|stream)[^\s<>"']*)/i);
  if (watchMatch && watchMatch[1]) {
    return processDirectUrl(watchMatch[1]);
  }

  // 2. Download links
  const downloadMatch =
    text.match(/(?:download|link)[^\s<>"']*(https?:\/\/[^\s<>"']+)/i) ||
    text.match(/(https?:\/\/[^\s<>"']*(?:download|link)[^\s<>"']*)/i);
  if (downloadMatch && downloadMatch[1]) {
    return processDirectUrl(downloadMatch[1]);
  }

  // 3. Any standard HTTP(S) URL
  const genericMatch = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  return genericMatch ? processDirectUrl(genericMatch) : null;
}

async function waitForBotUrl(client: any, botEntity: any, bot: Bot, notBefore: number): Promise<string | null> {
  const clickedButtons = new Set<string>();

  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const messages = await client.getMessages(botEntity, { limit: 10 }).catch(() => null);
    if (!messages) continue;

    for (const message of (messages ?? []) as any[]) {
      const timestamp = Number(message.date ?? 0) * 1000;
      if (timestamp < notBefore - 3000) continue;

      const text = String(message.message ?? '');
      const textUrl = extractUrl(text, bot.url_pattern);
      if (textUrl) return textUrl;

      // Check inline buttons (URL buttons & Callback buttons)
      if (message.buttons) {
        for (let r = 0; r < message.buttons.length; r++) {
          for (let c = 0; c < message.buttons[r].length; c++) {
            const btn = message.buttons[r][c];
            const btnKey = `${message.id}:${r}:${c}`;

            // 1. Direct URL buttons (long press copy link)
            if (btn.url && /^https?:\/\//i.test(btn.url)) {
              const url = extractUrl(btn.url, bot.url_pattern) || processDirectUrl(btn.url);
              if (url) return url;
            } else if (!clickedButtons.has(btnKey)) {
              // 2. Callback buttons (trigger link generation)
              const label = String(btn.text || '').toLowerCase();
              if (
                label.includes('generate') ||
                label.includes('link') ||
                label.includes('download') ||
                label.includes('watch') ||
                label.includes('dl') ||
                label.includes('stream')
              ) {
                clickedButtons.add(btnKey);
                try {
                  await message.click(r, c);
                } catch {
                  // Silently ignore 400 errors for non-callback buttons
                }
              }
            }
          }
        }
      }
    }
  }
  return null;
}

async function runJob(client: any, job: Job): Promise<void> {
  if (!client.connected) {
    await client.connect().catch(() => {});
  }

  const { data: media, error: mediaError } = await db.from('media').select('*').eq('id', job.media_id).single();
  if (mediaError) throw mediaError;
  const item = media as Media;
  const { data: source, error: sourceError } = await db.from('source_channels').select('telegram_channel').eq('id', item.source_id).single();
  if (sourceError) throw sourceError;

  const { data: bots, error: botsError } = await db
    .from('link_bots')
    .select('id, username, url_pattern')
    .eq('enabled', true);
  if (botsError) throw botsError;

  const sortedBots = ((bots ?? []) as Bot[]).sort((a, b) => getBotPriority(a.username) - getBotPriority(b.username));

  const sourceEntity = await client.getEntity(/^ -?\d+$/.test(source.telegram_channel.trim()) ? BigInt(source.telegram_channel.trim()) : source.telegram_channel);

  // Parallel execution across all enabled link generators for fast fallbacks
  const linkPromises = sortedBots.map(async (bot) => {
    try {
      const targetId = /^ -?\d+$/.test(bot.username.trim()) ? BigInt(bot.username.trim()) : bot.username;
      const destination = await client.getEntity(targetId);
      const started = Date.now();

      // Send as native forward without "Forwarded from" author tag
      await client.forwardMessages(destination, { messages: [item.telegram_message_id], fromPeer: sourceEntity, dropAuthor: true });
      const url = await waitForBotUrl(client, destination, bot, started);
      if (url) return { media_id: job.media_id, link_bot_id: bot.id, url, priority: getBotPriority(bot.username) };
    } catch (e: any) {
      console.error(`Error processing bot/channel ${bot.username}:`, e?.message);
    }
    return null;
  });

  const results = await Promise.all(linkPromises);
  const rows = results
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.priority - b.priority)
    .map(({ priority, ...rest }) => rest);

  if (rows.length) {
    const { error } = await db.from('direct_links').upsert(rows, { onConflict: 'media_id,link_bot_id,url', ignoreDuplicates: true });
    if (error) throw error;
  }

  const { error } = await db.from('generation_jobs').update({
    status: rows.length ? 'complete' : 'failed',
    completed_at: new Date().toISOString(),
    error: rows.length ? null : 'No link bot returned a URL'
  }).eq('id', job.id);
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
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from('direct_links').delete().lt('created_at', cutoff);
  if (error) throw error;
}
