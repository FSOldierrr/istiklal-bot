const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, info } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { notifySameMessage } = require('../utils/warnNotify');
const { getActiveWarningInfo } = require('../utils/warnings');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('uyarı-sil')
    .setDescription('Bir uyarı kaydını siler.')
    .addIntegerOption((o) => o.setName('uyarı-id').setDescription('Silinecek uyarının numarası').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const warningId = interaction.options.getInteger('uyarı-id');

    const row = db.prepare('SELECT * FROM warnings WHERE id = ? AND guild_id = ?').get(warningId, guild.id);
    if (!row) {
      return interaction.editReply({ embeds: [error({ title: 'Bulunamadı', description: 'Bu numaralı bir uyarı kaydı bulunamadı.' })] });
    }

    db.prepare('DELETE FROM warnings WHERE id = ?').run(warningId);
    addModLog(db, guild.id, 'UYARI_SIL', row.user_id, interaction.user.id, row.reason || '');

    // Kalan aktif uyarı sayısı
    let remaining = 0;
    try {
      const info = await getActiveWarningInfo(guild, row.user_id);
      remaining = info.count;
    } catch (_) {}

    const target = await interaction.client.users.fetch(row.user_id).catch(() => null);
    const who = target ? `${target}` : `<@${row.user_id}>`;

    const embed = info({
      title: 'Uyarı Kaldırıldı',
      emoji: '🗑️',
      description: `${who} adlı üyenin **#${warningId}** numaralı uyarısı kaldırıldı.`,
      fields: [
        { name: '👤 Hakkında', value: `${who} \`${row.user_id}\``, inline: true },
        { name: '🛡️ İşlemi Yapan', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
        { name: '🔖 Uyarı No', value: `#${warningId}`, inline: true },
        { name: '📊 Kalan Aktif Uyarı', value: `${remaining}`, inline: true },
        { name: '📝 Uyarı Sebebi', value: row.reason || 'Belirtilmemiş', inline: false },
      ],
    });

    // Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
    const delivery = await notifySameMessage(interaction.client, guild, row.user_id, embed);

    const replyFields = [
      { name: 'Hakkında', value: who, inline: true },
      { name: 'Kalan Aktif Uyarı', value: `${remaining}`, inline: true },
    ];
    if (!delivery.dmOk) replyFields.push({ name: 'Not', value: 'Kullanıcının DM\'i kapalı olduğu için DM iletilemedi (log kanalına yazıldı).', inline: false });

    return interaction.editReply({
      embeds: [success({ title: 'Uyarı Silindi', description: `#${warningId} numaralı uyarı kaydı silindi.`, fields: replyFields })],
    });
  },
};
