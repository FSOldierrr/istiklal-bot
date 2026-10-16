const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('discord.js');
const { error, success, info, warning } = require('../utils/embeds');
const { requireStaff, isStaff } = require('../utils/auth');
const { getGuildSettings, setGuildSetting, nextTicketNumber, db, getTicketStaff } = require('../database/db');
const { handleSetupExtraSelect } = require('./setupExtra');

// Bir sunucuda aynı anda açılabilecek maksimum ticket sayısı (eşzamanlı 20 kişi)
const MAX_OPEN_TICKETS = 20;

function getDb() {
  return db;
}

async function handleSelect(interaction, client) {
  const customId = interaction.customId || '';

  // --- Setup ek panelleri (sx... menüleri) ---
  if (customId.startsWith('sx')) {
    return handleSetupExtraSelect(interaction, client);
  }

  // --- Ticket oluşturma menüsü ---
  if (customId === 'ticket_open') {
    // Kanal oluşturma + panel gönderimi 3 saniyeyi aşabildiğinden interaction'ı
    // hemen onayla; aksi halde "Unknown interaction" hatası alınırdı.
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const category = interaction.values[0];
    const guild = interaction.guild;
    const settings = getGuildSettings(guild.id);

    const existing = getDb()
      .prepare('SELECT * FROM tickets WHERE guild_id = ? AND owner_id = ? AND status = ?')
      .get(guild.id, interaction.user.id, 'open');
    if (existing) {
      return interaction.editReply({
        embeds: [error({ title: 'Açık Ticket Var', description: `Zaten açık bir ticketiniz var: <#${existing.channel_id}>` })],
      });
    }

    // Aynı anda en fazla MAX_OPEN_TICKETS ticket açık olabilir
    const openCount = getDb()
      .prepare('SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = ?')
      .get(guild.id, 'open').c;
    if (openCount >= MAX_OPEN_TICKETS) {
      return interaction.editReply({
        embeds: [
          error({
            title: 'Ticket Limiti Doldu',
            description: `Şu an aynı anda en fazla **${MAX_OPEN_TICKETS}** ticket açık olabilir. Lütfen biraz sonra tekrar deneyin.`,
          }),
        ],
      });
    }

    const categoryChannel = guild.channels.cache.get(settings.ticket_category_id);
    if (!categoryChannel || categoryChannel.type !== 4) {
      return interaction.editReply({
        embeds: [error({ title: 'Ticket Kategorisi Ayarlı Değil', description: 'Önce /setup ile ticket kategorisi ayarlayın.' })],
      });
    }

    const ticketNumber = nextTicketNumber(guild.id);

    // Yetkili rolleri: yalnızca sunucuda gerçekten var olan roller (silinmiş rol
    // ID'leri kanal oluşturmayı bozar).
    const staffRoles = JSON.parse(settings.staff_roles || '[]');
    const categoryStaff = getTicketStaff(guild.id, category);
    const allStaff = [...new Set([...staffRoles, ...categoryStaff])].filter((id) => guild.roles.cache.has(id));

    const overwrites = [
      { id: guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] },
    ];
    // Botun kendisi de kanalı görüp yazabilmeli (admin olmasa bile çalışsın)
    const me = guild.members.me;
    if (me) {
      overwrites.push({
        id: me.id,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'ManageChannels', 'ManageMessages'],
      });
    }
    for (const roleId of allStaff) {
      overwrites.push({ id: roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] });
    }

    let channel;
    try {
      channel = await guild.channels.create({
        name: `ticket-${String(ticketNumber).padStart(4, '0')}-${interaction.user.username.replace(/\s+/g, '-')}`,
        type: 0,
        parent: categoryChannel.id,
        permissionOverwrites: overwrites,
        topic: `Ticket #${ticketNumber} | Sahip: ${interaction.user.tag} | Kategori: ${category}`,
      });
    } catch (err) {
      console.error('[ticket] Kanal oluşturma hatası:', err);
      return interaction.editReply({
        embeds: [error({ title: 'Hata', description: `Ticket kanalı oluşturulamadı: ${err.message}` })],
      });
    }

    let ticketId;
    try {
      const insert = getDb().prepare(
        'INSERT INTO tickets (ticket_number, guild_id, channel_id, owner_id, category, status, created_at) VALUES (?,?,?,?,?,?,?)'
      ).run(ticketNumber, guild.id, channel.id, interaction.user.id, category, 'open', new Date().toISOString());
      ticketId = insert.lastInsertRowid;
    } catch (err) {
      console.error('[ticket] Kayıt hatası:', err);
      await channel.delete().catch(() => {});
      return interaction.editReply({
        embeds: [error({ title: 'Hata', description: 'Ticket kaydı oluşturulamadı; kanal geri alındı. Lütfen tekrar deneyin.' })],
      });
    }

    // Yönetim paneli: kanal zaten oluşturuldu; panel gönderilemese bile ticket açılır.
    try {
      const panelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_claim:${ticketId}`)
          .setLabel('Ticketi Üstlen')
          .setStyle('Primary')
          .setEmoji('👤'),
        new ButtonBuilder()
          .setCustomId(`ticket_dm:${ticketId}`)
          .setLabel('Kullanıcıya Mesaj')
          .setStyle('Secondary')
          .setEmoji('✉️'),
        new ButtonBuilder()
          .setCustomId(`ticket_close:${ticketId}`)
          .setLabel('Ticketi Kapat')
          .setStyle('Danger')
          .setEmoji('🔒')
      );

      const staffMention = allStaff.length ? allStaff.map((r) => `<@&${r}>`).join(' ') : '';

      await channel.send({
        content: `<@${interaction.user.id}> ve yetkililer buraya yazabilir. Yetkililer işlemleri aşağıdaki **yönetim panelinden** yapabilir.${
          staffMention ? `\n\n📣 Yetkililer: ${staffMention}` : ''
        }`,
        embeds: [
          info({
            title: `🎫 Ticket #${String(ticketNumber).padStart(4, '0')} — Yönetim Paneli`,
            description:
              'Yetkililer bu paneli kullanarak ticketi **üstlenebilir**, kullanıcıya **bot üzerinden mesaj** gönderebilir veya ticketi **kapatabilir**.',
            fields: [
              { name: 'Sahip', value: interaction.user.toString(), inline: true },
              { name: 'Kategori', value: category, inline: true },
              { name: 'Durum', value: 'Açık', inline: true },
            ],
          }),
        ],
        components: [panelRow],
      });
    } catch (err) {
      console.error('[ticket] Panel gönderilemedi:', err.message);
    }

    return interaction.editReply({
      embeds: [success({ title: 'Ticket Oluşturuldu', description: `Ticketiniz: <#${channel.id}>` })],
    });
  }

  // --- Ticket içi işlem menüsü ---
  if (customId === 'ticket_action_select') {
    const value = interaction.values[0];
    if (value === 'close') {
      const ticketId = getTicketIdByChannel(interaction.channel.id);
      if (!ticketId) {
        return interaction.reply({ embeds: [error({ title: 'Hata', description: 'Ticket kaydı bulunamadı.' })], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_close_confirm:${ticketId}`).setLabel('Evet, Kapat').setStyle('Danger').setEmoji('🔒'),
        new ButtonBuilder().setCustomId(`ticket_close_cancel:${ticketId}`).setLabel('İptal').setStyle('Secondary')
      );
      return interaction.reply({
        embeds: [
          warning({
            title: 'Ticket Kapatılacak',
            description: 'Bu işlem ticket kanalını siler ve transkript oluşturur. Emin misiniz?',
          }),
        ],
        components: [row],
        ephemeral: true,
      });
    }
    if (value === 'manage') {
      return interaction.reply({
        embeds: [info({ title: 'Kişi Ekle / Çıkar', description: '/ticket-kişi-ekle veya /ticket-kişi-çıkar komutlarını kullanın.' })],
        ephemeral: true,
      });
    }
    return;
  }

  // --- Ticket üstlenme menüsü ---
  if (customId === 'ticket_claim_select') {
    const value = interaction.values[0];
    if (value !== 'claim') return;
    const ticketId = getTicketIdByChannel(interaction.channel.id);
    if (!ticketId) {
      return interaction.reply({ embeds: [error({ title: 'Hata', description: 'Ticket kaydı bulunamadı.' })], ephemeral: true });
    }
    const ticket = getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return interaction.reply({ embeds: [error({ title: 'Bulunamadı' })], ephemeral: true });
    }
    if (ticket.claimed_by) {
      return interaction.reply({ embeds: [warning({ title: 'Zaten Üstlenmiş', description: `<@${ticket.claimed_by}> tarafından üstlenilmiş.` })], ephemeral: true });
    }
    if (!requireStaff(interaction)) {
      return interaction.reply({ embeds: [error({ title: 'Yetki Yetersiz' })], ephemeral: true });
    }
    getDb().prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(interaction.user.id, ticketId);
    return interaction.reply({ embeds: [success({ title: 'Ticket Üstlenildi' })] });
  }

  // --- Rol paneli seçimi ---
  if (customId === 'role_panel_select') {
    const roleId = interaction.values[0];
    const guild = interaction.guild;
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ embeds: [error({ title: 'Bulunamadı', description: 'Rol bulunamadı.' })], ephemeral: true });
    }
    const member = interaction.member;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      return interaction.reply({ embeds: [success({ title: 'Rol Kaldırıldı', description: `${role} rolünüz kaldırıldı.` })], ephemeral: true });
    }
    if (role.position >= guild.members.me.roles.highest.position && guild.ownerId !== interaction.user.id) {
      return interaction.reply({ embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu rolü verebileceğim hiyerarşi konumunda değilim.' })], ephemeral: true });
    }
    await member.roles.add(roleId);
    return interaction.reply({ embeds: [success({ title: 'Rol Verildi', description: `${role} rolü size verildi.` })], ephemeral: true });
  }

  // --- Kurulum ayar değişimi ---
  if (customId.startsWith('setup_select:')) {
    const key = customId.slice('setup_select:'.length);
    const guild = interaction.guild;
    const values = interaction.values;

    if (!requireStaff(interaction)) {
      return interaction.reply({
        embeds: [error({ title: 'Yetki Yetersiz', description: 'Sadece yetkililer sunucu ayarlarını değiştirebilir.' })],
        ephemeral: true,
      });
    }

    if (key === 'ticket_types') {
      setGuildSetting(guild.id, 'ticket_types', JSON.stringify(values));
      return interaction.reply({ embeds: [success({ title: 'Ticket Kategorileri', description: `Güncellendi: ${values.join(', ')}` })], ephemeral: true });
    }

    if (key === 'staff_roles' || key === 'self_roles') {
      setGuildSetting(guild.id, key, JSON.stringify(values));
      return interaction.reply({ embeds: [success({ title: 'Ayar Güncellendi', description: `${values.length} değer kaydedildi.` })], ephemeral: true });
    }

    if (key === 'log_types') {
      const logTypes = {
        messageDelete: 1, messageUpdate: 1, guildMemberAdd: 1, guildMemberRemove: 1,
        voiceStateUpdate: 1, guildMemberUpdate: 1, moderation: 1, ticket: 1, staffCommand: 1,
      };
      for (const k of Object.keys(logTypes)) logTypes[k] = values.includes(k) ? 1 : 0;
      setGuildSetting(guild.id, 'log_types', JSON.stringify(logTypes));
      return interaction.reply({ embeds: [success({ title: 'Log Türleri', description: 'Log ayarları güncellendi.' })], ephemeral: true });
    }

    setGuildSetting(guild.id, key, values[0] || null);

    // AFK ses kanalı değiştiyse botu gerçekten yeni kanala taşı
    if (key === 'voice_channel_id' && client.voiceManager) {
      try {
        client.voiceManager.leave(guild.id);
        if (values[0]) client.voiceManager.join(guild);
      } catch (err) {
        console.error('[voice] Kanal değiştirilemedi:', err.message);
      }
    }

    const friendlyNames = {
      log_channel_id: 'Log kanalı',
      ticket_channel_id: 'Ticket panel kanalı',
      ticket_category_id: 'Ticket kategorisi',
      welcome_channel_id: 'Hoş geldin kanalı',
      voice_channel_id: 'AFK ses kanalı',
      autorole_id: 'Otomatik rol',
    };
    const friendly = friendlyNames[key] || key;
    return interaction.reply({ embeds: [success({ title: 'Ayar Güncellendi', description: `${friendly} başarıyla güncellendi.` })], ephemeral: true });
  }

  // --- Yardım kategorisi ---
  if (customId.startsWith('help_category:')) {
    const categoryId = customId.slice('help_category:'.length);
    const commands = Array.from(interaction.client.commands.values());
    const { label, fields } = buildHelpFields(commands, categoryId);

    const select = new StringSelectMenuBuilder()
      .setCustomId(`help_category:${categoryId}`)
      .setPlaceholder('Bir kategori seçin')
      .addOptions(
        CATEGORIES.map((c) => ({
          label: c.label,
          value: c.id,
          description: `${c.label} komutları`,
          emoji: c.emoji,
          default: c.id === categoryId,
        }))
      );

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help:all').setLabel('Tüm Komutlar').setStyle('Secondary'),
      ...(isStaff(interaction.guild, interaction.member)
        ? [
            new ButtonBuilder()
              .setCustomId('help:admin')
              .setLabel('Yönetici Panelleri')
              .setStyle('Primary')
              .setEmoji('🛡️'),
          ]
        : []),
      new ButtonBuilder().setCustomId('help:close').setLabel('Kapat').setStyle('Danger')
    );

    return interaction.update({
      embeds: [
        info({
          title: '📚 İstiklal Yardım Menüsü',
          description: `**${label}** kategorisinde ${fields.length} komut var.`,
          fields: fields.slice(0, 10),
        }),
      ],
      components: [row1, row2],
    });
  }

  await interaction.reply({ embeds: [error({ title: 'Bilinmeyen Menü', description: 'Bu select menüsü desteklenmiyor.' })], ephemeral: true });
}

function getTicketIdByChannel(channelId) {
  const row = getDb().prepare('SELECT id FROM tickets WHERE channel_id = ? AND status = ?').get(channelId, 'open');
  return row ? row.id : null;
}

const CATEGORIES = [
  { id: 'genel', label: 'Genel', emoji: '💬' },
  { id: 'ticket', label: 'Ticket', emoji: '🎫' },
  { id: 'moderasyon', label: 'Moderasyon', emoji: '🔨' },
  { id: 'kurulum', label: 'Kurulum', emoji: '⚙️' },
  { id: 'veri', label: 'Veri', emoji: '📥' },
  { id: 'sistem', label: 'Sistem', emoji: '⚠️' },
];

function categoryOf(command) {
  const name = command.data.name;
  if (name === 'setup' || name === 'rol-panel') return 'kurulum';
  if (name === 'ticket-panel' || name === 'ticket-kişi-ekle' || name === 'ticket-kişi-çıkar') return 'ticket';
  if (
    name === 'ban' ||
    name === 'unban' ||
    name === 'kick' ||
    name === 'timeout' ||
    name === 'timeout-kaldır' ||
    name === 'uyar' ||
    name === 'uyarılar' ||
    name === 'uyarı-sil' ||
    name === 'temizle'
  ) {
    return 'moderasyon';
  }
  if (name === 'veri-indir') return 'veri';
  if (name === 'yardım') return 'sistem';
  return 'genel';
}

function permissionOf(command) {
  if (command.data.name === 'setup') return 'Yönetici';
  if (command.ephemeral === true) return 'Yetkili';
  return 'Herkes';
}

function paramsOf(command) {
  const opts = command.data.options || [];
  if (opts.length === 0) return 'Yok';
  return opts.map((o) => `<${o.name}>${o.required ? '' : ' (isteğe bağlı)'}`).join(', ');
}

function usageOf(command) {
  const p = paramsOf(command);
  return p === 'Yok' ? `/${command.data.name}` : `/${command.data.name} ${p}`;
}

function buildHelpFields(commands, categoryId) {
  const found = CATEGORIES.find((c) => c.id === categoryId);
  const label = found ? found.label : categoryId;
  const cmds = commands.filter((c) => categoryOf(c) === categoryId);
  const fields = cmds.map((c) => ({
    name: `/${c.data.name}`,
    value: `**Açıklama:** ${c.data.description}\n**Parametreler:** ${paramsOf(c)}\n**Kullanım:** ${usageOf(c)}\n**Kimler:** ${permissionOf(c)}`,
    inline: false,
  }));
  return { label, fields };
}

function registerSelects(client) {
  client.selects = new Map();
}

module.exports = {
  registerSelects,
  handleSelect,
  CATEGORIES,
  categoryOf,
  permissionOf,
  paramsOf,
  usageOf,
  buildHelpFields,
};
