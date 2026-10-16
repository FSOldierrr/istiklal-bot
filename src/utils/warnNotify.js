'use strict';

/**
 * İstiklal Bot — Uyarı Bildirim Yardımcısı
 * ------------------------------------------------------------------
 * Kural: Bir uyarı işleminde kullanıcıya gönderilen mesajın AYNISI,
 * sunucunun belirlenen log kanalına da gönderilir.
 *
 * notifySameMessage(): aynı embed'i önce kullanıcıya DM, sonra log
 * kanalına gönderir. Log kanalı ayarlı değilse yalnızca DM gider.
 */

const { getGuildSettings } = require('../database/db');
const { log } = require('./logger');

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {import('discord.js').EmbedBuilder} embed
 * @returns {Promise<{dmOk:boolean, logged:boolean}>}
 */
async function notifySameMessage(client, guild, userId, embed) {
  const result = { dmOk: false, logged: false };

  // 1) Kullanıcıya DM
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
    result.dmOk = true;
  } catch (_) {
    // DM kapalı olabilir; loglama yine de yapılır
  }

  // 2) Belirlenen log kanalı (aynı mesaj)
  try {
    const settings = getGuildSettings(guild.id);
    if (settings.log_channel_id) {
      const channel =
        guild.channels.cache.get(settings.log_channel_id) ||
        (await guild.channels.fetch(settings.log_channel_id).catch(() => null));
      if (channel && typeof channel.send === 'function') {
        await channel.send({ embeds: [embed] });
        result.logged = true;
      }
    }
  } catch (err) {
    log('warn', `Uyarı log kanalına gönderilemedi: ${err.message}`);
  }

  return result;
}

module.exports = { notifySameMessage };
