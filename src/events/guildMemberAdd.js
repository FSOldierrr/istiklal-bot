const { getGuildSettings, setGuildSetting } = require('../database/db');
const { info, warning } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const guild = member.guild;
    const settings = getGuildSettings(guild.id);

    if (settings.autorole_id) {
      const role = guild.roles.cache.get(settings.autorole_id);
      if (role) {
        try {
          await member.roles.add(role, 'Otomatik rol (sunucuya giriş)');
        } catch (err) {
          const logChannelId = settings.log_channel_id;
          if (logChannelId) {
            const logChannel = guild.channels.cache.get(logChannelId);
            if (logChannel) {
              await logChannel.send({
                embeds: [
                  warning({
                    title: 'Otomatik Rol Hatası',
                    description: `${member.user.tag} üyesine otomatik rol verilemedi. Botun rol hiyerarşisi yetersiz olabilir.\nHata: ${err.message}`,
                  }),
                ],
              }).catch(() => {});
            }
          }
        }
      }
    }

    if (settings.welcome_enabled === 1 && settings.welcome_channel_id) {
      const channel = guild.channels.cache.get(settings.welcome_channel_id);
      if (channel) {
        const memberCount = guild.memberCount;
        await channel.send({
          embeds: [
            info({
              title: '👋 Hoş Geldin!',
              description: `${member.user.tag} sunucuya katıldı!\nToplam üye: ${memberCount}`,
              fields: [{ name: 'Üye', value: member.user.toString(), inline: true }],
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};
