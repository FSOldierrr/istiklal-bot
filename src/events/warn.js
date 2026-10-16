const { log } = require('../utils');

module.exports = {
  name: 'warn',
  once: false,
  async execute(info, client) {
    log('warn', 'Discord.js uyarı', { info: info.message || info });
  }
};