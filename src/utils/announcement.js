'use strict';

/**
 * İstiklal Bot — Duyuru Yardımcıları
 * ------------------------------------------------------------------
 * /duyur ve /duyur-zamanla komutlarının ortak kullandığı yardımcılar:
 *  - Renk çözümleme (#RRGGBB)
 *  - Zaman çözümleme ("30m", "2h", "1g" ya da "2026-01-31 15:30")
 *  - Profesyonel duyuru embed'i kurma
 */

const { EmbedBuilder } = require('discord.js');

function parseColor(input) {
  if (!input) return 0x5865f2;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(input).trim());
  if (!m) return null;
  return parseInt(m[1], 16);
}

function safeDate(y, mo, d, h, mi) {
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Zaman ifadesini Date'e çevirir.
 *  Göreli:  "10m" (dakika), "2h" (saat), "1g" (gün)
 *  Mutlak:  "2026-01-31 15:30" veya "31.01.2026 15:30" (yerel saat)
 * @returns {Date|null}
 */
function parseWhen(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;

  const rel = /^(\d+)\s*(dakika|dak|dk|saat|saattr|sa|gun|gün|g|h|m|d)$/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const mult = {
      dk: 60000,
      dak: 60000,
      dakika: 60000,
      m: 60000,
      sa: 3600000,
      saat: 3600000,
      saattr: 3600000,
      h: 3600000,
      g: 86400000,
      gun: 86400000,
      'gün': 86400000,
      d: 86400000,
    }[unit];
    if (!mult) return null;
    return new Date(Date.now() + n * mult);
  }

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ t](\d{1,2}):(\d{2})$/.exec(s);
  if (m) return safeDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));

  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})[ t](\d{1,2}):(\d{2})$/.exec(s);
  if (m) return safeDate(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4]), Number(m[5]));

  return null;
}

function buildAnnouncementEmbed({ title, message, color, author, guildName }) {
  const embed = new EmbedBuilder()
    .setColor(typeof color === 'number' ? color : 0x5865f2)
    .setTitle(title || 'Duyuru')
    .setDescription(message || '')
    .setTimestamp()
    .setFooter({ text: `${guildName || ''} • Duyuru` });

  if (author) {
    embed.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL({ size: 128 }) });
  }
  return embed;
}

module.exports = { parseColor, parseWhen, buildAnnouncementEmbed };
