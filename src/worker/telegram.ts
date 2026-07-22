import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { db } from '../shared/db.js';
import { decrypt, encrypt } from '../shared/crypto.js';
import { required } from '../shared/config.js';

export async function createTelegramClient(): Promise<any> {
  const { data, error } = await db.from('worker_sessions').select('ciphertext').eq('name', 'telegram').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Telegram session missing. Run `npm run telegram:login` locally first.');

  const client = new TelegramClient(
    new StringSession(decrypt(data.ciphertext)),
    Number(required('TELEGRAM_API_ID')),
    required('TELEGRAM_API_HASH'),
    { connectionRetries: 10 }
  );
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Stored Telegram session is no longer authorized. Run `npm run telegram:login` again.');
  return client;
}

export async function saveTelegramSession(client: any): Promise<void> {
  const ciphertext = encrypt(client.session.save());
  const { error } = await db.from('worker_sessions').upsert({ name: 'telegram', ciphertext, updated_at: new Date().toISOString() });
  if (error) throw error;
}
