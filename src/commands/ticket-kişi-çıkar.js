const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, warning, info } = require('../utils/embeds');
const { db } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('ticket-kişi-çıkar')
    .setDescription('Bir üyenin mevcut ticket kanalına erişimini kaldırır.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Çıkarılacak üye').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer kullanıcı çıkarabilir.' })],
      });
    }

    const ticket = db
      .prepare('SELECT * FROM tickets WHERE channel_id = ? AND status = ?')
      .get(interaction.channel.id, 'open');
    if (!ticket) {
      return interaction.editReply({
        embeds: [error({ title: 'Ticket Değil', description: 'Bu komut yalnızca **açık** bir ticket kanalında kullanılabilir.' })],
      });
    }

    const user = interaction.options.getUser('kullanıcı');
    if (user.id === ticket.owner_id) {
      return interaction.editReply({
        embeds: [warning({ title: 'İşlem Engellendi', description: 'Ticket sahibi kanaldan çıkarılamaz.' })],
      });
    }
    if (user.id === interaction.client.user.id) {
      return interaction.editReply({
        embeds: [warning({ title: 'İşlem Engellendi', description: 'Botun kendisini çıkaramazsınız.' })],
      });
    }

    try {
      await interaction.channel.permissionOverwrites.delete(user.id);
    } catch (err) {
      return interaction.editReply({
        embeds: [error({ title: 'Çıkarılamadı', description: `İzin kaldırılamadı: ${err.message}` })],
      });
    }

    // Ticket kanalına bilgi
    await interaction.channel
      .send({
        embeds: [
          warning({
            title: '👥 Kullanıcı Çıkarıldı',
            description: `${user} bu ticket kanalından çıkarıldı.`,
            fields: [{ name: 'Çıkaran', value: interaction.user.toString(), inline: true }],
          }),
        ],
      })
      .catch(() => {});

    // Kullanıcıya DM
    await user
      .send({
        embeds: [
          info({
            title: '🎫 Ticketten Çıkarıldınız',
            description: `${interaction.guild.name} sunucusundaki bir ticket kanalından çıkarıldınız.`,
            fields: [{ name: 'Çıkaran', value: interaction.user.tag, inline: true }],
          }),
        ],
      })
      .catch(() => {});

    return interaction.editReply({
      embeds: [success({ title: 'Kullanıcı Çıkarıldı', description: `${user} ticket kanalından çıkarıldı.` })],
    });
  },
};
