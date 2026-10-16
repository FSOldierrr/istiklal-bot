'use strict';

/**
 * İstiklal Bot — Zamanlanmış Duyuru Servisi
 * ------------------------------------------------------------------
 * Veritabanındaki zamanı gelmiş duyuruları periyodik olarak kontrol edip
 * ilgili kanala gönderir. Bot başladığında startScheduler() çağrılır.
 */

const { getDueAnnouncements, markAnnouncementSent } = require('../database/db');
const { buildAnnouncementEmbed } = require('./announcement');
const { purgeGuildWarnings } = require('./warnings');
const { log } = require('./logger');

const CHECK_INTERVAL_MS = 30 * 1000; // 30 saniye
const WARN_MAINTENANCE_MS = 6 * 60 * 60 * 1000; // 6 saat

async function processDueAnnouncements(client) {
  let due = [];
  try {
    due = getDueAnnouncements(new Date().toISOString());
  } catch (err) {
    log('error', `Zamanlanmış duyurular okunamadı: ${err.message}`);
    return 0;
  }

  let sentCount = 0;

  for (const row of due) {
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) {
        markAnnouncementSent(row.id);
        continue;
      }

      const channel =
        guild.channels.cache.get(row.channel_id) ||
        (await guild.channels.fetch(row.channel_id).catch(() => null));

      if (!channel || typeof channel.send !== 'function') {
        markAnnouncementSent(row.id);
        continue;
      }

      let payload = {};
      try {
        payload = JSON.parse(row.payload || '{}');
      } catch (_) {
        payload = {};
      }

      const author =
        !payload.hideAuthor && payload.authorId
          ? await client.users.fetch(payload.authorId).catch(() => null)
          : null;

      const embed = buildAnnouncementEmbed({
        title: payload.title,
        message: payload.message,
        color: payload.color,
        guildName: guild.name,
        author,
      });

      const content =
        payload.mention === 'everyone' ? '@everyone' : payload.mention === 'here' ? '@here' : undefined;

      await channel.send({ content, embeds: [embed] });
      markAnnouncementSent(row.id);
      sentCount++;
    } catch (err) {
      log('warn', `Zamanlanmış duyuru gönderilemedi (#${row.id}): ${err.message}`);
      // Sonsuz döngüyü önlemek için yine de gönderilmiş say
      markAnnouncementSent(row.id);
    }
  }

  return sentCount;
}

function startScheduler(client) {
  const tick = () => {
    processDueAnnouncements(client).catch((err) =>
      log('error', `Zamanlanmış duyuru döngüsü hatası: ${err.message}`)
    );
  };

  tick();
  const interval = setInterval(tick, CHECK_INTERVAL_MS);
  if (interval.unref) interval.unref();

  log('info', 'Zamanlanmış duyuru servisi başlatıldı (30 sn kontrol).');
  return interval;
}

/**
 * Süresi dolmuş (düşmüş) uyarıları periyodik olarak temizler.
 */
async function runWarningMaintenance(client) {
  let removed = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      removed += await purgeGuildWarnings(guild);
    } catch (err) {
      log('warn', `Uyarı temizliği hatası (${guild.id}): ${err.message}`);
    }
  }
  if (removed > 0) log('info', `Uyarı temizliği: ${removed} süresi dolmuş uyarı silindi.`);
  return removed;
}

function startWarningMaintenance(client) {
  const run = () =>
    runWarningMaintenance(client).catch((err) =>
      log('error', `Uyarı temizlik döngüsü hatası: ${err.message}`)
    );

  run();
  const interval = setInterval(run, WARN_MAINTENANCE_MS);
  if (interval.unref) interval.unref();

  log('info', 'Uyarı geçerlilik servisi başlatıldı (6 saatte bir temizlik).');
  return interval;
}

module.exports = { startScheduler, startWarningMaintenance, processDueAnnouncements, runWarningMaintenance };
