const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { notifySameMessage } = require('../utils/warnNotify');

function botCanAct(me, target, guild) {
  if (guild.ownerId === me.id) return true;
  return me.roles.highest.position > target.roles.highest.position;
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('timeout-kaldır')
    .setDescription('Bir üyenin zaman aşımını kaldırır.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Zaman aşımı kaldırılacak üye').setRequired(true)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');
    const member = guild.members.cache.get(user.id);
    if (!member) {
      return interaction.editReply({ embeds: [error({ title: 'Bulunamadı', description: 'Bu üye sunucuda bulunamadı.' })] });
    }
    if (!member.isCommunicationDisabled()) {
      return interaction.editReply({ embeds: [error({ title: 'Zaman Aşımı Yok', description: 'Bu üyenin zaman aşımı aktif değil.' })] });
    }
    if (!botCanAct(guild.members.me, member, guild)) {
      return interaction.editReply({ embeds: [error({ title: 'Bot Hiyerarşisi', description: 'Bu üyenin zaman aşımını kaldırabilecek konumda değilim.' })] });
    }

    try {
      await member.timeout(null, `${interaction.user.tag} tarafından kaldırıldı`);
      addModLog(db, guild.id, 'TIMEOUT_REMOVE', user.id, interaction.user.id, 'Zaman aşımı kaldırıldı');

      // Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
      const embed = success({
        title: 'Zaman Aşımınız Kaldırıldı',
        emoji: '⏱️',
        description: `**${guild.name}** sunucusundaki sohbet kısıtlamanız kaldırıldı.`,
        fields: [
          { name: '👤 Hakkında', value: `${user} \`${user.id}\``, inline: true },
          { name: '🛡️ İşlemi Yapan', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
        ],
      });
      const delivery = await notifySameMessage(interaction.client, guild, user.id, embed);

      const replyFields = [];
      if (!delivery.dmOk) replyFields.push({ name: 'Not', value: 'Kullanıcıya DM iletilemedi (log kanalına yazıldı).', inline: false });
      return interaction.editReply({
        embeds: [success({ title: 'Kaldırıldı', description: `${user.tag} üyesinin zaman aşımı kaldırıldı.`, fields: replyFields })],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Zaman aşımı kaldırılamadı: ${err.message}` })] });
    }
  },
};
