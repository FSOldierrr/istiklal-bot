const { log } = require('../utils');

module.exports = {
  name: 'guildBanAdd',
  once: false,
  async execute(ban, client) {
    const guildId = ban.guild.id;
    const settings = client.db.getGuildSettings(guildId);
    if (!settings || !settings.log_types?.guildBanAdd || !settings.log_channel_id) return;

    // Fetch audit log to get moderator
    let moderator = null;
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 }); // MEMBER_BAN_ADD
      const entry = auditLogs.entries.first();
      if (entry && entry.target.id === ban.user.id) {
        moderator = entry.executor;
      }
    } catch (e) {
      // Ignore audit log errors
    }

    client.emit('log', guildId, 
      `🔨 **Kullanıcı Yasaklandı**\n**Kullanıcı:** ${ban.user.tag} (\`${ban.user.id}\`)\n**Yetkili:** ${moderator ? moderator.tag : 'Bilinmiyor'} ${moderator ? `(\`${moderator.id}\`)` : ''}\n**Sebep:** ${ban.reason || 'Belirtilmemiş'}`, 
      'error'
    );
  }
};