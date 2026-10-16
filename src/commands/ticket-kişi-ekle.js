const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, info } = require('../utils/embeds');
const { db } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('ticket-kişi-ekle')
    .setDescription('Bir üyeyi mevcut ticket kanalına ekler.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Eklenecek üye').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer kullanıcı ekleyebilir.' })],
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
    if (user.bot) {
      return interaction.editReply({
        embeds: [error({ title: 'Geçersiz Kullanıcı', description: 'Botlar tickete eklenemez.' })],
      });
    }
    if (user.id === ticket.owner_id) {
      return interaction.editReply({
        embeds: [info({ title: 'Zaten Ekli', description: `${user} zaten bu ticketin sahibi.` })],
      });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [error({ title: 'Eklenemedi', description: `İzin verilemedi: ${err.message}` })],
      });
    }

    // Ticket kanalına bilgi
    await interaction.channel
      .send({
        embeds: [
          success({
            title: '👥 Kullanıcı Eklendi',
            description: `${user} bu ticket kanalına eklendi.`,
            fields: [{ name: 'Ekleyen', value: interaction.user.toString(), inline: true }],
          }),
        ],
      })
      .catch(() => {});

    // Kullanıcıya DM
    await user
      .send({
        embeds: [
          info({
            title: '🎫 Tickete Eklendiniz',
            description: `${interaction.guild.name} sunucusundaki bir ticket kanalına eklendiniz: <#${interaction.channel.id}>`,
            fields: [{ name: 'Ekleyen', value: interaction.user.tag, inline: true }],
          }),
        ],
      })
      .catch(() => {});

    return interaction.editReply({
      embeds: [success({ title: 'Kullanıcı Eklendi', description: `${user} ticket kanalına eklendi.` })],
    });
  },
};
