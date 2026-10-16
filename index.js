require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { log } = require('./src/utils/logger');
const { initDatabase, backupDatabase } = require('./src/database/db');
const { loadCommands } = require('./src/handlers/loadCommands');
const { loadEvents } = require('./src/handlers/loadEvents');
const { registerButtons } = require('./src/handlers/buttonHandler');
const { registerSelects } = require('./src/handlers/selectHandler');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  log('error', '.env dosyasında TOKEN tanımlı değil. Bot durduruluyor.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.User, Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
client.buttons = new Collection();
client.selectMenus = new Collection();

// Performans için gereksiz collection temizleme (sweepers)
setInterval(() => {
  client.commands.sweep(() => false);
}, 1000 * 60 * 10).unref();

// Global yakalayıcılar: botu çökertmeden hatayı raporla
process.on('unhandledRejection', (reason) => {
  log('error', `UnhandledRejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  log('error', `UncaughtException: ${err.message}`);
  console.error(err.stack);
});

async function start() {
  await initDatabase();
  loadCommands(client);
  loadEvents(client);
  registerButtons(client);
  registerSelects(client);

  // Günlük SQLite yedeği (son 7 yedek saklanır)
  backupDatabase();
  setInterval(backupDatabase, 1000 * 60 * 60 * 24).unref();
  log('info', 'Günlük yedekleme planlandı (24 saatte bir, son 7 yedek saklanır).');

  await client.login(TOKEN);
}

start().catch((err) => {
  log('error', `Bot başlatılırken kritik hata: ${err.message}`);
  process.exit(1);
});
