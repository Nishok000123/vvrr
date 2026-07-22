import input from 'input';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { db } from '../shared/db.js';
import { encrypt } from '../shared/crypto.js';
import { required } from '../shared/config.js';

const client = new TelegramClient(
  new StringSession(''),
  Number(required('TELEGRAM_API_ID')),
  required('TELEGRAM_API_HASH'),
  { connectionRetries: 5 }
);

await client.start({
  phoneNumber: async () => process.env.TELEGRAM_PHONE || input.text('Telegram phone number: '),
  password: async () => input.text('Two-step password (leave empty if none): '),
  phoneCode: async () => input.text('Telegram login code: '),
  onError: (error: Error) => console.error(error.message)
});

const { error } = await db.from('worker_sessions').upsert({
  name: 'telegram',
  ciphertext: encrypt((client.session as StringSession).save()),
  updated_at: new Date().toISOString()
});
if (error) throw error;
await client.disconnect();
console.log('Encrypted Telegram session saved to Supabase.');
