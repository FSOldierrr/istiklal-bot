const { getGuildSettings } = require('../database/db');
const { info } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const guild = member.guild;
    const settings = getGuildSettings(guild.id);

    if (settings.welcome_enabled === 1 && settings.welcome_channel_id) {
      const channel = guild.channels.cache.get(settings.welcome_channel_id);
      if (channel) {
        const memberCount = guild.memberCount;
        await channel.send({
          embeds: [
            info({
              title: '👋 Güle Güle',
              description: `${member.user.tag} sunucudan ayrıldı.\nKalan üye: ${memberCount}`,
              fields: [{ name: 'Üye', value: member.user.tag, inline: true }],
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};
