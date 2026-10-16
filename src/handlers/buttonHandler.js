const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { error, success, warning, info } = require('../utils/embeds');
const { requireStaff } = require('../utils/auth');
const { getGuildSettings, setGuildSetting } = require('../database/db');
const { generateTicketHtml } = require('../utils/ticketTranscript');
const { CATEGORIES, categoryOf } = require('./selectHandler');
const {
  handleTicketStaff,
  handleProtection,
  handleAutoPunish,
  handleWarnings,
  handleSetupExtraButton,
} = require('./setupExtra');

const PREFIX_TICKET_CLOSE = 'ticket_close:';
const PREFIX_TICKET_CLOSE_CONFIRM = 'ticket_close_confirm:';
const PREFIX_TICKET_CLAIM = 'ticket_claim:';
const PREFIX_TICKET_DM = 'ticket_dm:';
const PREFIX_ROLE_ASSIGN = 'role_assign:';
const PREFIX_SETUP = 'setup:';

function registerButtons(client) {
  client.buttons = new Map();

  client.buttons.set(PREFIX_TICKET_CLOSE, async (interaction) => {
    const ticketId = interaction.customId.slice(PREFIX_TICKET_CLOSE.length);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX_TICKET_CLOSE_CONFIRM}${ticketId}`)
        .setLabel('Evet, Kapat')
        .setStyle('Danger')
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId(`ticket_close_cancel:${ticketId}`)
        .setLabel('İptal')
        .setStyle('Secondary')
    );
    await interaction.reply({
      embeds: [
        warning({
          title: 'Ticket Kapatılacak',
          description: 'Bu işlem ticket kanalını siler ve transkripti oluşturur. Emin misiniz?',
        }),
      ],
      components: [row],
      ephemeral: true,
    });
  });

  client.buttons.set(PREFIX_TICKET_CLOSE_CONFIRM, async (interaction) => {
    const ticketId = interaction.customId.slice(PREFIX_TICKET_CLOSE_CONFIRM.length);
    const { db, getGuildSettings } = require('../database/db');
    const ticket = db
      .prepare('SELECT * FROM tickets WHERE id = ?')
      .get(ticketId);
    if (!ticket) {
      return interaction.reply({
        embeds: [error({ title: 'Bulunamadı', description: 'Ticket kaydı bulunamadı.' })],
        ephemeral: true,
      });
    }

    const guild = interaction.guild;
    const settings = getGuildSettings(guild.id);
    const staffOk = requireStaff(interaction);
    const isOwner = interaction.user.id === ticket.owner_id;
    if (!staffOk && !isOwner) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece ticket sahibi veya yetkili kapatabilir.' })],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = guild.channels.cache.get(ticket.channel_id);
    const closer = interaction.user;
    const owner = await guild.members.fetch(ticket.owner_id).catch(() => null);
    const number = String(ticket.ticket_number).padStart(4, '0');
    const fileName = `ticket-${number}.html`;

    // index.html transkript: sohbet geçmişi + analiz
    let transcriptBuffer = null;
    if (channel) {
      try {
        transcriptBuffer = await generateTicketHtml(channel, ticket, closer);
      } catch (err) {
        console.error('[transcript] Hata:', err);
      }
    }

    const logChannelId = settings.log_channel_id;
    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

    const logEmbed = info({
      title: '🎫 Ticket Kapatıldı',
      description: transcriptBuffer
        ? 'Sohbet geçmişi ve analiz raporu `index.html` olarak ekte.'
        : 'Transkript oluşturulamadı.',
      fields: [
        { name: 'Ticket Numarası', value: `#${number}`, inline: true },
        { name: 'Açan', value: owner ? owner.user.toString() : ticket.owner_id, inline: true },
        { name: 'Kapanan', value: closer.toString(), inline: true },
        { name: 'Kategori', value: ticket.category, inline: true },
        { name: 'Üstleyen Yetkili', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Yok', inline: true },
        { name: 'Açılış', value: `<t:${new Date(ticket.created_at).getTime() / 1000}:F>`, inline: true },
        { name: 'Kapanış', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ],
    });

    // Log kanalına embed + index.html
    if (logChannel) {
      const msg = await logChannel
        .send({
          embeds: [logEmbed],
          files: transcriptBuffer ? [{ attachment: transcriptBuffer, name: fileName }] : [],
        })
        .catch(() => null);

      try {
        db.prepare(
          'UPDATE tickets SET transcript_message_id = ?, closed_at = ?, status = ? WHERE id = ?'
        ).run(msg ? msg.id : null, new Date().toISOString(), 'closed', ticketId);
      } catch (_) {}
    } else {
      try {
        db.prepare('UPDATE tickets SET closed_at = ?, status = ? WHERE id = ?').run(
          new Date().toISOString(),
          'closed',
          ticketId
        );
      } catch (_) {}
    }

    // Kapatılan kullanıcıya DM: indext.html transkript
    if (owner) {
      try {
        await owner.user.send({
          embeds: [
            success({
              title: '🎫 Ticketiniz Kapatıldı',
              description: `${guild.name} sunucusundaki **#${number}** numaralı ticketiniz kapatıldı.\nSohbet geçmişi ve analiz raporu ekte (\`index.html\`).`,
            }),
          ],
          files: transcriptBuffer ? [{ attachment: transcriptBuffer, name: fileName }] : [],
        });
      } catch (_) {
        if (logChannel) {
          await logChannel
            .send({
              embeds: [
                warning({
                  title: 'DM İletilemedi',
                  description: `${owner.user.tag} adlı kullanıcının DM'i kapalı veya mesaj iletilemedi. Transkript yalnızca log kanalında paylaşıldı.`,
                }),
              ],
            })
            .catch(() => {});
        }
      }
    }

    if (channel) {
      await interaction.editReply({
        embeds: [success({ title: 'Ticket Kapanıyor', description: 'Kanal birkaç saniye içinde silinecek.' })],
      });
      setTimeout(() => {
        channel.delete().catch((err) => console.error('[ticket] Kanal silinemedi:', err.message));
      }, 4000);
    } else {
      await interaction.editReply({
        embeds: [success({ title: 'Ticket Kayıt Güncellendi', description: 'Ticket kapatıldı.' })],
      });
    }
  });

  client.buttons.set(`ticket_close_cancel:`, async (interaction) => {
    const ticketId = interaction.customId.slice(`ticket_close_cancel:`.length);
    await interaction.reply({
      embeds: [info({ title: 'İptal Edildi', description: 'Ticket kapatma işlemi iptal edildi.' })],
      ephemeral: true,
    });
  });

  client.buttons.set(PREFIX_TICKET_CLAIM, async (interaction) => {
    if (!requireStaff(interaction)) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer ticketi üstlenebilir.' })],
        ephemeral: true,
      });
    }
    const ticketId = interaction.customId.slice(PREFIX_TICKET_CLAIM.length);
    const { db } = require('../database/db');
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return interaction.reply({ embeds: [error({ title: 'Bulunamadı', description: 'Ticket kaydı bulunamadı.' })], ephemeral: true });
    }
    if (ticket.claimed_by) {
      return interaction.reply({
        embeds: [warning({ title: 'Zaten Üstlenmiş', description: `Bu ticket zaten <@${ticket.claimed_by}> tarafından üstlenilmiş.` })],
        ephemeral: true,
      });
    }
    db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(interaction.user.id, ticketId);
    await interaction.reply({
      embeds: [success({ title: 'Ticket Üstlenildi', description: `Ticket <#${ticket.channel_id}> artık sizin sorumluluğunuzda.` })],
    });
  });

  // Ticket yönetim paneli: kullanıcıya bot üzerinden mesaj gönder
  client.buttons.set(PREFIX_TICKET_DM, async (interaction) => {
    if (!requireStaff(interaction)) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer kullanıcıya mesaj gönderebilir.' })],
        ephemeral: true,
      });
    }

    const ticketId = interaction.customId.slice(PREFIX_TICKET_DM.length);
    const { db } = require('../database/db');
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return interaction.reply({
        embeds: [error({ title: 'Bulunamadı', description: 'Ticket kaydı bulunamadı.' })],
        ephemeral: true,
      });
    }

    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modalId = `ticket_dm_modal:${ticketId}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle('Kullanıcıya Mesaj Gönder');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticket_dm_text')
          .setLabel('Kullanıcıya gönderilecek mesaj')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);

    let submitted;
    try {
      submitted = await interaction.awaitModalSubmit({
        time: 5 * 60 * 1000,
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
      });
    } catch (_) {
      return; // modal zaman aşımı / iptal
    }

    await submitted.deferReply({ ephemeral: true }).catch(() => {});

    const text = (submitted.fields.getTextInputValue('ticket_dm_text') || '').trim();
    if (!text) {
      return submitted.editReply({ embeds: [error({ title: 'Boş Mesaj', description: 'Gönderilecek mesaj boş olamaz.' })] });
    }

    const guild = interaction.guild;
    const owner = await guild.members.fetch(ticket.owner_id).catch(() => null);

    let dmOk = false;
    if (owner) {
      try {
        await owner.send({
          embeds: [info({ title: `📩 ${guild.name} — Yetkili Mesajı`, description: text })],
        });
        dmOk = true;
      } catch (_) {
        dmOk = false;
      }
    }

    // Ticket kanalına da bot üzerinden kaydet
    const ticketChannel = guild.channels.cache.get(ticket.channel_id);
    if (ticketChannel) {
      await ticketChannel
        .send({
          embeds: [
            info({
              title: '📤 Kullanıcıya Gönderilen Mesaj',
              description: text,
              fields: [{ name: 'Yetkili', value: `<@${interaction.user.id}>`, inline: true }],
            }),
          ],
        })
        .catch(() => {});
    }

    return submitted.editReply({
      embeds: [
        success({
          title: 'Mesaj Gönderildi',
          description: dmOk
            ? 'Mesaj kullanıcıya **DM** olarak iletildi ve ticket kanalına kaydedildi.'
            : "Kullanıcının DM'i kapalı olduğu için DM iletilemedi; mesaj ticket kanalına kaydedildi.",
        }),
      ],
    });
  });

  client.buttons.set(PREFIX_ROLE_ASSIGN, async (interaction) => {
    const roleId = interaction.customId.slice(PREFIX_ROLE_ASSIGN.length);
    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ embeds: [error({ title: 'Bulunamadı', description: 'Rol bulunamadı.' })], ephemeral: true });
    }
    const member = interaction.member;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      return interaction.reply({
        embeds: [success({ title: 'Rol Kaldırıldı', description: `${role} rolünüz kaldırıldı.` })],
        ephemeral: true,
      });
    }
    if (
      role.position >= guild.members.me.roles.highest.position &&
      guild.ownerId !== interaction.user.id
    ) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu rolü verebileceğim hiyerarşi konumunda değilim.' })],
        ephemeral: true,
      });
    }
    await member.roles.add(roleId);
    return interaction.reply({
      embeds: [success({ title: 'Rol Verildi', description: `${role} rolü size verildi.` })],
      ephemeral: true,
    });
  });

  client.buttons.set(PREFIX_SETUP, async (interaction) => {
    const [, key] = interaction.customId.split(':');

    // Gelişmiş paneller (Ticket Yetkilileri / Koruma / Otomatik Ceza)
    const EXTRA = {
      ticket_staff: handleTicketStaff,
      protection: handleProtection,
      autopunish: handleAutoPunish,
      warnings: handleWarnings,
    };
    if (EXTRA[key]) return EXTRA[key](interaction);

    const guild = interaction.guild;
    const settings = getGuildSettings(guild.id);

    // customId anahtarını veritabanı sütun adıyla eşle
    const KEY_MAP = {
      log_channel: 'log_channel_id',
      ticket_category: 'ticket_category_id',
      ticket_channel: 'ticket_channel_id',
      autorole: 'autorole_id',
      voice_channel: 'voice_channel_id',
      welcome_channel: 'welcome_channel_id',
      staff_roles: 'staff_roles',
      self_roles: 'self_roles',
      ticket_types: 'ticket_types',
      welcome_enabled: 'welcome_enabled',
      log_types: 'log_types',
    };
    const dbKey = KEY_MAP[key];

    if (!dbKey) {
      return interaction.reply({ embeds: [error({ title: 'Bilinmeyen Ayar', description: `${key} ayarı desteklenmiyor.` })], ephemeral: true });
    }

    const { StringSelectMenuBuilder } = require('discord.js');

    // Ayar -> beklenen kanal türü (0: metin, 2: ses, 4: kategori)
    const CHANNEL_TYPES = {
      log_channel_id: { types: [0], placeholder: 'Log kanalını seçin (metin kanalı)...' },
      ticket_channel_id: { types: [0], placeholder: 'Ticket panel kanalını seçin (metin kanalı)...' },
      welcome_channel_id: { types: [0], placeholder: 'Hoş geldin kanalını seçin (metin kanalı)...' },
      ticket_category_id: { types: [4], placeholder: 'Ticket kategorisini seçin (kategori)...' },
      voice_channel_id: { types: [2], placeholder: 'AFK ses kanalını seçin (ses kanalı)...' },
    };

    if (CHANNEL_TYPES[dbKey]) {
      const { types, placeholder } = CHANNEL_TYPES[dbKey];
      const channels = guild.channels.cache
        .filter((c) => types.includes(c.type))
        .map((c) => ({ label: c.name, value: c.id }))
        .slice(0, 25);

      if (channels.length === 0) {
        return interaction.reply({
          embeds: [error({ title: 'Kanal Bulunamadı', description: 'Bu ayar için uygun türde bir kanal bulunamadı.' })],
          ephemeral: true,
        });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`setup_select:${dbKey}`)
        .setPlaceholder(placeholder)
        .setMaxValues(1)
        .addOptions(channels.map((c) => ({ label: c.label, value: c.value })));
      await interaction.reply({
        content: `*${dbKey}* ayarı için kanal seçin:`,
        components: [{ type: 1, components: [select] }],
        ephemeral: true,
      });
      return;
    }

    // Otomatik rol: tek rol seçimi
    if (dbKey === 'autorole_id') {
      const roles = guild.roles.cache
        .filter((r) => !r.managed && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ label: r.name, value: r.id }))
        .slice(0, 25);

      if (roles.length === 0) {
        return interaction.reply({
          embeds: [error({ title: 'Rol Bulunamadı', description: 'Sunucuda seçilebilecek uygun bir rol bulunamadı.' })],
          ephemeral: true,
        });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId('setup_select:autorole_id')
        .setPlaceholder('Otomatik verilecek rolü seçin...')
        .setMaxValues(1)
        .addOptions(roles.map((r) => ({
          label: r.label,
          value: r.value,
          default: settings.autorole_id === r.value,
        })));

      await interaction.reply({
        content: 'Sunucuya giren üyelere otomatik verilecek rolü seçin:',
        components: [{ type: 1, components: [select] }],
        ephemeral: true,
      });
      return;
    }

    if (dbKey === 'staff_roles' || dbKey === 'self_roles') {
      const roles = guild.roles.cache
        .filter((r) => !r.managed && r.id !== guild.id)
        .map((r) => ({ label: r.name, value: r.id }))
        .slice(0, 25);
      const select = new StringSelectMenuBuilder()
        .setCustomId(`setup_select:${dbKey}`)
        .setPlaceholder('Rolleri seçin (çoklu)')
        .setMinValues(0)
        .setMaxValues(Math.min(roles.length, 25))
        .addOptions(roles.map((r) => ({ label: r.label, value: r.value })));
      await interaction.reply({
        content: `*${dbKey}* ayarı için rolleri seçin:`,
        components: [{ type: 1, components: [select] }],
        ephemeral: true,
      });
      return;
    }

    if (dbKey === 'ticket_types') {
      const types = ['Destek', 'Şikayet', 'Başvuru', 'Öneri', 'Diğer'];
      const select = new StringSelectMenuBuilder()
        .setCustomId('setup_select:ticket_types')
        .setPlaceholder('Ticket kategorilerini seçin')
        .setMinValues(1)
        .setMaxValues(types.length)
        .addOptions(types.map((t) => ({ label: t, value: t })));
      await interaction.reply({
        content: 'Ticket kategori tiplerini seçin:',
        components: [{ type: 1, components: [select] }],
        ephemeral: true,
      });
      return;
    }

    if (dbKey === 'log_types') {
      const logTypes = [
        { label: 'Mesaj Silme', value: 'messageDelete' },
        { label: 'Mesaj Düzenleme', value: 'messageUpdate' },
        { label: 'Üye Girişi', value: 'guildMemberAdd' },
        { label: 'Üye Çıkışı', value: 'guildMemberRemove' },
        { label: 'Ses Durumu', value: 'voiceStateUpdate' },
        { label: 'Rol Değişikliği', value: 'guildMemberUpdate' },
        { label: 'Moderasyon', value: 'moderation' },
        { label: 'Ticket', value: 'ticket' },
        { label: 'Yetkili Komutu', value: 'staffCommand' },
      ];
      const current = JSON.parse(settings.log_types || '{}');
      const select = new StringSelectMenuBuilder()
        .setCustomId('setup_select:log_types')
        .setPlaceholder('Log türlerini seçin (açık/kapa)')
        .setMinValues(0)
        .setMaxValues(logTypes.length)
        .addOptions(logTypes.map((t) => ({
          label: t.label,
          value: t.value,
          default: current[t.value] === 1,
        })));
      await interaction.reply({
        content: 'Hangi olayların loga yazılacağını seçin:',
        components: [{ type: 1, components: [select] }],
        ephemeral: true,
      });
      return;
    }

    if (dbKey === 'welcome_enabled') {
      const val = settings.welcome_enabled === 1 ? 0 : 1;
      setGuildSetting(guild.id, 'welcome_enabled', val);
      await interaction.reply({
        embeds: [
          success({
            title: 'Hoş Geldin / Güle Güle',
            description: `Sistemi ${val === 1 ? 'açıldı' : 'kapatıldı'}.`,
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ embeds: [error({ title: 'Bilinmeyen Ayar', description: `${dbKey} ayarı desteklenmiyor.` })], ephemeral: true });
  });

  client.buttons.set('help:close', async (interaction) => {
    try {
      await interaction.deleteReply();
    } catch (_) {
      await interaction.editReply({ components: [], embeds: [] });
    }
  });

  client.buttons.set('help:all', async (interaction) => {
    const commands = Array.from(interaction.client.commands.values());
    const byCat = {};
    for (const cmd of commands) {
      const cat = categoryOf(cmd);
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(cmd);
    }
    const fields = [];
    for (const [catId, cmds] of Object.entries(byCat)) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      const label = cat ? cat.label : catId;
      fields.push({
        name: `__${label}__ (${cmds.length})`,
        value: cmds.map((c) => `/${c.data.name}`).join(', '),
        inline: false,
      });
    }
    await interaction.update({ embeds: [info({ title: '📚 Tüm Komutlar', fields })] });
  });

  client.buttons.set('help:admin', async (interaction) => {
    if (!requireStaff(interaction)) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu rehber yalnızca yetkililer içindir.' })],
        ephemeral: true,
      });
    }

    const embed = info({
      title: '🛡️ Yönetici Panelleri Rehberi',
      description:
        'Gelişmiş ayarların tamamı **`/setup`** panelinden yönetilir. Aşağıda her panelin ne işe yaradığı ve nasıl kullanıldığı anlatılmıştır.',
      fields: [
        {
          name: '⚙️ /setup — Genel Kurulum',
          value:
            'Log kanalı, yetkili rolleri, ticket kategorisi & panel kanalı, ticket türleri, otomatik rol, AFK ses kanalı, ' +
            'hoş geldin/güle güle ve rol paneli rollerini ayarlar. Butonlar değişiklikleri **anında** kaydeder.',
        },
        {
          name: '👥 Ticket Yetkilileri',
          value:
            'Panelde bir **ticket türü** seçin, ardından o tür için yetkili **rolleri** işaretleyin. ' +
            'Bu türde açılan ticket kanalına roller otomatik eklenir ve etiketlenir.',
        },
        {
          name: '🛡️ Koruma Filtresi (Küfür Paneli)',
          value:
            'Milli ve dini değerlere yönelik hakaret içeren mesajları siler, göndereni susturur.\n' +
            '• **Filtreyi Aç / Kapat**\n' +
            '• **Susturma süresini** seç (5 dk – 1 gün)\n' +
            '• **Uyarı Mesajını Düzenle** ile metni değiştir\n' +
            '• **Filtreyi Test Et** ile örnek bir metnin filtrelenip filtrelenmeyeceğini dene',
        },
        {
          name: '⚖️ Otomatik Ceza',
          value:
            '`/uyar` sayısına göre kademeli mute, son eşikte ban uygular.\n' +
            '• **Kademeleri Düzenle**: her satıra `uyarı=mute_dakika` yaz (ör. `3=10`) ve **ban eşiğini** gir\n' +
            '• **Sistemi Aç / Kapat**\n' +
            'Varsayılan: 3→10dk, 5→30dk, 10→2sa, 15→12sa, 20→ban',
        },
        {
          name: '⚠️ Uyarı Sistemi & Boost',
          value:
            'Uyarılar belirli süre sonra otomatik **düşer**.\n' +
            '• **Ayarları Düzenle**: geçerlilik süresi (varsayılan 15 gün), boost\'ta süre yarıya (7.5 gün) ve kaçıncı boost\'ta uyarıların sıfırlanacağı (varsayılan 2).\n' +
            '• Süre **dinamiktir**: üye boost\'luysa süre yarıya iner.\n' +
            '• Üye belirlenen boost sayısına ulaşınca tüm uyarıları sıfırlanır.\n' +
            '• Her uyarı işleminde kullanıcıya **DM** gider ve **aynı mesaj** log kanalına yazılır.',
        },
        {
          name: '🔨 Moderasyon Bildirimi',
          value:
            'Üyeye uygulanan **tüm** yaptırımlarda (`/ban`, `/unban`, `/kick`, `/timeout`, `/timeout-kaldır`, `/uyar`, `/uyarı-sil`) ' +
            'işlem yapılan üyeye **DM** gönderilir ve **birebir aynı mesaj** sunucunun belirlenen log kanalına yazılır. ' +
            'Otomatik ceza, boost sıfırlama ve koruma filtresi de aynı kurala uyar. ' +
            'Üyenin DM\'i kapalıysa yetkili cevabında "DM iletilemedi" notu çıkar (log kanalına yine yazılır).',
        },
        {
          name: '📣 Duyurular',
          value:
            '• `/duyur` → anında profesyonel duyuru (yazarı gizle / etiket / renk seçenekleri)\n' +
            '• `/duyur-zamanla` → ileri bir zamana planlar (`30m`, `2h`, `1g` veya `GG.AA.YYYY SS:DD`)\n' +
            '• `/duyur-iptal` → bekleyen duyuruları listeler, `no` verirsen iptal eder',
        },
        {
          name: '🎫 Ticket Sistemi',
          value:
            '`/ticket-panel` ile panel kurun. Ticket kapatıldığında sohbet geçmişi + **analiz raporu** `index.html` olarak ' +
            'hem log kanalına hem de kullanıcının DM\'ine gönderilir.\n' +
            '`/ticket-kişi-ekle` ve `/ticket-kişi-çıkar` ile kanala kişi ekleyip çıkarabilirsiniz.',
        },
        {
          name: '📥 Veri ve Yedek',
          value:
            '`/veri-indir` → WAL uyumlu güvenli SQLite yedeği + CSV tabloları (tickets, warnings, moderation_logs) gönderir.',
        },
        {
          name: '👮 Yetki Notu',
          value:
            'Panelleri yalnızca **sunucu sahibi**, **Yönetici** izni olanlar ve **yetkili rollerine** sahip üyeler görebilir ve kullanabilir.',
        },
      ],
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help:close').setLabel('Kapat').setStyle('Danger')
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  });

  // Setup ek panelleri (sx... butonları)
  client.buttons.set('sx', handleSetupExtraButton);
}

async function handleButton(interaction, client) {
  const customId = interaction.customId || '';
  for (const [prefix, handler] of client.buttons.entries()) {
    if (customId.startsWith(prefix)) {
      try {
        await handler(interaction);
      } catch (err) {
        console.error(`[button:${prefix}] Hata:`, err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [error({ title: 'Hata', description: 'Beklenmedik bir hata oluştu.' })],
            ephemeral: true,
          });
        }
      }
      return;
    }
  }
}

module.exports = { registerButtons, handleButton };
