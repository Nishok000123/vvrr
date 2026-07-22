import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { required } from './config.js';

function key(): Buffer {
  const value = Buffer.from(required('SESSION_ENCRYPTION_KEY'), 'hex');
  if (value.length !== 32) throw new Error('SESSION_ENCRYPTION_KEY must be 64 hex characters');
  return value;
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function decrypt(value: string): string {
  const [ivText, tagText, dataText] = value.split('.');
  if (!ivText || !tagText || !dataText) throw new Error('Stored Telegram session has invalid format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
}
