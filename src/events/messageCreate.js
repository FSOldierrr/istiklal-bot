const { applyProtection } = require('../utils/profanity');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // DM'leri, bot mesajlarını ve sistem mesajlarını atla
    if (!message.guild) return;
    if (message.author?.bot || message.system) return;

    await applyProtection(message, client);
  },
};
