const { log } = require('../utils');

module.exports = {
  name: 'debug',
  once: false,
  async execute(info, client) {
    // Only log important debug info
    if (info.includes('VOICE') || info.includes('AUDIO') || info.includes('SESSION')) {
      log('debug', info);
    }
  }
};