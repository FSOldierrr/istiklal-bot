'use strict';

/**
 * İstiklal Bot — Otomatik Ceza Sistemi
 * ------------------------------------------------------------------
 * Uyarı sayısı arttıkça kademeli ceza uygular.
 *  - Eşik değerlere ulaşıldığında MUTE (susturma)
 *  - banAt değerine ulaşıldığında BAN
 *
 * Varsayılan kademe (sunucudan değiştirilebilir):
 *   3 uyarı  -> 10 dk mute
 *   5 uyarı  -> 30 dk mute
 *   10 uyarı -> 2 saat mute
 *   15 uyarı -> 12 saat mute
 *   20 uyarı -> BAN
 */

const { getAutoPunishConfig } = require('../database/db');
const { getActiveWarningInfo } = require('./warnings');

/**
 * Uyarı sayısına göre otomatik ceza uygular.
 * Yalnızca AKTİF (süresi dolmamış) uyarılar sayılır.
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {string} [reason]
 * @returns {Promise<{type:'none'|'mute'|'ban', count:number, minutes?:number, days?:number, reason:string}>}
 */
async function applyAutoPunish(guild, userId, reason) {
  const result = { type: 'none', count: 0, reason: reason || 'Otomatik ceza' };
  if (!guild || !userId) return result;

  const config = getAutoPunishConfig(guild.id);
  if (config.enabled === false) return result;

  // Aktif uyarı sayısı (geçerlilik süresi + boost durumu dikkate alınır)
  const info = await getActiveWarningInfo(guild, userId);
  const count = info.count;
  result.count = count;
  result.days = info.days;

  // Üyeyi bul (yoksa ceza uygulanamaz)
  const member = info.member;
  if (!member) return result;

  const ladder = Array.isArray(config.ladder) ? config.ladder : [];
  const banAt = Number(config.banAt) || 0;

  // 1) Ban eşiği
  if (banAt > 0 && count >= banAt) {
    if (member.bannable) {
      try {
        await member.ban({ reason: `Otomatik ceza: ${count} uyarı — ${result.reason}` });
        result.type = 'ban';
      } catch (_) {
        /* yetki yoksa sessizce geç */
      }
    }
    return result;
  }

  // 2) Mute kademesi (yalnızca tam eşleşmede tetiklenir)
  const step = ladder.find((s) => Number(s.count) === count);
  if (step) {
    const minutes = Math.max(1, Number(step.minutes) || 0);
    if (member.moderatable) {
      try {
        await member.timeout(minutes * 60 * 1000, `Otomatik ceza: ${count} uyarı — ${result.reason}`);
        result.type = 'mute';
        result.minutes = minutes;
      } catch (_) {
        /* yetki yoksa sessizce geç */
      }
    }
  }

  return result;
}

module.exports = { applyAutoPunish };
