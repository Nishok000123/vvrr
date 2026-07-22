import { db } from '../shared/db.js';

const action = process.argv[2];
const name = process.argv[3];
const pattern = process.argv[4] || null;

if (!action || !name) {
  console.log('Usage:');
  console.log('  npm run add:channel <channel_name_or_id>');
  console.log('  npm run add:bot <bot_username_or_channel_id> [url_pattern]');
  process.exit(1);
}

if (action === 'channel') {
  const channelName = name.replace(/^@/, '');
  const { error } = await db.from('source_channels').upsert({ telegram_channel: channelName }, { onConflict: 'telegram_channel' });
  if (error) {
    console.error('❌ Error adding channel:', error.message);
  } else {
    console.log(`✅ Channel '${channelName}' added successfully!`);
  }
} else if (action === 'bot') {
  const botName = name.replace(/^@/, '');
  const { error } = await db.from('link_bots').upsert({ username: botName, url_pattern: pattern }, { onConflict: 'username' });
  if (error) {
    console.error('❌ Error adding bot:', error.message);
  } else {
    console.log(`✅ Link bot/channel '${botName}' added successfully!`);
  }
} else {
  console.error('❌ Unknown action. Use "channel" or "bot".');
}
