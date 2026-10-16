const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  let count = 0;
  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      count += 1;
    } else {
      console.warn(`[handler] Komut atlandı (eksik data/execute): ${file}`);
    }
  }
  console.log(`[handler] ${count} komut dosyası yüklendi.`);
}

module.exports = { loadCommands };
