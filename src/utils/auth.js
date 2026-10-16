const { PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('../database/db');

function isStaff(guild, member) {
  if (!guild || !member) return false;
  if (member.id === guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const settings = getGuildSettings(guild.id);
  const staffRoles = JSON.parse(settings.staff_roles || '[]');
  if (staffRoles.length === 0) return false;

  return member.roles.cache.some((role) => staffRoles.includes(role.id));
}

function requireStaff(interaction) {
  if (!isStaff(interaction.guild, interaction.member)) {
    return false;
  }
  return true;
}

module.exports = { isStaff, requireStaff };
