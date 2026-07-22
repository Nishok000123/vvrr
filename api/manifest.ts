export default function handler(_request: any, response: any): void {
  response.status(200).json({
    id: 'org.personal.telegrambridge',
    version: '0.1.0',
    name: 'Telegram Bridge',
    description: 'Private indexed media streams for Movies & Series',
    resources: ['catalog', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tg:'],
    catalogs: [
      { type: 'movie', id: 'telegram', name: 'Telegram Movies', extra: [{ name: 'search', isRequired: true }] },
      { type: 'series', id: 'telegram', name: 'Telegram Series', extra: [{ name: 'search', isRequired: true }] }
    ]
  });
}
