const { EmbedBuilder } = require('discord.js');

const COLORS = {
  success: 0x2ecc71,
  error: 0xe74c3c,
  info: 0x3498db,
  warning: 0xf1c40f,
};

const EMOJI = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

function baseEmbed(type, options = {}) {
  const {
    title = '',
    description = '',
    fields = [],
    footer = true,
    timestamp = true,
    // Başlık öncesi emojiyi özelleştir. `false` verilirse emoji eklenmez.
    emoji = undefined,
  } = options;

  const embed = new EmbedBuilder().setColor(COLORS[type] || COLORS.info);

  // Not: discord.js, boş description/title gönderildiğinde hata fırlatır.
  // Bu yüzden yalnızca doluysa ekliyoruz.
  if (title) {
    const prefix = emoji === false ? '' : emoji || EMOJI[type] || '';
    embed.setTitle(`${prefix} ${title}`.trim());
  }
  if (description) {
    embed.setDescription(description);
  }
  if (Array.isArray(fields) && fields.length > 0) {
    embed.addFields(fields);
  }
  if (footer) {
    embed.setFooter({ text: 'İstiklal Bot • Sistem' });
  }
  if (timestamp) {
    embed.setTimestamp();
  }
  return embed;
}

function success(options) {
  return baseEmbed('success', options);
}

function error(options) {
  return baseEmbed('error', options);
}

function info(options) {
  return baseEmbed('info', options);
}

function warning(options) {
  return baseEmbed('warning', options);
}

module.exports = {
  embed: baseEmbed,
  success,
  error,
  info,
  warning,
  COLORS,
  EMOJI,
};
