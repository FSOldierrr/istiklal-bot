const embeds = require('./embeds');
const permissions = require('./permissions');
const helpers = require('./helpers');
const transcript = require('./transcript');

module.exports = {
  ...embeds,
  ...permissions,
  ...helpers,
  transcript
};