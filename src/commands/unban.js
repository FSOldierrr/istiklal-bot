const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { db } = require('../database/db');
const { addModLog } = require('../utils/modlog');
const { notifySameMessage } = require('../utils/warnNotify');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Bir üyenin yasaklamasını kaldırır.')
    .addUserOption((o) => o.setName('kullanıcı').setDescription('Yasaklaması kaldırılacak üye').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Kaldırma sebebi').setRequired(false)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }
    const guild = interaction.guild;
    const user = interaction.options.getUser('kullanıcı');
    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmemiş.';

    try {
      await guild.members.unban(user.id, `${interaction.user.tag} tarafından: ${reason}`);
      addModLog(db, guild.id, 'UNBAN', user.id, interaction.user.id, reason);

      // Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
      const embed = success({
        title: 'Yasağınız Kaldırıldı',
        emoji: '🔓',
        description: `**${guild.name}** sunucusundaki yasağınız kaldırıldı.`,
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
        embeds: [success({ title: 'Yasak Kaldırıldı', description: `${user.tag} adlı üyenin yasaklaması kaldırıldı.`, fields: replyFields })],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Yasak kaldırılamadı: ${err.message}` })] });
    }
  },
};
