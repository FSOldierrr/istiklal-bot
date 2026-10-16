const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { log } = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const dbPath = path.join(DATA_DIR, 'database.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

const settingsCache = new Map();

const MIGRATIONS = [
  // v1
  `CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);`,
  // v2 - sunucu ayarları
  `CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    staff_roles TEXT DEFAULT '[]',
    ticket_category_id TEXT,
    ticket_channel_id TEXT,
    ticket_types TEXT DEFAULT '["Destek","Şikayet","Başvuru"]',
    autorole_id TEXT,
    voice_channel_id TEXT,
    welcome_enabled INTEGER DEFAULT 0,
    welcome_channel_id TEXT,
    self_roles TEXT DEFAULT '[]',
    log_types TEXT DEFAULT '{"messageDelete":1,"messageUpdate":1,"guildMemberAdd":1,"guildMemberRemove":1,"voiceStateUpdate":1,"guildMemberUpdate":1,"moderation":1,"ticket":1,"staffCommand":1}'
  );`,
  // v3 - ticketler
  `CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    claimed_by TEXT,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    transcript_message_id TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_owner_status ON tickets(owner_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);`,
  // v4 - uyarılar
  `CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);`,
  // v5 - moderasyon kayıtları
  `CREATE TABLE IF NOT EXISTS moderation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_modlogs_guild_date ON moderation_logs(guild_id, created_at);`,
  // v12 - koruma filtresi & otomatik ceza yapılandırması
  `ALTER TABLE guild_settings ADD COLUMN profanity_config TEXT;`,
  `ALTER TABLE guild_settings ADD COLUMN auto_punish_config TEXT;`,
  // v13 - ticket yetkili rolleri (ticket türüne göre)
  `CREATE TABLE IF NOT EXISTS ticket_staff_roles (
    guild_id TEXT NOT NULL,
    category TEXT NOT NULL,
    role_ids TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (guild_id, category)
  );`,
  // v14 - zamanlanmış duyurular
  `CREATE TABLE IF NOT EXISTS scheduled_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    run_at TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_announcements(sent, run_at);`,
  // v17 - uyarı geçerlilik (düşme) & boost yapılandırması
  `ALTER TABLE guild_settings ADD COLUMN warning_config TEXT;`,
  // v18 - boost takibi (üye kaç kez boost bastı)
  `CREATE TABLE IF NOT EXISTS boost_tracking (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    boost_count INTEGER NOT NULL DEFAULT 0,
    last_boost_at TEXT,
    PRIMARY KEY (guild_id, user_id)
  );`,
];

function initDatabase() {
  db.exec(MIGRATIONS[0]);
  const row = db.prepare('SELECT MAX(version) AS v FROM migrations').get();
  let current = row.v || 0;

  if (current < 1) {
    db.prepare('INSERT INTO migrations (version) VALUES (1)').run();
    current = 1;
  }

  for (let i = current + 1; i <= MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i - 1]);
    db.prepare('INSERT OR IGNORE INTO migrations (version) VALUES (?)').run(i);
    current = i;
  }

  log('info', `Veritabanı hazır: ${dbPath} (${current} migration, WAL modu)`);
  return db;
}

function getGuildSettings(guildId) {
  if (settingsCache.has(guildId)) {
    return settingsCache.get(guildId);
  }

  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);

  if (!row) {
    row = {
      guild_id: guildId,
      log_channel_id: null,
      staff_roles: '[]',
      ticket_category_id: null,
      ticket_channel_id: null,
      ticket_types: '["Destek","Şikayet","Başvuru"]',
      autorole_id: null,
      voice_channel_id: null,
      welcome_enabled: 0,
      welcome_channel_id: null,
      self_roles: '[]',
      log_types:
        '{"messageDelete":1,"messageUpdate":1,"guildMemberAdd":1,"guildMemberRemove":1,"voiceStateUpdate":1,"guildMemberUpdate":1,"moderation":1,"ticket":1,"staffCommand":1}',
    };
    db.prepare(
      `INSERT INTO guild_settings
        (guild_id, log_channel_id, staff_roles, ticket_category_id, ticket_channel_id,
         ticket_types, autorole_id, voice_channel_id, welcome_enabled, welcome_channel_id,
         self_roles, log_types)
       VALUES
        (@guild_id, @log_channel_id, @staff_roles, @ticket_category_id, @ticket_channel_id,
         @ticket_types, @autorole_id, @voice_channel_id, @welcome_enabled, @welcome_channel_id,
         @self_roles, @log_types)`
    ).run(row);
  }

  settingsCache.set(guildId, row);
  return row;
}

function setGuildSetting(guildId, key, value) {
  // Satır yoksa önce oluştur; aksi halde UPDATE sessizce 0 satır etkiler ve
  // ayar kaybolur (kanal/kategori seçimleri "kaydedildi" görünüp gitmez).
  getGuildSettings(guildId);
  db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  settingsCache.delete(guildId);
}

