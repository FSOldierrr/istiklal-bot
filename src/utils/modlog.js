const { getGuildSettings } = require('../database/db');

function addModLog(db, guildId, action, targetId, moderatorId, reason) {
  db.prepare(
    'INSERT INTO moderation_logs (guild_id, action, target_id, moderator_id, reason, created_at) VALUES (?,?,?,?,?,?)'
  ).run(guildId, action, targetId, moderatorId, reason, new Date().toISOString());
}

async function sendLog(guild, embed) {
  const settings = getGuildSettings(guild.id);
  const logTypes = JSON.parse(settings.log_types || '{}');
  if (!logTypes.moderation || !settings.log_channel_id) return;
  const channel = guild.channels.cache.get(settings.log_channel_id);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { addModLog, sendLog };
