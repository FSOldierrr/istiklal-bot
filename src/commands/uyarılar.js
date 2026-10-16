const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { info, error } = require('../utils/embeds');
const { getWarningConfig, listActiveWarnings, db } = require('../database/db');
const { effectiveExpiryDays, sinceIso, resolveMember } = require('../utils/warnings');

function fmtDays(days) {
  return Number.isInteger(days) ? `${days} gün` : `${days.toFixed(1)} gün`;
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('uyarılar')
    .setDescription('Bir üyenin aktif (geçerli) uyarılarını listeler.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Üye').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');

    const cfg = getWarningConfig(guild.id);
    const member = await resolveMember(guild, user.id);
    const days = effectiveExpiryDays(cfg, member);
    const since = sinceIso(days);

    const activeRows = listActiveWarnings(guild.id, user.id, since);
    const totalRow = db
      .prepare('SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND user_id = ?')
      .get(guild.id, user.id);
    const totalAll = totalRow ? totalRow.c : 0;
    const expiredCount = Math.max(0, totalAll - activeRows.length);

    const boostNote = member && member.premiumSince ? ' (boost ×2 → süre yarıya)' : '';
    const fields = activeRows.slice(0, 20).map((r) => ({
      name: `#${r.id} — ${new Date(r.created_at).toLocaleString('tr-TR')}`,
      value: `Yetkili: <@${r.moderator_id}>\nSebep: ${r.reason || 'Belirtilmemiş'}`,
      inline: false,
    }));

    return interaction.editReply({
      embeds: [
        info({
          title: `⚠️ ${user.tag} — Uyarılar`,
          description:
            `**Aktif uyarı:** ${activeRows.length}\n` +
            `**Geçerlilik süresi:** ${fmtDays(days)}${boostNote}\n` +
            (expiredCount > 0 ? `**Süresi dolmuş (düşmüş):** ${expiredCount}\n` : ''),
          fields: fields.length ? fields : [{ name: 'Yok', value: 'Aktif uyarı bulunamadı.', inline: false }],
        }),
      ],
    });
  },
};
