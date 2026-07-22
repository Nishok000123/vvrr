export function titleFromMedia(fileName: string | null, caption: string | null): string {
  const source = caption || fileName || '';
  return source
    .replace(/\.[A-Za-z0-9]{2,5}$/g, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\b(480p|720p|1080p|2160p|4k|web[ .-]?dl|bluray|x26[45]|hevc|aac|ddp?5?\.?1|proper|repack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
