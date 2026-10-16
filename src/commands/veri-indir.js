const { SlashCommandBuilder } = require('discord.js');
const { requireStaff } = require('../utils/auth');
const { success, error, warning } = require('../utils/embeds');
const { getGuildSettings, db, settingsCache } = require('../database/db');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CSV_DIR = path.join(DATA_DIR, 'csv');

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function exportTableToCsv(tableName) {
  const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
  if (rows.length === 0) return `${tableName}\n`;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName('veri-indir')
    .setDescription('Veritabanı yedeği ve CSV tablolarını özel olarak gönderir.'),
  async execute(interaction) {
    if (!requireStaff(interaction)) {
      return interaction.editReply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer bu komutu kullanabilir.' })] });
    }

    fs.mkdirSync(CSV_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbCopy = path.join(DATA_DIR, `backup-veri-indir-${stamp}.sqlite`);

    try {
      // better-sqlite3'nin kendi yedekleme metodu: WAL modunda bile tutarlı kopya üretir
      await db.backup(dbCopy);
    } catch (err) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: `Veritabanı yedeklenemedi: ${err.message}` })] });
    }

    const files = [
      { attachment: dbCopy, name: `veritabani-${stamp}.sqlite` },
    ];

    const tables = ['tickets', 'warnings', 'moderation_logs'];
    for (const table of tables) {
      try {
        const csv = exportTableToCsv(table);
        const csvPath = path.join(CSV_DIR, `${table}-${stamp}.csv`);
        fs.writeFileSync(csvPath, csv, 'utf8');
        files.push({ attachment: csvPath, name: `${table}.csv` });
      } catch (err) {
        console.error(`[veri-indir] CSV hata (${table}):`, err);
      }
    }

    const MAX_TOTAL = 24 * 1024 * 1024; // 24 MB güvenlik marjı
    let totalSize = 0;
    const safeFiles = [];
    const skipped = [];
    for (const file of files) {
      try {
        const stat = fs.statSync(file.attachment);
        totalSize += stat.size;
        if (totalSize > MAX_TOTAL) {
          skipped.push(file.name);
          try { fs.unlinkSync(file.attachment); } catch (_) {}
          continue;
        }
        safeFiles.push(file);
      } catch (_) {
        skipped.push(file.name);
      }
    }

    if (safeFiles.length === 0) {
      return interaction.editReply({ embeds: [error({ title: 'Hata', description: 'Gönderilecek dosya bulunamadı.' })] });
    }

    const embed = skipped.length
      ? warning({
          title: '📥 Veri İndirme',
          description: `Dosyalar hazır. Aşağıdaki dosyalar boyut sınırı nedeniyle atlandı: ${skipped.join(', ')}`,
        })
      : success({ title: '📥 Veri İndirme', description: 'Tüm dosyalar başarıyla hazırlandı.' });

    await interaction.editReply({ embeds: [embed], files: safeFiles });

    // Geçici dosyaları temizle
    for (const file of safeFiles) {
      try { fs.unlinkSync(file.attachment); } catch (_) {}
    }
  },
};
