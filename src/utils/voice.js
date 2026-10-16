const {
  joinVoiceChannel,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const { ready } = require('libsodium-wrappers');
const { log } = require('./logger');
const { getGuildSettings } = require('../database/db');

class VoiceAFKManager {
  constructor(client) {
    this.client = client;
    this.connections = new Map(); // guildId -> connection
    this.backoff = new Map(); // guildId -> { attempts }
  }

  async init() {
    await ready;
    for (const guild of this.client.guilds.cache.values()) {
      this.join(guild);
    }
    log('info', 'Ses AFK yöneticisi başlatıldı.');
  }

  join(guild) {
    const settings = getGuildSettings(guild.id);
    const channelId = settings.voice_channel_id;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 2) {
      this.reportMissing(guild, 'Ayarlanan ses kanalı bulunamadı veya silinmiş.');
      return;
    }

    const me = guild.members.me;
    if (
      !me ||
      !channel.permissionsFor(me).has(['Connect', 'Speak'])
    ) {
      this.reportMissing(guild, 'Ses kanalına bağlanma veya konuşma iznim yok.');
      return;
    }

    const old = this.connections.get(guild.id);
    if (old) {
      try {
        old.destroy();
      } catch (_) {}
      this.connections.delete(guild.id);
    }

    try {
      const connection = joinVoiceChannel({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      const player = createAudioPlayer({
        behaviors: { noSubscriber: true },
      });
      connection.subscribe(player);

      connection.on('stateChange', (_oldState, newState) => {
        if (newState.status === VoiceConnectionStatus.Disconnected) {
          this.reconnect(guild);
        }
      });

      connection.on('error', (err) => {
        log('error', `[Ses] ${guild.name} bağlantı hatası: ${err.message}`);
        this.reconnect(guild);
      });

      this.connections.set(guild.id, connection);
      if (!this.backoff.has(guild.id)) {
        this.backoff.set(guild.id, { attempts: 0 });
      }
      log('info', `[Ses] ${guild.name} -> #${channel.name} (sağır bekleme)`);
    } catch (err) {
      log('error', `[Ses] ${guild.name} bağlanılamadı: ${err.message}`);
      this.reconnect(guild);
    }
  }

  async reconnect(guild) {
    const state = this.backoff.get(guild.id) || { attempts: 0 };
    state.attempts += 1;
    if (state.attempts > 5) {
      log('warn', `[Ses] ${guild.name} çok fazla yeniden bağlanma denemesi, durduruldu.`);
      return;
    }
    this.backoff.set(guild.id, state);
    const delay = Math.min(1000 * 2 ** state.attempts, 30000);

    setTimeout(() => {
      this.join(guild);
    }, delay).unref();

    log('info', `[Ses] ${guild.name} ${delay} ms içinde yeniden bağlanılacak (deneme ${state.attempts}).`);
  }

  leave(guildId) {
    const conn = this.connections.get(guildId);
    if (conn) {
      try {
        conn.destroy();
      } catch (_) {}
      this.connections.delete(guildId);
    }
    this.backoff.delete(guildId);
  }

  reportMissing(guild, reason) {
    const settings = getGuildSettings(guild.id);
    const logChannelId = settings.log_channel_id;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    logChannel
      .send({
        embeds: [
          {
            color: 0xe74c3c,
            title: '⚠️ Ses AFK Kanalı Hatası',
            description: `${reason}\nKanal: <#${settings.voice_channel_id}>\nSunucu: ${guild.name}`,
            timestamp: new Date(),
            footer: { text: 'İstiklal Bot • Ses Sistem' },
          },
        ],
      })
      .catch(() => {});
  }
}

module.exports = { VoiceAFKManager };
