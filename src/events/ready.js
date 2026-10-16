const { ActivityType } = require('discord.js');
const { VoiceAFKManager } = require('../utils/voice');
const { getGuildSettings } = require('../database/db');
const { startScheduler, startWarningMaintenance } = require('../utils/scheduler');
/**
 * Bot durumunu (presence) günceller.
 * Discord'da durum TÜM sunucularda ortaktır; bu yüzden sunucu başına ayrı
 * sayı gösterilemez. Toplam sunucu sayısı ve toplam çevrimiçi üye sayısı yazılır.
 */
function updatePresence(client) {
  if (!client.user) return;

  const guilds = client.guilds.cache;
  let online = 0;
  for (const guild of guilds.values()) {
    online += guild.presences.cache.filter((p) => p.status && p.status !== 'offline').size;
  }

  client.user.setPresence({
    activities: [
      {
        name: `${guilds.size} sunucu • ${online} çevrimiçi`,
        type: ActivityType.Watching,
      },
    ],
    status: 'online',
  });
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`[ready] ${client.user.tag} olarak Discord'a giriş yapıldı.`);
    console.log(`[ready] ${client.guilds.cache.size} sunucuda bulunuluyor.`);

    for (const guild of client.guilds.cache.values()) {
      getGuildSettings(guild.id);
    }

    // Durum: sunucu sayısı + çevrimiçi üye sayısı (60 saniyede bir güncellenir)
    updatePresence(client);
    setInterval(() => updatePresence(client), 60 * 1000).unref();
    console.log('[ready] Bot durumu ayarlandı: sunucu + çevrimiçi üye sayısı.');

    const manager = new VoiceAFKManager(client);
    client.voiceManager = manager;
    await manager.init();

    // Zamanlanmış duyuru servisi
    startScheduler(client);

    // Uyarı geçerlilik (düşme) temizlik servisi
    startWarningMaintenance(client);

    // Mevcut boost'çuları temel al (2. boost'ta sıfırlama doğru çalışsın)
    try {
      const { initializeBoostBaseline } = require('../utils/warnings');
      const marked = initializeBoostBaseline(client);
      if (marked > 0) console.log(`[ready] ${marked} boost'çu temel alındı.`);
    } catch (err) {
      console.error('[ready] Boost temeli alınamadı:', err.message);
    }
  },
};
