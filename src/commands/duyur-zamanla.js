const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error } = require('../utils/embeds');
const { addScheduledAnnouncement } = require('../database/db');
const { parseColor, parseWhen } = require('../utils/announcement');

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('duyur-zamanla')
    .setDescription('Belirtilen zamanda otomatik gönderilecek bir duyuru planlar.')
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
    .addStringOption((o) =>
      o
        .setName('zaman')
        .setDescription('Ne zaman? Örnek: 30m (30 dk sonra), 2h (2 saat sonra), 1g (1 gün sonra), 2026-01-31 15:30')
        .setRequired(true)
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
    const whenInput = interaction.options.getString('zaman');
    const hideAuthor = interaction.options.getBoolean('yazarı-gizle') || false;
    const mention = interaction.options.getString('etiket') || 'none';
    const colorInput = interaction.options.getString('renk');

    const color = parseColor(colorInput);
    if (color === null) {
      return interaction.editReply({
        embeds: [error({ title: 'Geçersiz Renk', description: 'Renk `#RRGGBB` biçiminde olmalı. Örnek: `#5865F2`' })],
      });
    }

    const when = parseWhen(whenInput);
    if (!when) {
      return interaction.editReply({
        embeds: [
          error({
            title: 'Geçersiz Zaman',
            description:
              'Zamanı anlayamadım. Örnekler: `30m`, `2h`, `1g` ya da `2026-01-31 15:30` / `31.01.2026 15:30`.',
          }),
        ],
      });
    }

    if (when.getTime() < Date.now() - 60 * 1000) {
      return interaction.editReply({
        embeds: [error({ title: 'Geçmiş Zaman', description: 'Gelecekte bir zaman belirtmelisiniz.' })],
      });
    }

    const id = addScheduledAnnouncement({
      guildId: interaction.guild.id,
      channelId: channel.id,
      payload: {
        title,
        message: body,
        color,
        mention,
        hideAuthor,
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
      },
      runAt: when.toISOString(),
      createdBy: interaction.user.id,
    });

    return interaction.editReply({
      embeds: [
        success({
          title: '⏰ Duyuru Zamanlandı',
          description: `Duyuru <#${channel.id}> kanalına gönderilecek.`,
          fields: [
            { name: 'Numara', value: `#${id}`, inline: true },
            { name: 'Zaman', value: `<t:${Math.floor(when.getTime() / 1000)}:F> (<t:${Math.floor(when.getTime() / 1000)}:R>)`, inline: true },
            { name: 'Başlık', value: title, inline: false },
          ],
        }),
      ],
    });
  },
};
