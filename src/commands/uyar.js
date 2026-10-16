const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, warning } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { applyAutoPunish } = require('../utils/autoPunish');
const { notifySameMessage } = require('../utils/warnNotify');
const { getActiveWarningInfo } = require('../utils/warnings');

function fmtDays(days) {
  return Number.isInteger(days) ? `${days} gün` : `${days.toFixed(1)} gün`;
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('uyar')
    .setDescription('Bir üyeye uyarı verir ve kaydeder.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Uyarılacak üye').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(false)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmemiş.';

    try {
      const row = db.prepare(
        'INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?)'
      ).run(guild.id, user.id, interaction.user.id, reason, new Date().toISOString());
      addModLog(db, guild.id, 'UYARI', user.id, interaction.user.id, reason);

      // Aktif uyarı bilgisi (geçerlilik + boost durumu)
      const info = await getActiveWarningInfo(guild, user.id);

      // Otomatik ceza (mute/ban)
      let punish = { type: 'none', count: info.count };
      try {
        punish = await applyAutoPunish(guild, user.id, reason);
      } catch (err) {
        console.error('[autoPunish]', err.message);
      }

      // Tek ve aynı mesaj: önce kullanıcıya DM, sonra log kanalına
      const fields = [
        { name: '👤 Hakkında', value: `${user} \`${user.id}\``, inline: true },
        { name: '🛡️ İşlemi Yapan', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
        { name: '🔖 Uyarı No', value: `#${row.lastInsertRowid}`, inline: true },
        { name: '📊 Aktif Uyarı', value: `${info.count}`, inline: true },
        { name: '⏳ Geçerlilik', value: `${fmtDays(info.days)}${info.member && info.member.premiumSince ? ' (boost ×2)' : ''}`, inline: true },
        { name: '📝 Sebep', value: reason, inline: false },
      ];

      if (punish.type === 'mute') {
        fields.push({ name: '⚖️ Otomatik Ceza', value: `**${punish.count}** aktif uyarı → **${punish.minutes} dakika** susturma`, inline: false });
      } else if (punish.type === 'ban') {
        fields.push({ name: '⚖️ Otomatik Ceza', value: `**${punish.count}** aktif uyarı → **sunucudan yasaklama (ban)**`, inline: false });
      }

      const embed = warning({
        title: 'Uyarı Verildi',
        description: `${user} adlı üyeye **${guild.name}** sunucusunda uyarı verildi.`,
        fields,
      });

      const delivery = await notifySameMessage(interaction.client, guild, user.id, embed);

      const replyFields = [
        { name: 'Hakkında', value: `${user}`, inline: true },
        { name: 'Uyarı No', value: `#${row.lastInsertRowid}`, inline: true },
        { name: 'Aktif Uyarı', value: `${info.count}`, inline: true },
      ];
      if (punish.type === 'mute') replyFields.push({ name: 'Otomatik Ceza', value: `${punish.minutes} dk susturma`, inline: false });
      if (punish.type === 'ban') replyFields.push({ name: 'Otomatik Ceza', value: 'Ban uygulandı', inline: false });
      if (!delivery.dmOk) replyFields.push({ name: 'Not', value: 'Kullanıcının DM\'i kapalı olduğu için DM iletilemedi (log kanalına yazıldı).', inline: false });

      return interaction.editReply({
        embeds: [success({ title: 'Uyarı Kaydedildi', description: `${user.tag} uyarıldı.`, fields: replyFields })],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Uyarı kaydedilemedi: ${err.message}` })] });
    }
  },
};
