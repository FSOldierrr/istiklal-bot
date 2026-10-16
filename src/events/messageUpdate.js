const { getGuildSettings } = require('../database/db');
const { info } = require('../utils/embeds');
const { applyProtection } = require('../utils/profanity');

// İçerik null olabilir (önbelleğe alınmamış / yalnızca embed-ek olan mesajlar).
function asText(value, max = 500) {
  const text = value ? String(value) : '';
  return text.length ? text.slice(0, max) : '*boş*';
}

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    try {
      if (newMessage.author?.bot) return;
      if (!newMessage.guild) return;

      // Düzenleme ile filtreyi atlatmayı engelle
      await applyProtection(newMessage, client);

      if ((oldMessage.content ?? null) === (newMessage.content ?? null)) return;

      const settings = getGuildSettings(newMessage.guild.id);
      const logTypes = JSON.parse(settings.log_types || '{}');
      if (!logTypes.messageUpdate) return;
      if (!settings.log_channel_id) return;

      const logChannel = newMessage.guild.channels.cache.get(settings.log_channel_id);
      if (!logChannel) return;

      await logChannel
        .send({
          embeds: [
            info({
              title: '📝 Mesaj Düzenlendi',
              fields: [
                { name: 'Kanal', value: `<#${newMessage.channelId}>`, inline: true },
                { name: 'Yazar', value: newMessage.author?.tag || 'Bilinmiyor', inline: true },
                { name: 'Eski', value: asText(oldMessage.content), inline: false },
                { name: 'Yeni', value: asText(newMessage.content), inline: false },
              ],
            }),
          ],
        })
        .catch(() => {});
    } catch (err) {
      console.error('[messageUpdate] Hata:', err);
    }
  },
};
