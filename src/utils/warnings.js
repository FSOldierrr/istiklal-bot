'use strict';

/**
 * İstiklal Bot — Uyarı Geçerlilik (Düşme) Sistemi
 * ------------------------------------------------------------------
 * • Uyarılar varsayılan olarak 15 gün sonra "düşer" (artık sayılmaz).
 * • Üye boost'luysa (premiumSince) süre yarıya iner (7.5 gün) — dinamik.
 * • Üye belirlenen boost sayısına ulaşınca (varsayılan 2) tüm uyarıları
 *   sıfırlanır.
 *
 * "Aktif uyarı" = created_at >= (şimdi - geçerlilik günü) olan kayıtlar.
 * Otomatik ceza ve /uyarılar bu aktif sayıyı kullanır.
 */

const {
  getWarningConfig,
  countWarnings,
  deleteUserWarnings,
  deleteExpiredWarnings,
  listWarningUserIds,
  getBoostCount,
  incrementBoostCount,
} = require('../database/db');

function toDays(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Üyenin boost durumuna göre geçerlilik süresini (gün) döner. */
function effectiveExpiryDays(cfg, member) {
  const base = toDays(cfg && cfg.expiryDays, 15);
  if (cfg && cfg.boosterHalf && member && member.premiumSince) {
    return base / 2;
  }
  return base;
}

/** Verilen gün sayısı kadar öncesinin ISO zaman damgası. */
function sinceIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function resolveMember(guild, userId) {
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

/**
 * Üyenin AKTİF uyarı bilgisi.
 * @returns {Promise<{count:number, days:number, member:object|null, cfg:object}>}
 */
async function getActiveWarningInfo(guild, userId) {
  const cfg = getWarningConfig(guild.id);
  const member = await resolveMember(guild, userId);
  const days = effectiveExpiryDays(cfg, member);
  const count = countWarnings(guild.id, userId, sinceIso(days));
  return { count, days, member, cfg };
}

/**
 * Belirli bir üyenin süresi geçmiş uyarılarını siler.
 */
function purgeUserWarnings(guild, userId, days) {
  return deleteExpiredWarnings(guild.id, userId, sinceIso(days));
}

/**
 * Sunucudaki tüm süresi geçmiş uyarıları temizler.
 * @returns {Promise<number>} silinen kayıt sayısı
 */
async function purgeGuildWarnings(guild) {
  const ids = listWarningUserIds(guild.id);
  let removed = 0;
  for (const userId of ids) {
    try {
      const info = await getActiveWarningInfo(guild, userId);
      removed += purgeUserWarnings(guild, userId, info.days);
    } catch (_) {
      // tek bir üye hata verirse diğerlerini etkilemesin
    }
  }
  return removed;
}

/**
 * Boost sayısı sıfırlama eşiğine ulaştıysa üyenin tüm uyarılarını siler.
 * @returns {number} silinen uyarı sayısı
 */
function clearWarningsForBoost(guildId, userId) {
  return deleteUserWarnings(guildId, userId);
}

/**
 * Bot açılışında, hâlihazırda boost basan üyeleri en az 1 boost olarak
 * işaretler. Böylece bot açıldıktan sonra bastıkları boost doğru şekilde
 * "2. boost" sayılır ve uyarıları sıfırlanır.
 * @returns {number} işaretlenen üye sayısı
 */
function initializeBoostBaseline(client) {
  let marked = 0;
  for (const guild of client.guilds.cache.values()) {
    for (const member of guild.members.cache.values()) {
      try {
        if (member.premiumSince && getBoostCount(guild.id, member.id) === 0) {
          incrementBoostCount(guild.id, member.id);
          marked++;
        }
      } catch (_) {
        // tek üye hata verirse devam et
      }
    }
  }
  return marked;
}

module.exports = {
  effectiveExpiryDays,
  sinceIso,
  resolveMember,
  getActiveWarningInfo,
  purgeUserWarnings,
  purgeGuildWarnings,
  clearWarningsForBoost,
  initializeBoostBaseline,
};