function nextTicketNumber(guildId) {
  const row = db
    .prepare('SELECT MAX(ticket_number) AS max FROM tickets WHERE guild_id = ?')
    .get(guildId);
  return (row.max || 0) + 1;
}

function backupDatabase() {
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `istiklal-backup-${stamp}.sqlite`);

  try {
    // better-sqlite3'nin kendi backup metodu: çalışan veritabanını bozmaz
    db.backup(backupPath);

    // Son 7 yedeği tut, eskilerini sil
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('istiklal-backup-') && f.endsWith('.sqlite'))
      .sort()
      .reverse();
    for (let i = 7; i < backups.length; i++) {
      try {
        fs.unlinkSync(path.join(backupDir, backups[i]));
      } catch (_) {}
    }

    log('info', `Günlük SQLite yedeği alındı: ${backupPath}`);
  } catch (err) {
    log('error', `SQLite yedeği alınamadı: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * JSON yapılandırma yardımcıları (guild_settings içindeki TEXT sütunlar)
 * ------------------------------------------------------------------ */

const DEFAULT_PROFANITY_CONFIG = {
  enabled: true,
  muteMinutes: 10,
  message:
    'Milli ve manevi değerlerimize yönelik saygısız ifadeler kullanmak sunucu kurallarına aykırıdır. Lütfen üslubunuza dikkat edin.',
};

const DEFAULT_AUTO_PUNISH_CONFIG = {
  enabled: true,
  banAt: 20,
  ladder: [
    { count: 3, minutes: 10 },
    { count: 5, minutes: 30 },
    { count: 10, minutes: 120 },
    { count: 15, minutes: 720 },
  ],
};

const DEFAULT_WARNING_CONFIG = {
  expiryDays: 15,
  // Üye boost'luyken uyarı geçerlilik süresi yarıya iner
  boosterHalf: true,
  // Üye bu sayıya ulaşan boost'ta uyarıları tamamen sıfırlanır
  boostClear: 2,
};

// Sütun adı sabit bir listeden gelir; SQL enjeksiyonuna kapalıdır.
const CONFIG_COLUMNS = new Set(['profanity_config', 'auto_punish_config', 'warning_config']);

function readConfigJson(guildId, column, defaults) {
  if (!CONFIG_COLUMNS.has(column)) throw new Error(`Geçersiz config sütunu: ${column}`);
  let raw = null;
  try {
    const row = db.prepare(`SELECT ${column} AS v FROM guild_settings WHERE guild_id = ?`).get(guildId);
    raw = row ? row.v : null;
  } catch (_) {
    raw = null;
  }
  let parsed = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) || {};
    } catch (_) {
      parsed = {};
    }
  }
  return { ...defaults, ...parsed };
}

function writeConfigJson(guildId, column, value) {
  if (!CONFIG_COLUMNS.has(column)) throw new Error(`Geçersiz config sütunu: ${column}`);
  getGuildSettings(guildId); // satırın var olduğundan emin ol
  db.prepare(`UPDATE guild_settings SET ${column} = ? WHERE guild_id = ?`).run(
    JSON.stringify(value),
    guildId
  );
  settingsCache.delete(guildId);
}

function getProfanityConfig(guildId) {
  return readConfigJson(guildId, 'profanity_config', DEFAULT_PROFANITY_CONFIG);
}

function setProfanityConfig(guildId, config) {
  const merged = { ...DEFAULT_PROFANITY_CONFIG, ...(config || {}) };
  writeConfigJson(guildId, 'profanity_config', merged);
  return merged;
}

function getAutoPunishConfig(guildId) {
  return readConfigJson(guildId, 'auto_punish_config', DEFAULT_AUTO_PUNISH_CONFIG);
}

function setAutoPunishConfig(guildId, config) {
  const merged = { ...DEFAULT_AUTO_PUNISH_CONFIG, ...(config || {}) };
  writeConfigJson(guildId, 'auto_punish_config', merged);
  return merged;
}

function getWarningConfig(guildId) {
  return readConfigJson(guildId, 'warning_config', DEFAULT_WARNING_CONFIG);
}

function setWarningConfig(guildId, config) {
  const merged = { ...DEFAULT_WARNING_CONFIG, ...(config || {}) };
  writeConfigJson(guildId, 'warning_config', merged);
  return merged;
}

/* ------------------------------------------------------------------ *
 * Ticket yetkili rolleri (ticket türü / kategorisine göre)
 * ------------------------------------------------------------------ */

function getTicketStaff(guildId, category) {
  if (!category) return [];
  try {
    const row = db
      .prepare('SELECT role_ids FROM ticket_staff_roles WHERE guild_id = ? AND category = ?')
      .get(guildId, category);
    if (!row || !row.role_ids) return [];
    const parsed = JSON.parse(row.role_ids);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setTicketStaff(guildId, category, roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  db.prepare(
    `INSERT INTO ticket_staff_roles (guild_id, category, role_ids)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, category) DO UPDATE SET role_ids = excluded.role_ids`
  ).run(guildId, category, JSON.stringify(ids));
  return ids;
}

function getAllTicketStaff(guildId) {
  try {
    return db
      .prepare('SELECT category, role_ids FROM ticket_staff_roles WHERE guild_id = ?')
      .all(guildId)
      .map((r) => ({ category: r.category, roleIds: JSON.parse(r.role_ids) }));
  } catch (_) {
    return ([]);
  }
}

/* ------------------------------------------------------------------ *
 * Uyarı sayımı (otomatik ceza sistemi için)
 * ------------------------------------------------------------------ */

function countWarnings(guildId, userId, sinceIso = null) {
  if (sinceIso) {
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND user_id = ? AND created_at >= ?')
      .get(guildId, userId, sinceIso);
    return row ? row.c : 0;
  }
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);
  return row ? row.c : 0;
}

function deleteUserWarnings(guildId, userId) {
  const res = db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return res.changes;
}

function deleteExpiredWarnings(guildId, userId, sinceIso) {
  const res = db
    .prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ? AND created_at < ?')
    .run(guildId, userId, sinceIso);
  return res.changes;
}

function listActiveWarnings(guildId, userId, sinceIso) {
  return db
    .prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND created_at >= ? ORDER BY id DESC')
    .all(guildId, userId, sinceIso);
}

function listWarningUserIds(guildId) {
  return db
    .prepare('SELECT DISTINCT user_id FROM warnings WHERE guild_id = ?')
    .all(guildId)
    .map((r) => r.user_id);
}

/* ------------------------------------------------------------------ *
 * Boost takibi
 * ------------------------------------------------------------------ */

function getBoostCount(guildId, userId) {
  const row = db
    .prepare('SELECT boost_count FROM boost_tracking WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);
  return row ? row.boost_count : 0;
}

function incrementBoostCount(guildId, userId) {
  db.prepare(
    `INSERT INTO boost_tracking (guild_id, user_id, boost_count, last_boost_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET
       boost_count = boost_count + 1,
       last_boost_at = excluded.last_boost_at`
  ).run(guildId, userId, new Date().toISOString());
  return getBoostCount(guildId, userId);
}

function resetBoostCount(guildId, userId) {
  db.prepare('DELETE FROM boost_tracking WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

/* ------------------------------------------------------------------ *
 * Zamanlanmış duyurular
 * ------------------------------------------------------------------ */

function addScheduledAnnouncement({ guildId, channelId, payload, runAt, createdBy }) {
  const res = db
    .prepare(
      `INSERT INTO scheduled_announcements
         (guild_id, channel_id, payload, run_at, created_by, created_at, sent)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .run(guildId, channelId, JSON.stringify(payload || {}), runAt, createdBy || null, new Date().toISOString());
  return res.lastInsertRowid;
}

function getDueAnnouncements(nowIso) {
  return db
    .prepare('SELECT * FROM scheduled_announcements WHERE sent = 0 AND run_at <= ? ORDER BY run_at ASC')
    .all(nowIso);
}

function markAnnouncementSent(id) {
  db.prepare('UPDATE scheduled_announcements SET sent = 1, sent_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
}

function listScheduledAnnouncements(guildId) {
  return db
    .prepare('SELECT * FROM scheduled_announcements WHERE guild_id = ? AND sent = 0 ORDER BY run_at ASC')
    .all(guildId);
}

function getScheduledAnnouncement(guildId, id) {
  return db
    .prepare('SELECT * FROM scheduled_announcements WHERE guild_id = ? AND id = ?')
    .get(guildId, id);
}

function deleteScheduledAnnouncement(guildId, id) {
  const res = db
    .prepare('DELETE FROM scheduled_announcements WHERE guild_id = ? AND id = ? AND sent = 0')
    .run(guildId, id);
  return res.changes > 0;
}

module.exports = {
  db,
  initDatabase,
  getGuildSettings,
  setGuildSetting,
  settingsCache,
  nextTicketNumber,
  backupDatabase,
  getProfanityConfig,
  setProfanityConfig,
  getAutoPunishConfig,
  setAutoPunishConfig,
  getWarningConfig,
  setWarningConfig,
  getTicketStaff,
  setTicketStaff,
  getAllTicketStaff,
  countWarnings,
  deleteUserWarnings,
  deleteExpiredWarnings,
  listActiveWarnings,
  listWarningUserIds,
  getBoostCount,
  incrementBoostCount,
  resetBoostCount,
  addScheduledAnnouncement,
  getDueAnnouncements,
  markAnnouncementSent,
  listScheduledAnnouncements,
  getScheduledAnnouncement,
  deleteScheduledAnnouncement,
  DEFAULT_PROFANITY_CONFIG,
  DEFAULT_AUTO_PUNISH_CONFIG,
  DEFAULT_WARNING_CONFIG,
};
