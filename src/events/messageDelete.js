const { getGuildSettings } = require('../database/db');
const { info } = require('../utils/embeds');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    try {
      if (message.author?.bot) return;
      if (!message.guild) return;

      const settings = getGuildSettings(message.guild.id);
      const logTypes = JSON.parse(settings.log_types || '{}');
      if (!logTypes.messageDelete) return;
      if (!settings.log_channel_id) return;

      const logChannel = message.guild.channels.cache.get(settings.log_channel_id);
      if (!logChannel) return;

      // İçerik null/boş olabilir (önbelleğe alınmamış veya yalnızca embed-ek mesajlar).
      const raw = message.content ? String(message.content) : '';
      const content = raw.length > 0 ? raw.slice(0, 1000) : '*İçerik yok (ek/embed)*';

      await logChannel
        .send({
          embeds: [
            info({
              title: '🗑️ Mesaj Silindi',
              fields: [
                { name: 'Kanal', value: `<#${message.channelId}>`, inline: true },
                { name: 'Yazar', value: message.author?.tag || 'Bilinmiyor', inline: true },
                { name: 'İçerik', value: content, inline: false },
              ],
            }),
          ],
        })
        .catch(() => {});
    } catch (err) {
      console.error('[messageDelete] Hata:', err);
    }
  },
};
