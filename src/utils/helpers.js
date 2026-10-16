const { ChannelType, PermissionsBitField } = require('discord.js');

/**
 * Sanitize filename for safe file operations
 * @param {string} str - Input string
 * @returns {string}
 */
function sanitizeFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9-_ğüşıöçĞÜŞİÖÇ]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

/**
 * Format user mention or tag
 * @param {User|GuildMember} user - User object
 * @returns {string}
 */
function formatUser(user) {
  if (!user) return 'Bilinmeyen Kullanıcı';
  return `<@${user.id}> (\`${user.tag}\`)`;
}

/**
 * Format channel mention
 * @param {Channel} channel - Channel object
 * @returns {string}
 */
function formatChannel(channel) {
  if (!channel) return 'Bilinmeyen Kanal';
  return `<#${channel.id}>`;
}

/**
 * Format role mention
 * @param {Role} role - Role object
 * @returns {string}
 */
function formatRole(role) {
  if (!role) return 'Bilinmeyen Rol';
  return `<@&${role.id}>`;
}

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncate(text, maxLength = 1024) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Parse duration string to milliseconds
 * @param {string} duration - Duration string (e.g., "1h", "30m", "1d")
 * @returns {number|null} - Milliseconds or null if invalid
 */
function parseDuration(duration) {
  if (!duration) return null;
  
  const regex = /^(\d+)([smhd])$/i;
  const match = duration.match(regex);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  
  return value * (multipliers[unit] || 0);
}

/**
 * Create permission overwrites for ticket channel
 * @param {Guild} guild - Guild
 * @param {string} userId - Ticket owner user ID
 * @param {string[]} staffRoles - Staff role IDs
 * @returns {Object[]}
 */
function createTicketOverwrites(guild, userId, staffRoles) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    }
  ];
  
  for (const roleId of staffRoles) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ManageChannels
        ]
      });
    }
  }
  
  return overwrites;
}

/**
 * Create permission overwrites for ticket participant
 * @param {Guild} guild - Guild
 * @param {string} userId - Participant user ID
 * @returns {Object}
 */
function createParticipantOverwrite(guild, userId) {
  return {
    id: userId,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.EmbedLinks
    ]
  };
}

/**
 * Remove participant overwrite from ticket channel
 * @param {Guild} guild - Guild
 * @param {string} userId - Participant user ID
 * @returns {Object}
 */
function createParticipantRemoveOverwrite(guild, userId) {
  return {
    id: userId,
    deny: [PermissionsBitField.Flags.ViewChannel]
  };
}

/**
 * Safe defer reply for interactions
 * @param {Interaction} interaction - Discord interaction
 * @param {boolean} ephemeral - Whether reply should be ephemeral
 */
async function safeDefer(interaction, ephemeral = false) {
  if (interaction.replied || interaction.deferred) return;
  try {
    await interaction.deferReply({ ephemeral });
  } catch (e) {
    // Interaction already replied or expired
  }
}

/**
 * Safe edit reply for interactions
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Edit options
 */
async function safeEdit(interaction, options) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(options);
    } else {
      await interaction.reply({ ...options, ephemeral: options.ephemeral ?? true });
    }
  } catch (e) {
    // Ignore errors (expired, etc.)
  }
}

/**
 * Safe followup for interactions
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Followup options
 */
async function safeFollowUp(interaction, options) {
  try {
    await interaction.followUp({ ...options, ephemeral: options.ephemeral ?? true });
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Generate ticket number display
 * @param {number} id - Ticket ID
 * @returns {string}
 */
function formatTicketNumber(id) {
  return `#${id.toString().padStart(4, '0')}`;
}

/**
 * Chunk array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array[]}
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise}
 */
async function retryWithBackoff(fn, maxRetries = 5, baseDelay = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === maxRetries) break;
      
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Log with timestamp and level
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Message
 * @param {Object} meta - Additional metadata
 */
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  const output = typeof meta === 'object' && Object.keys(meta).length > 0
    ? `${prefix} ${message} ${JSON.stringify(meta)}`
    : `${prefix} ${message}`;
  
  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

module.exports = {
  sanitizeFilename,
  formatUser,
  formatChannel,
  formatRole,
  truncate,
  parseDuration,
  createTicketOverwrites,
  createParticipantOverwrite,
  createParticipantRemoveOverwrite,
  safeDefer,
  safeEdit,
  safeFollowUp,
  formatTicketNumber,
  chunkArray,
  sleep,
  retryWithBackoff,
  log
};