const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, info } = require('../utils/embeds');
const { listScheduledAnnouncements, getScheduledAnnouncement, deleteScheduledAnnouncement } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('duyur-iptal')
    .setDescription('Zamanlanmış duyuruları listeler veya iptal eder.')
    .addIntegerOption((o) =>
      o
        .setName('no')
        .setDescription('İptal edilecek duyuru numarası (boş bırakılırsa yalnızca listeler)')
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu komutu sadece yetkililer kullanabilir.' })],
      });
    }

    const guild = interaction.guild;
    const no = interaction.options.getInteger('no');

    // Numara verilmediyse listele
    if (no === null || no === undefined) {
      const list = listScheduledAnnouncements(guild.id);
      if (!list.length) {
        return interaction.editReply({
          embeds: [info({ title: '⏰ Zamanlanmış Duyuru Yok', description: 'Planlanmış bir duyuru bulunmuyor.' })],
        });
      }

      const fields = list.map((row) => {
        let title = 'Duyuru';
        try {
          title = JSON.parse(row.payload || '{}').title || 'Duyuru';
        } catch (_) {}
        return {
          name: `#${row.id} — ${title}`,
          value: `Kanal: <#${row.channel_id}>\nZaman: <t:${Math.floor(new Date(row.run_at).getTime() / 1000)}:F>`,
          inline: false,
        };
      });

      return interaction.editReply({
        embeds: [info({ title: '⏰ Zamanlanmış Duyurular', fields: fields.slice(0, 25) })],
      });
    }

    // Numara verildiyse iptal et
    const row = getScheduledAnnouncement(guild.id, no);
    if (!row) {
      return interaction.editReply({
        embeds: [error({ title: 'Bulunamadı', description: `#${no} numaralı bir duyuru yok.` })],
      });
    }
    if (row.sent) {
      return interaction.editReply({
        embeds: [error({ title: 'Zaten Gönderildi', description: `#${no} numaralı duyuru zaten gönderilmiş.` })],
      });
    }

    const removed = deleteScheduledAnnouncement(guild.id, no);
    if (!removed) {
      return interaction.editReply({
        embeds: [error({ title: 'İptal Edilemedi', description: 'Duyuru iptal edilirken bir sorun oluştu.' })],
      });
    }

    return interaction.editReply({
      embeds: [success({ title: '🗑️ Duyuru İptal Edildi', description: `#${no} numaralı zamanlanmış duyuru iptal edildi.` })],
    });
  },
};
