const { SlashCommandBuilder } = require('discord.js');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { getGuildSettings, setGuildSetting } = require('../database/db');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('rol-panel')
    .setDescription('Kullanıcıların kendi rollerini alabileceği bir rol paneli gönderir.')
    .addRoleOption((o) => o.setName('rol1').setDescription('Rol 1').setRequired(false))
    .addRoleOption((o) => o.setName('rol2').setDescription('Rol 2').setRequired(false))
    .addRoleOption((o) => o.setName('rol3').setDescription('Rol 3').setRequired(false))
    .addRoleOption((o) => o.setName('rol4').setDescription('Rol 4').setRequired(false))
    .addRoleOption((o) => o.setName('rol5').setDescription('Rol 5').setRequired(false)),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }

    const guild = interaction.guild;
    const roles = [];
    for (let i = 1; i <= 5; i++) {
      const role = interaction.options.getRole(`rol${i}`);
      if (role) roles.push(role);
    }
    if (roles.length === 0) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: 'En az bir rol seçmelisiniz.' })] });
    }

    for (const role of roles) {
      if (role.position >= guild.members.me.roles.highest.position && guild.ownerId !== interaction.user.id) {
        return interaction.editReply({ embeds: [error({ title: 'Bot Hiyerarşisi', description: `${role} rolünü atayabilecek konumda değilim.` })] });
      }
    }

    setGuildSetting(guild.id, 'self_roles', JSON.stringify(roles.map((r) => r.id)));

    const select = new StringSelectMenuBuilder()
      .setCustomId('role_panel_select')
      .setPlaceholder('Almak istediğiniz rolü seçin')
      .addOptions(
        roles.map((r) => ({
          label: r.name,
          value: r.id,
          description: `${r.name} rolünü almak için seçin`,
        }))
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.channel.send({
      embeds: [
        success({
          title: '🎚️ Rol Paneli',
          description: 'Aşağıdaki menüden rol(ları) seçerek kendinize verebilirsiniz. Seçimi kaldırmak için tekrar seçin.',
        }),
      ],
      components: [row],
    });

    await interaction.editReply({ embeds: [success({ title: 'Rol Paneli Gönderildi', description: `${roles.length} rol ile panel oluşturuldu.` })] });
  },
};
