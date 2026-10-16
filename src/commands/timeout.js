const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { notifySameMessage } = require('../utils/warnNotify');

function parseDuration(text) {
  const match = /^(\d+)([smhd])$/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  const ms = amount * mult;
  if (ms > 2419200000) return null;
  return ms;
}

function canAct(moderator, target, guild) {
  if (moderator.id === guild.ownerId) return true;
  return target.roles.highest.position < moderator.roles.highest.position;
}

function botCanAct(me, target, guild) {
  if (guild.ownerId === me.id) return true;
  return me.roles.highest.position > target.roles.highest.position;
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Bir üyenin sohbet erişimini sınırlar (zaman aşımı).')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Zaman aşımına alınacak üye').setRequired(true))
    .addStringOption((o) => o.setName('süre').setDescription('Süre (ör. 10m, 1h, 1d)').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Sebep').setRequired(false)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu komutu sadece yetkililer kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');
    const durationText = interaction.options.getString('süre');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmemiş.';
    const ms = parseDuration(durationText);
    if (!ms) {
      return interaction.editReply({ embeds: [error({ title: 'Geçersiz Süre', description: 'Geçerli bir süre girin. Örnek: 10m, 1h, 1d. Maksimum 28 gün.' })] });
    }
    const member = guild.members.cache.get(user.id);
    if (!member) {
      return interaction.editReply({ embeds: [error({ title: 'Bulunamadı', description: 'Bu üye sunucuda bulunamadı.' })] });
    }
    if (!canAct(interaction.member, member, guild)) {
      return interaction.editReply({ embeds: [error({ title: 'Hiyerarşi', description: 'Bu üye işlem yapamazsınız.' })] });
    }
    if (!botCanAct(guild.members.me, member, guild)) {
      return interaction.editReply({ embeds: [error({ title: 'Bot Hiyerarşisi', description: 'Bu üyenin zaman aşımını ayarlayabilecek konumda değilim.' })] });
    }
    try {
      await member.timeout(ms, `${interaction.user.tag} tarafından: ${reason}`);
      addModLog(db, guild.id, 'TIMEOUT', user.id, interaction.user.id, `${reason} (${durationText})`);

      // Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
      const embed = error({
        title: 'Zaman Aşımı Uygulandı',
        emoji: '⏱️',
        description: `**${guild.name}** sunucusunda sohbet erişiminiz kısıtlandı.`,
        fields: [
          { name: '👤 Hakkında', value: `${user} \`${user.id}\``, inline: true },
          { name: '⏳ Süre', value: durationText, inline: true },
          { name: '🛡️ İşlemi Yapan', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
          { name: '📝 Sebep', value: reason, inline: false },
        ],
      });
      const delivery = await notifySameMessage(interaction.client, guild, user.id, embed);

      const replyFields = [{ name: 'Süre', value: durationText, inline: true }];
      if (!delivery.dmOk) replyFields.push({ name: 'Not', value: 'Kullanıcıya DM iletilemedi (log kanalına yazıldı).', inline: false });
      return interaction.editReply({
        embeds: [success({ title: 'Zaman Aşımı', description: `${user.tag} üyesi ${durationText} süreyle zaman aşımına alındı.`, fields: replyFields })],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Zaman aşımı uygulanamadı: ${err.message}` })] });
    }
  },
};
