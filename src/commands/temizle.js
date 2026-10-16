const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { getGuildSettings } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('temizle')
    .setDescription('Belirli sayıda mesajı siler (toplu silme).')
    .addIntegerOption((o) => o.setName('miktar').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    if (!interaction.member.permissions.has('ManageMessages') && !interaction.member.permissions.has('Administrator')) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Mesajları yönet izniniz yok.' })] });
    }
    if (!interaction.guild.members.me.permissions.has('ManageMessages')) {
      return interaction.editReply({ embeds: [error({ title: 'Bot Yetkisi Yok', description: 'Botun mesajları yönet izni yok.' })] });
    }

    const amount = Math.min(Math.max(interaction.options.getInteger('miktar'), 1), 100);
    const channel = interaction.channel;

    try {
      const deleted = await channel.bulkDelete(amount, true);
      await interaction.editReply({ embeds: [success({ title: 'Mesajlar Silindi', description: `${deleted.size} mesaj silindi.` })] });
      const settings = getGuildSettings(guild.id);
      const logTypes = JSON.parse(settings.log_types || '{}');
      if (logTypes.moderation && settings.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          await logChannel.send({
            embeds: [
              {
                color: 0x3498db,
                title: '🧹 Toplu Mesaj Silme',
                fields: [
                  { name: 'Kanal', value: `<#${channel.id}>`, inline: true },
                  { name: 'Yetkili', value: interaction.user.toString(), inline: true },
                  { name: 'Silinen', value: String(deleted.size), inline: true },
                ],
                timestamp: new Date(),
                footer: { text: 'İstiklal Bot • Moderasyon' },
              },
            ],
          }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Mesajlar silinemedi: ${err.message}` })] });
    }
  },
};
