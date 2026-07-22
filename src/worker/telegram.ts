import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { db } from '../shared/db.js';
import { decrypt } from '../shared/crypto.js';
import { required } from '../shared/config.js';

export async function createTelegramClient(): Promise<any> {
  let sessionStr = process.env.TELEGRAM_SESSION;

  if (!sessionStr) {
    const { data, error } = await db.from('worker_sessions').select('ciphertext').eq('name', 'telegram').maybeSingle();
    if (error) throw error;
    if (data) {
      sessionStr = decrypt(data.ciphertext);
    }
  }

  if (!sessionStr) throw new Error('Telegram session missing. Run `npm run telegram:login` locally first.');

  const client = new TelegramClient(
    new StringSession(sessionStr),
    Number(required('TELEGRAM_API_ID')),
    required('TELEGRAM_API_HASH'),
    { connectionRetries: 10, autoReconnect: true }
  );

  await client.connect();
  if (!(await client.checkAuthorization())) {
    throw new Error('Stored Telegram session is no longer authorized. Run `npm run telegram:login` again.');
  }
  return client;
}

export async function saveTelegramSession(_client: any): Promise<void> {
  // Stable session retention prevents AUTH_KEY_DUPLICATED
}
