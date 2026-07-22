export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const LINK_CACHE_HOURS = 12;
export const LINK_CACHE_MS = LINK_CACHE_HOURS * 60 * 60 * 1000;
