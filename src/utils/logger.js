const LEVEL_LABELS = {
  info: 'BİLGİ',
  warn: 'UYARI',
  error: 'HATA',
  debug: 'HATAYLA',
};

function nowTr() {
  return new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

function log(level, message) {
  const label = LEVEL_LABELS[level] || level.toUpperCase();
  console.log(`[${nowTr()}] [${label}] ${message}`);
}

module.exports = { log };
