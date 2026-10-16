const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('[deploy] HATA: .env dosyasında TOKEN veya CLIENT_ID tanımlı değil.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[deploy] Uyarı: ${file} dosyasında data/execute eksik, atlanıyor.`);
  }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`[deploy] ${commands.length} komut hazırlanıyor...`);

    // 1) GLOBAL kayıt (tüm sunucular için)
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`[deploy] Global kayıt tamam: ${commands.length} komut.`);

    // 2) Bulunulan sunuculara ANINDA kayıt (global yayılımı beklemeden görünür)
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`[deploy] Sunucu kaydı tamam (GUILD_ID=${GUILD_ID}).`);
    } else {
      const guilds = await rest.get(Routes.userGuilds());
      if (Array.isArray(guilds) && guilds.length) {
        for (const guild of guilds) {
          await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: commands });
        }
        console.log(`[deploy] ${guilds.length} sunucuya anında kayıt yapıldı (komutlar hemen görünecek).`);
      } else {
        console.log('[deploy] Bot hiçbir sunucuda değil; yalnızca global kayıt yapıldı.');
      }
    }

    console.log('[deploy] Başarılı.');
  } catch (err) {
    console.error('[deploy] Komut kaydı sırasında hata oluştu:', err);
    process.exit(1);
  }
})();
