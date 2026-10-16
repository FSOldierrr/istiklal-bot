const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');

function parseColor(input) {
  if (!input) return 0x5865f2;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(input).trim());
  if (!m) return null;
  return parseInt(m[1], 16);
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('duyur')
    .setDescription('Profesyonel bir duyuru gönderir.')
    .addChannelOption((o) =>
      o
        .setName('kanal')
        .setDescription('Duyurunun gönderileceği kanal')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((o) => o.setName('başlık').setDescription('Duyuru başlığı').setMaxLength(256).setRequired(true))
    .addStringOption((o) =>
      o.setName('mesaj').setDescription('Duyuru içeriği (Markdown destekler)').setMaxLength(4000).setRequired(true)
    )
    .addBooleanOption((o) =>
      o.setName('yazarı-gizle').setDescription('Duyuruyu gönderen yetkilinin adı gizlensin mi?')
    )
    .addStringOption((o) =>
      o
        .setName('etiket')
        .setDescription('Duyuruyla birlikte etiketlenecek kitle')
        .addChoices(
          { name: 'Kimse', value: 'none' },
          { name: '@here', value: 'here' },
          { name: '@everyone', value: 'everyone' }
        )
    )
    .addStringOption((o) => o.setName('renk').setDescription('Embed rengi, ör. #5865F2')),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu komutu sadece yetkililer kullanabilir.' })],
      });
    }

    const channel = interaction.options.getChannel('kanal');
    const title = interaction.options.getString('başlık');
    const body = interaction.options.getString('mesaj');
    const hideAuthor = interaction.options.getBoolean('yazarı-gizle') || false;
    const mention = interaction.options.getString('etiket') || 'none';
    const colorInput = interaction.options.getString('renk');

    const color = parseColor(colorInput);
    if (color === null) {
      return interaction.editReply({
        embeds: [error({ title: 'Geçersiz Renk', description: 'Renk `#RRGGBB` biçiminde olmalı. Örnek: `#5865F2`' })],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(body)
      .setTimestamp()
      .setFooter({ text: `${interaction.guild.name} • Duyuru` });

    if (!hideAuthor) {
      embed.setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL({ size: 128 }),
      });
    }

    const content = mention === 'everyone' ? '@everyone' : mention === 'here' ? '@here' : undefined;

    try {
      await channel.send({ content, embeds: [embed] });
    } catch (err) {
      return interaction.editReply({
        embeds: [error({ title: 'Gönderilemedi', description: `Duyuru gönderilemedi: ${err.message}` })],
      });
    }

    return interaction.editReply({
      embeds: [success({ title: 'Duyuru Gönderildi', description: `Duyuru ${channel} kanalına gönderildi.` })],
    });
  },
};
