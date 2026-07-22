export default function handler(_request: any, response: any): void {
  response.status(200).json({
    id: 'org.personal.telegrambridge',
    version: '0.1.0',
    name: 'Telegram Bridge',
    description: 'Private indexed media streams',
    resources: ['catalog', 'stream'],
    types: ['movie'],
    idPrefixes: ['tt'],
    catalogs: [{ type: 'movie', id: 'telegram', name: 'Telegram Library', extra: [{ name: 'search', isRequired: true }] }]
  });
}
