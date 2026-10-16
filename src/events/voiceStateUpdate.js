const { getGuildSettings } = require('../database/db');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    if (newState.member.id !== client.user.id) return;
    const manager = client.voiceManager;
    if (!manager) return;

    const guild = newState.guild;
    const settings = getGuildSettings(guild.id);
    const targetChannelId = settings.voice_channel_id;

    if (!newState.channelId && oldState.channelId) {
      logReconnect(guild, 'Bot ses kanalından çıkarıldı / bağlantı koptu.');
      manager.reconnect(guild);
      return;
    }

    if (
      newState.channelId &&
      oldState.channelId &&
      newState.channelId !== oldState.channelId &&
      targetChannelId &&
      newState.channelId !== targetChannelId
    ) {
      setTimeout(() => manager.join(guild), 3000);
    }
  },
};

function logReconnect(guild, reason) {
  const settings = getGuildSettings(guild.id);
  if (!settings.log_channel_id) return;
  const channel = guild.channels.cache.get(settings.log_channel_id);
  if (!channel) return;
  channel.send({
    embeds: [
      {
        color: 0xf1c40f,
        title: '🔊 Ses Bağlantısı Kesildi',
        description: reason,
        timestamp: new Date(),
        footer: { text: 'İstiklal Bot • Ses Sistem' },
      },
    ],
  }).catch(() => {});
}
