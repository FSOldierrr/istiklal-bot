const { SlashCommandBuilder } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { info, error } = require('../utils/embeds');
const { getGuildSettings } = require('../database/db');

module.exports = {
  ephemeral: false,
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Sunucu kurulum panelini açar ve ayarları yönetir.'),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu komutu sadece yetkililer kullanabilir.' })],
      });
    }

    const guild = interaction.guild;
    const settings = getGuildSettings(guild.id);
    const staffRoles = JSON.parse(settings.staff_roles || '[]');
    const ticketTypes = JSON.parse(settings.ticket_types || '[]');
    const logTypes = JSON.parse(settings.log_types || '{}');
    const selfRoles = JSON.parse(settings.self_roles || '[]');

    const fmtChannel = (id) => (id ? `<#${id}>` : 'Ayarlanmamış');
    const fmtRole = (id) => (id ? `<@&${id}>` : 'Ayarlanmamış');

    const activeLogs = Object.entries(logTypes)
      .filter(([, v]) => v == 1)
      .map(([k]) => k)
      .join(', ') || 'Yok';

    const embed = info({
      title: '⚙️ Sunucu Kurulum Paneli',
      description:
        'Aşağıdaki butonlardan ayarlamak istediğiniz kısmı seçin. Değişiklikler aniden SQLite veritabanına kaydedilir.',
      fields: [
        { name: 'Log Kanalı', value: fmtChannel(settings.log_channel_id), inline: true },
        { name: 'Yetkili Roller', value: staffRoles.length ? staffRoles.map((r) => `<@&${r}>`).join(', ') : 'Ayarlanmamış', inline: true },
        { name: 'Ticket Kategorisi', value: fmtChannel(settings.ticket_category_id), inline: true },
        { name: 'Ticket Panel Kanalı', value: fmtChannel(settings.ticket_channel_id), inline: true },
        { name: 'Ticket Türleri', value: ticketTypes.length ? ticketTypes.join(', ') : 'Destek, Şikayet, Başvuru', inline: true },
        { name: 'Otomatik Rol', value: fmtRole(settings.autorole_id), inline: true },
        { name: 'AFK Ses Kanalı', value: fmtChannel(settings.voice_channel_id), inline: true },
        { name: 'Hoş Geldin / Güle Güle', value: settings.welcome_enabled === 1 ? 'Açık ✅' : 'Kapalı ❌', inline: true },
        { name: 'Hoş Geldin Kanalı', value: fmtChannel(settings.welcome_channel_id), inline: true },
        { name: 'Rol Paneli Rolleri', value: selfRoles.length ? selfRoles.map((r) => `<@&${r}>`).join(', ') : 'Yok', inline: true },
        { name: 'Aktif Log Türleri', value: activeLogs, inline: true },
      ],
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:log_channel').setLabel('Log Kanalı').setStyle('Secondary').setEmoji('📋'),
      new ButtonBuilder().setCustomId('setup:staff_roles').setLabel('Yetkili Roller').setStyle('Secondary').setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('setup:ticket_category').setLabel('Ticket Kategorisi').setStyle('Secondary').setEmoji('🎫'),
      new ButtonBuilder().setCustomId('setup:ticket_channel').setLabel('Ticket Kanalı').setStyle('Secondary').setEmoji('📢')
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:ticket_types').setLabel('Ticket Türleri').setStyle('Secondary').setEmoji('🏷️'),
      new ButtonBuilder().setCustomId('setup:autorole').setLabel('Otomatik Rol').setStyle('Secondary').setEmoji('🎭'),
      new ButtonBuilder().setCustomId('setup:voice_channel').setLabel('AFK Ses Kanalı').setStyle('Secondary').setEmoji('🔊'),
      new ButtonBuilder().setCustomId('setup:welcome_enabled').setLabel('Hoş Geldin Aç/Kapa').setStyle('Secondary').setEmoji('👋'),
      new ButtonBuilder().setCustomId('setup:welcome_channel').setLabel('Hoş Geldin Kanalı').setStyle('Secondary').setEmoji('📨')
    );
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:self_roles').setLabel('Rol Paneli Rolleri').setStyle('Secondary').setEmoji('🎚️'),
      new ButtonBuilder().setCustomId('setup:log_types').setLabel('Log Türleri').setStyle('Secondary').setEmoji('📜'),
      new ButtonBuilder().setCustomId('setup:ticket_staff').setLabel('Ticket Yetkilileri').setStyle('Secondary').setEmoji('👥'),
      new ButtonBuilder().setCustomId('setup:protection').setLabel('Koruma Filtresi').setStyle('Secondary').setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('setup:autopunish').setLabel('Otomatik Ceza').setStyle('Secondary').setEmoji('⚖️')
    );
    const row4 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:warnings').setLabel('Uyarı Sistemi & Boost').setStyle('Secondary').setEmoji('⚠️')
    );

    await interaction.editReply({ embeds: [embed], components: [row1, row2, row3, row4] });
  },
};
