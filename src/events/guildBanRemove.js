const { log } = require('../utils');

module.exports = {
  name: 'guildBanRemove',
  once: false,
  async execute(ban, client) {
    const guildId = ban.guild.id;
    const settings = client.db.getGuildSettings(guildId);
    if (!settings || !settings.log_types?.guildBanRemove || !settings.log_channel_id) return;

    // Fetch audit log to get moderator
    let moderator = null;
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({ type: 23, limit: 1 }); // MEMBER_BAN_REMOVE
      const entry = auditLogs.entries.first();
      if (entry && entry.target.id === ban.user.id) {
        moderator = entry.executor;
      }
    } catch (e) {
      // Ignore audit log errors
    }

    client.emit('log', guildId, 
      `🔓 **Yasak Kaldırıldı**\n**Kullanıcı:** ${ban.user.tag} (\`${ban.user.id}\`)\n**Yetkili:** ${moderator ? moderator.tag : 'Bilinmiyor'} ${moderator ? `(\`${moderator.id}\`)` : ''}`, 
      'success'
    );
  }
};