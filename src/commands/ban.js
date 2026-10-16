const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { notifySameMessage } = require('../utils/warnNotify');

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
    .setName('ban')
    .setDescription('Bir üyeyi sunucudan yasaklar.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Yasaklanacak üye').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Yasaklama sebebi').setRequired(false)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmemiş.';
    const member = guild.members.cache.get(user.id);

    if (member) {
      if (!canAct(interaction.member, member, guild)) {
        return interaction.editReply({ embeds: [error({ title: 'Hiyerarşi', description: 'Bu üyeye işlem yapamazsınız.' })] });
      }
      if (!botCanAct(guild.members.me, member, guild)) {
        return interaction.editReply({ embeds: [error({ title: 'Bot Hiyerarşisi', description: 'Bu üyeyi yasaklayabilecek konumda değilim.' })] });
      }
    }

    try {
      await guild.members.ban(user.id, { reason: `${interaction.user.tag} tarafından: ${reason}` });
      addModLog(db, guild.id, 'BAN', user.id, interaction.user.id, reason);

      // Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
      const embed = error({
        title: 'Sunucudan Yasaklandınız',
        emoji: '🔨',
        description: `**${guild.name}** sunucusundan yasaklandınız.`,
        fields: [
          { name: '👤 Hakkında', value: `${user} \`${user.id}\``, inline: true },
          { name: '🛡️ İşlemi Yapan', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
          { name: '📝 Sebep', value: reason, inline: false },
        ],
      });
      const delivery = await notifySameMessage(interaction.client, guild, user.id, embed);

      const replyFields = [{ name: 'Sebep', value: reason, inline: false }];
      if (!delivery.dmOk) replyFields.push({ name: 'Not', value: 'Kullanıcıya DM iletilemedi (log kanalına yazıldı).', inline: false });
      return interaction.editReply({
        embeds: [success({ title: 'Yasaklandı', description: `${user.tag} sunucudan yasaklandı.`, fields: replyFields })],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Yasaklama başarısız: ${err.message}` })] });
    }
  },
};
