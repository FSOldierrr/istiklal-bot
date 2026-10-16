const { PermissionFlagsBits } = require('discord.js');
const { error } = require('../utils/embeds');
const { handleButton } = require('../handlers/buttonHandler');
const { handleSelect } = require('../handlers/selectHandler');

const EPHEMERAL_COMMANDS = new Set([
  'setup',
  'ticket-panel',
  'rol-panel',
  'veri-indir',
  'yardım',
  'duyur',
  'duyur-zamanla',
  'duyur-iptal',
  'ban',
  'unban',
  'kick',
  'timeout',
  'timeout-kaldır',
  'uyar',
  'uyarı-sil',
  'uyarılar',
  'temizle',
  'ticket-kişi-ekle',
  'ticket-kişi-çıkar',
]);

// Hata ayrıntısını yalnızca yetkililere göster (normal üyeye genel mesaj).
function canSeeDetails(interaction) {
  try {
    if (!interaction.guild) return false;
    if (interaction.user && interaction.user.id === interaction.guild.ownerId) return true;
    const perms = interaction.memberPermissions;
    return Boolean(perms && perms.has(PermissionFlagsBits.Administrator));
  } catch (_) {
    return false;
  }
}

function errorReply(interaction, err, fallback) {
  const details = err && err.message ? String(err.message) : '';
  const description =
    canSeeDetails(interaction) && details
      ? `${fallback}\n\n**Teknik ayrıntı:**\n\`\`\`${details.slice(0, 300)}\`\`\``
      : fallback;
  return {
    embeds: [error({ title: 'Hata', description })],
    ephemeral: true,
  };
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const ephemeral = EPHEMERAL_COMMANDS.has(interaction.commandName) || command.ephemeral === true;
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferReply({ ephemeral });
        }
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[command:${interaction.commandName}] Hata:`, err && err.stack ? err.stack : err);
        const reply = errorReply(interaction, err, 'Komut çalıştırılırken bir hata oluştu.');
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        } catch (_) {
          /* yanıt gönderilemedi */
        }
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        await handleButton(interaction, client);
      } catch (err) {
        console.error(`[button:${interaction.customId}] Hata:`, err && err.stack ? err.stack : err);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        await handleSelect(interaction, client);
      } catch (err) {
        console.error(`[select:${interaction.customId}] Hata:`, err && err.stack ? err.stack : err);
        const reply = errorReply(interaction, err, 'Menü işlenirken bir hata oluştu.');
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        } catch (_) {
          /* yanıt gönderilemedi */
        }
      }
      return;
    }
  },
};
