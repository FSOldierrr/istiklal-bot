const { SlashCommandBuilder } = require('discord.js');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { getGuildSettings } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Ticket panelini ayarlanan kanala gönderir.'),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu komutu sadece yetkililer kullanabilir.' })],
      });
    }

    const guild = interaction.guild;
    const settings = getGuildSettings(guild.id);
    const channelId = settings.ticket_channel_id;
    if (!channelId) {
      return interaction.editReply({
        embeds: [error({ title: 'Hata', description: 'Ticket panel kanalı ayarlanmamış. /setup ile ayarlayın.' })],
      });
    }
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      return interaction.editReply({
        embeds: [error({ title: 'Hata', description: 'Ticket panel kanalı bulunamadı.' })],
      });
    }

    const ticketTypes = JSON.parse(settings.ticket_types || '[]');
    if (ticketTypes.length === 0) {
      return interaction.editReply({
        embeds: [error({ title: 'Hata', description: 'Ticket türleri tanımlı değil. /setup ile ayarlayın.' })],
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_open')
      .setPlaceholder('Bir ticket kategorisi seçin')
      .addOptions(
        ticketTypes.map((t) => ({
          label: t,
          value: t,
          description: `${t} ticketi açar`,
        }))
      );

    const row = new ActionRowBuilder().addComponents(select);

    await channel.send({
      content: '@everyone Aşağıdaki menüden bir kategori seçerek ticket açabilirsiniz.',
      embeds: [
        success({
          title: '🎫 Ticket Sistemi',
          description: 'Bir ticket açmak için aşağıdaki seçenekten ilgili kategoriyi seçin. Sadece sizinle yetkililer bu ticketi görebilir.',
        }),
      ],
      components: [row],
    });

    await interaction.editReply({
      embeds: [success({ title: 'Ticket Paneli Gönderildi', description: `Panel <#${channelId}> kanalına gönderildi.` })],
    });
  },
};
