const fs = require('fs');
const path = require('path');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
  let count = 0;
  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (!event.name || !event.execute) {
      console.warn(`[handler] Event atlandı (eksik name/execute): ${file}`);
      continue;
    }
    // Olay hataları yakalanmazsa "unhandledRejection" olarak düşer ve bot
    // çalışmaya devam etse de hata bağlamı kaybolur. Burada bağlamla logluyoruz.
    const runner = (...args) => {
      try {
        const result = event.execute(...args, client);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            console.error(`[event:${event.name}] Hata:`, err);
          });
        }
      } catch (err) {
        console.error(`[event:${event.name}] Hata:`, err);
      }
    };

    if (event.once) {
      client.once(event.name, runner);
    } else {
      client.on(event.name, runner);
    }
    count += 1;
  }
  console.log(`[handler] ${count} event dosyası yüklendi.`);
}

module.exports = { loadEvents };
