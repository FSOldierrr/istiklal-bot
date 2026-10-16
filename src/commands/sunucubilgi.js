const { SlashCommandBuilder } = require('discord.js');
const { info } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sunucubilgi')
    .setDescription('Bulunduğunuz sunucu hakkında bilgi verir.'),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply({
        embeds: [
          {
            color: 0xe74c3c,
            title: '❌ Hata',
            description: 'Bu komut sadece sunucu içinde kullanılabilir.',
            timestamp: new Date(),
          },
        ],
      });
    }

    const onlineMembers = guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size;
    const textChannels = guild.channels.cache.filter((c) => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === 2).size;
    const categories = guild.channels.cache.filter((c) => c.type === 4).size;

    await interaction.editReply({
      embeds: [
        {
          color: 0x3498db,
          title: `🏠 ${guild.name}`,
          fields: [
            { name: 'Sahip', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
            { name: 'Toplam Üye', value: String(guild.memberCount), inline: true },
            { name: 'Aktif Üye', value: String(onlineMembers), inline: true },
            { name: 'Yazı Kanalları', value: String(textChannels), inline: true },
            { name: 'Ses Kanalları', value: String(voiceChannels), inline: true },
            { name: 'Kategoriler', value: String(categories), inline: true },
            { name: 'Roller', value: String(guild.roles.cache.size), inline: true },
          ],
          timestamp: new Date(),
          footer: { text: 'İstiklal Bot • Sunucu Bilgisi' },
        },
      ],
    });
  },
};
