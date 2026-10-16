const { SlashCommandBuilder } = require('discord.js');
const { info } = require('../utils/embeds');

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h} sa ${m} dk ${s} sn`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botbilgi')
    .setDescription('Botun kendisi hakkında bilgi verir.'),
  async execute(interaction, client) {
    const guild = interaction.guild;
    const totalMembers = guild ? guild.memberCount : 0;
    const onlineMembers = guild
      ? guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
      : 0;
    const ping = client.ws.ping;
    const uptime = formatUptime(process.uptime());

    await interaction.editReply({
      embeds: [
        info({
          title: '🤖 İstiklal Bot Bilgisi',
          fields: [
            { name: 'Sunucudaki Toplam Üye', value: String(totalMembers), inline: true },
            { name: 'Aktif (Çevrimiçi) Üye', value: String(onlineMembers), inline: true },
            { name: 'Ping', value: `${ping} ms`, inline: true },
            { name: 'Çalışma Süresi', value: uptime, inline: true },
            { name: 'Toplam Sunucu', value: String(client.guilds.cache.size), inline: true },
            { name: 'Sürüm', value: '1.0.0', inline: true },
            { name: 'Geliştirici', value: 'İstiklal Bot Geliştiricisi', inline: true },
          ],
        }),
      ],
    });
  },
};
