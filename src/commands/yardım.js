const { SlashCommandBuilder } = require('discord.js');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('discord.js');
const { info, error } = require('../utils/embeds');
const { isStaff } = require('../utils/auth');

const CATEGORIES = [
  { id: 'genel', label: 'Genel', emoji: '💬' },
  { id: 'ticket', label: 'Ticket', emoji: '🎫' },
  { id: 'moderasyon', label: 'Moderasyon', emoji: '🔨' },
  { id: 'kurulum', label: 'Kurulum', emoji: '⚙️' },
  { id: 'veri', label: 'Veri', emoji: '📥' },
  { id: 'sistem', label: 'Sistem', emoji: '⚠️' },
];

function categoryOf(command) {
  const name = command.data.name;
  if (name === 'setup' || name === 'rol-panel') return 'kurulum';
  if (name === 'ticket-panel' || name === 'ticket-kişi-ekle' || name === 'ticket-kişi-çıkar') return 'ticket';
  if (
    name === 'ban' ||
    name === 'unban' ||
    name === 'kick' ||
    name === 'timeout' ||
    name === 'timeout-kaldır' ||
    name === 'uyar' ||
    name === 'uyarılar' ||
    name === 'uyarı-sil' ||
    name === 'temizle'
  ) {
    return 'moderasyon';
  }
  if (name === 'veri-indir') return 'veri';
  if (name === 'yardım') return 'sistem';
  return 'genel';
}

function permissionOf(command) {
  if (command.data.name === 'setup') return 'Yönetici';
  if (command.ephemeral === true) return 'Yetkili';
  return 'Herkes';
}

function paramsOf(command) {
  const opts = command.data.options || [];
  if (opts.length === 0) return 'Yok';
  return opts.map((o) => `<${o.name}>${o.required ? '' : ' (isteğe bağlı)'}`).join(', ');
}

function usageOf(command) {
  const p = paramsOf(command);
  return p === 'Yok' ? `/${command.data.name}` : `/${command.data.name} ${p}`;
}

function buildFieldsForCategory(commands, categoryId) {
  const found = CATEGORIES.find((c) => c.id === categoryId);
  const label = found ? found.label : categoryId;
  const cmds = commands.filter((c) => categoryOf(c) === categoryId);
  const fields = cmds.map((c) => ({
    name: `/${c.data.name}`,
    value:
      `**Açıklama:** ${c.data.description}\n` +
      `**Parametreler:** ${paramsOf(c)}\n` +
      `**Kullanım:** ${usageOf(c)}\n` +
      `**Kimler:** ${permissionOf(c)}`,
    inline: false,
  }));
  return { label, fields };
}

module.exports = {
  data: new SlashCommandBuilder().setName('yardım').setDescription('Komut kategorili yardım menüsünü açar.'),
  async execute(interaction, client) {
    const commands = Array.from(client.commands.values());
    const { label, fields } = buildFieldsForCategory(commands, 'genel');
    const staff = isStaff(interaction.guild, interaction.member);

    const select = new StringSelectMenuBuilder()
      .setCustomId('help_category:genel')
      .setPlaceholder('Bir kategori seçin')
      .addOptions(
        CATEGORIES.map((c) => ({
          label: c.label,
          value: c.id,
          description: `${c.label} komutları`,
          emoji: c.emoji,
        }))
      );

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help:all').setLabel('Tüm Komutlar').setStyle('Secondary'),
      ...(staff
        ? [
            new ButtonBuilder()
              .setCustomId('help:admin')
              .setLabel('Yönetici Panelleri')
              .setStyle('Primary')
              .setEmoji('🛡️'),
          ]
        : []),
      new ButtonBuilder().setCustomId('help:close').setLabel('Kapat').setStyle('Danger')
    );

    const helpFields = fields.slice(0, 10);
    if (staff) {
      helpFields.push({
        name: '🛡️ Yönetici Panelleri',
        value:
          'Ticket Yetkilileri, **Koruma Filtresi (Küfür Paneli)**, **Otomatik Ceza** ve diğer gelişmiş ayarlar `/setup` panelinden yönetilir. ' +
          'Detaylı kullanım rehberi için **🛡️ Yönetici Panelleri** butonuna basın.',
        inline: false,
      });
    }

    await interaction.editReply({
      embeds: [
        info({
          title: '📚 İstiklal Yardım Menüsü',
          description: `Aşağıdan bir kategori seçerek komutları görüntüleyebilirsiniz.\n\n**${label}** kategorisinde ${fields.length} komut var.`,
          fields: helpFields,
        }),
      ],
      components: [row1, row2],
    });
  },
};
