const { getGuildSettings, getWarningConfig, incrementBoostCount } = require('../database/db');
const { info, success } = require('../utils/embeds');
const { clearWarningsForBoost } = require('../utils/warnings');
const { notifySameMessage } = require('../utils/warnNotify');
const { log } = require('../utils/logger');

/**
 * Üye sunucuya boost basmaya başladığında çalışır.
 * Boost sayısı temizleme eşiğine ulaştıysa tüm uyarıları sıfırlanır ve
 * aynı mesaj kullanıcıya DM + log kanalına gönderilir.
 */
async function handleBoostStart(member, client) {
  const guild = member.guild;
  try {
    const cfg = getWarningConfig(guild.id);
    const count = incrementBoostCount(guild.id, member.user.id);
    const clearAt = Number(cfg.boostClear) > 0 ? Number(cfg.boostClear) : 2;

    if (count >= clearAt) {
      const cleared = clearWarningsForBoost(guild.id, member.user.id);

      const embed = success({
        title: 'Boost Ayrıcalığı — Uyarılar Sıfırlandı',
        emoji: '🚀',
        description: `${member} sunucuya **${count}.** boost'unu bastı. Bu ayrıcalıkla tüm uyarıları sıfırlandı.`,
        fields: [
          { name: '👤 Hakkında', value: `${member.user} \`${member.user.id}\``, inline: true },
          { name: '📈 Boost Sayısı', value: `${count}`, inline: true },
          { name: '🧹 Sıfırlanan Uyarı', value: `${cleared}`, inline: true },
        ],
      });

      await notifySameMessage(client, guild, member.user.id, embed);
    }
  } catch (err) {
    log('warn', `Boost işlemi hatası: ${err.message}`);
  }
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    // --- 1) Boost algılama (log ayarından bağımsız çalışır) ---
    const wasBoosting = Boolean(oldMember.premiumSince);
    const isBoosting = Boolean(newMember.premiumSince);
    if (!wasBoosting && isBoosting) {
      await handleBoostStart(newMember, client);
    }

    // --- 2) Rol değişikliği logu ---
    const settings = getGuildSettings(newMember.guild.id);
    const logTypes = JSON.parse(settings.log_types || '{}');
    if (!logTypes.guildMemberUpdate || !settings.log_channel_id) return;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());
    const added = [...newRoles].filter((r) => !oldRoles.has(r));
    const removed = [...oldRoles].filter((r) => !newRoles.has(r));
    if (added.length === 0 && removed.length === 0) return;

    const logChannel = newMember.guild.channels.cache.get(settings.log_channel_id);
    if (!logChannel) return;

    const fields = [];
    if (added.length) fields.push({ name: 'Eklenen Roller', value: added.map((r) => `<@&${r}>`).join(', ') });
    if (removed.length) fields.push({ name: 'Kaldırılan Roller', value: removed.map((r) => `<@&${r}>`).join(', ') });

    await logChannel
      .send({
        embeds: [
          info({
            title: '🎭 Rol Değişikliği',
            description: `${newMember.user.tag} üyesinin rolleri güncellendi.`,
            fields,
          }),
        ],
      })
      .catch(() => {});
  },
};
