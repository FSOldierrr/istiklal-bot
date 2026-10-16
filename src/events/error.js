const { log } = require('../utils');
const { getGuildSettings } = require('../database/db');

module.exports = {
  name: 'error',
  once: false,
  async execute(error, client) {
    log('error', 'Discord.js hata', { error: error?.message, stack: error?.stack });

    // Yapılandırılmış log kanallarına bildir
    for (const [guildId, guild] of client.guilds.cache) {
      let settings;
      try {
        settings = getGuildSettings(guildId);
      } catch (_) {
        continue;
      }
      if (settings?.log_channel_id) {
        const channel = guild.channels.cache.get(settings.log_channel_id);
        if (channel && channel.isTextBased()) {
          try {
            await channel
              .send({
                content: `❌ **Bot Hatası**\n\`\`\`${String(error?.message).substring(0, 1900)}\`\`\``,
              })
              .catch(() => {});
          } catch (_) {
            // yoksay
          }
        }
      }
    }
  },
};
