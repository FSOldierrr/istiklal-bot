'use strict';

/**
 * İstiklal Bot — Setup Ek Panelleri
 * ------------------------------------------------------------------
 * /setup panelinden açılan gelişmiş ayarlar:
 *   • Ticket Yetkilileri (ticket türüne göre otomatik eklenecek roller)
 *   • Koruma Filtresi (aç/kapa, susturma süresi, uyarı mesajı)
 *   • Otomatik Ceza (uyarı sayısına göre mute/ban)
 *
 * Tüm özel bileşen kimlikleri "sx" ile başlar; böylece button/select
 * yönlendiricileri bu panelleri kolayca ayırt eder.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { success, error, info, warning } = require('../utils/embeds');
const { requireStaff } = require('../utils/auth');
const { analyze } = require('../utils/profanity');
const {
  getGuildSettings,
  getTicketStaff,
  setTicketStaff,
  getProfanityConfig,
  setProfanityConfig,
  getAutoPunishConfig,
  setAutoPunishConfig,
  getWarningConfig,
  setWarningConfig,
} = require('../database/db');

const DURATION_OPTIONS = [
  { label: '5 dakika', value: '5' },
  { label: '10 dakika', value: '10' },
  { label: '30 dakika', value: '30' },
  { label: '1 saat', value: '60' },
  { label: '6 saat', value: '360' },
  { label: '12 saat', value: '720' },
  { label: '1 gün', value: '1440' },
];

function permissionDenied(interaction) {
  return interaction.reply({
    embeds: [error({ title: 'Yetki Yetersiz', description: 'Bu paneli sadece yetkililer kullanabilir.' })],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Görünümler
 * ------------------------------------------------------------------ */

function typeSelectView(guild) {
  const settings = getGuildSettings(guild.id);
  const types = JSON.parse(settings.ticket_types || '[]');
  if (!types.length) {
    return {
      embeds: [
        error({
          title: 'Ticket Türü Yok',
          description: 'Önce **Sunucu Kurulum Paneli > Ticket Türleri** ayarını yapın.',
        }),
      ],
      components: [],
    };
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('sxts_type')
    .setPlaceholder('Yetkili atanacak ticket türünü seçin')
    .addOptions(types.slice(0, 25).map((t) => ({ label: t, value: t })));

  return {
    embeds: [
      info({
        title: '👥 Ticket Yetkilileri',
        description:
          'Bir ticket türü seçin. O türde açılan ticket kanallarına, belirlediğiniz roller **otomatik eklenir ve etiketlenir**.',
      }),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

function roleSelectView(guild, category) {
  const current = getTicketStaff(guild.id, category);
  const roles = guild.roles.cache
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ label: r.name, value: r.id }))
    .slice(0, 25);

  if (!roles.length) {
    return {
      embeds: [error({ title: 'Rol Bulunamadı', description: 'Sunucuda seçilebilecek uygun rol yok.' })],
      components: [],
    };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`sxts_roles_${encodeURIComponent(category)}`)
    .setPlaceholder('Rolleri seçin (çoklu)')
    .setMinValues(0)
    .setMaxValues(roles.length)
    .addOptions(roles.map((r) => ({ label: r.label, value: r.value, default: current.includes(r.value) })));

  const back = new ButtonBuilder().setCustomId('sxts_back').setLabel('Geri').setStyle('Secondary').setEmoji('◀️');
  const clear = new ButtonBuilder()
    .setCustomId(`sxts_clear_${encodeURIComponent(category)}`)
    .setLabel('Temizle')
    .setStyle('Danger')
    .setEmoji('🗑️');

  return {
    embeds: [
      info({
        title: `👥 ${category} — Yetkili Roller`,
        description: `Şu an atanmış: ${
          current.length ? current.map((r) => `<@&${r}>`).join(', ') : 'Yok'
        }\n\nAşağıdaki menüden rolleri seçin. Değişiklik anında kaydedilir.`,
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(back, clear),
    ],
  };
}

function protectionView(guild) {
  const cfg = getProfanityConfig(guild.id);
  const select = new StringSelectMenuBuilder()
    .setCustomId('sxprot_duration')
    .setPlaceholder('Susturma süresini seçin')
    .addOptions(DURATION_OPTIONS.map((o) => ({ ...o, default: String(cfg.muteMinutes) === o.value })));

  const toggle = new ButtonBuilder()
    .setCustomId('sxprot_toggle')
    .setLabel(cfg.enabled === false ? 'Filtreyi Aç' : 'Filtreyi Kapat')
    .setStyle(cfg.enabled === false ? 'Success' : 'Danger')
    .setEmoji(cfg.enabled === false ? '✅' : '⛔');

  const msgBtn = new ButtonBuilder()
    .setCustomId('sxprot_message')
    .setLabel('Uyarı Mesajını Düzenle')
    .setStyle('Primary')
    .setEmoji('✏️');

  const testBtn = new ButtonBuilder()
    .setCustomId('sxprot_test')
    .setLabel('Filtreyi Test Et')
    .setStyle('Secondary')
    .setEmoji('🧪');

  return {
    embeds: [
      info({
        title: '🛡️ Koruma Filtresi (Küfür Paneli)',
        description:
          'Milli ve dini değerlerimize yönelik hakaret içeren mesajları otomatik siler ve göndereni susturur.',
        fields: [
          { name: 'Durum', value: cfg.enabled === false ? '⛔ Kapalı' : '✅ Açık', inline: true },
          { name: 'Susturma Süresi', value: `${cfg.muteMinutes} dakika`, inline: true },
          { name: 'Uyarı Mesajı', value: (cfg.message || '-').slice(0, 1000) || '-' },
        ],
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(toggle, msgBtn, testBtn),
    ],
  };
}

function autoPunishView(guild) {
  const cfg = getAutoPunishConfig(guild.id);
  const ladderText =
    (cfg.ladder || []).map((s) => `• **${s.count} uyarı** → ${s.minutes} dk mute`).join('\n') || 'Yok';

  const toggle = new ButtonBuilder()
    .setCustomId('sxpun_toggle')
    .setLabel(cfg.enabled === false ? 'Sistemi Aç' : 'Sistemi Kapat')
    .setStyle(cfg.enabled === false ? 'Success' : 'Danger')
    .setEmoji(cfg.enabled === false ? '✅' : '⛔');

  const editBtn = new ButtonBuilder()
    .setCustomId('sxpun_edit')
    .setLabel('Kademeleri Düzenle')
    .setStyle('Primary')
    .setEmoji('✏️');

  return {
    embeds: [
      info({
        title: '⚖️ Otomatik Ceza Sistemi',
        description:
          'Bir üyeye `/uyar` ile uyarı verildikçe aşağıdaki kademelere göre otomatik ceza uygulanır. Son eşikte ban atılır.',
        fields: [
          { name: 'Durum', value: cfg.enabled === false ? '⛔ Kapalı' : '✅ Açık', inline: true },
          { name: 'Ban Eşiği', value: `${cfg.banAt} uyarı`, inline: true },
          { name: 'Ceza Kademeleri', value: ladderText },
        ],
      }),
    ],
    components: [new ActionRowBuilder().addComponents(toggle, editBtn)],
  };
}

function warningsView(guild) {
  const cfg = getWarningConfig(guild.id);
  const days = Number(cfg.expiryDays) || 15;
  const half = cfg.boosterHalf ? 'Evet' : 'Hayır';
  const clear = Number(cfg.boostClear) || 2;

  const editBtn = new ButtonBuilder()
    .setCustomId('sxwarn_edit')
    .setLabel('Ayarları Düzenle')
    .setStyle('Primary')
    .setEmoji('✏️');

  return {
    embeds: [
      info({
        title: '⚠️ Uyarı Sistemi & Boost',
        description:
          'Uyarılar belirli bir süre sonra otomatik "düşer". Boost basan üyelere ayrıcalık tanımlanır. ' +
          'Tüm uyarı işlemleri sonucunda kullanıcıya DM gönderilir ve **aynı mesaj** belirlenen log kanalına yazılır.',
        fields: [
          { name: 'Geçerlilik Süresi', value: `${days} gün`, inline: true },
          { name: 'Boost\'ta Süre Yarıya', value: half, inline: true },
          { name: 'Boost\'ta Sıfırlama', value: `${clear}. boost`, inline: true },
          {
            name: 'Nasıl Çalışır?',
            value:
              `• Uyarı verildikten **${days} gün** sonra düşer (artık sayılmaz).\n` +
              `• Üye boost\'luysa süre **yarıya** iner (${(days / 2).toFixed(1)} gün).\n` +
              `• Üye **${clear}. kez** boost bastığında tüm uyarıları sıfırlanır.`,
          },
        ],
      }),
    ],
    components: [new ActionRowBuilder().addComponents(editBtn)],
  };
}

/* ------------------------------------------------------------------ *
 * /setup butonlarından çağrılan giriş noktaları
 * ------------------------------------------------------------------ */

async function handleTicketStaff(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  return interaction.reply({ ...typeSelectView(interaction.guild), ephemeral: true });
}

async function handleProtection(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  return interaction.reply({ ...protectionView(interaction.guild), ephemeral: true });
}

async function handleAutoPunish(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  return interaction.reply({ ...autoPunishView(interaction.guild), ephemeral: true });
}

async function handleWarnings(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  return interaction.reply({ ...warningsView(interaction.guild), ephemeral: true });
}

/* ------------------------------------------------------------------ *
 * Buton yönlendiricisi (sx... butonları)
 * ------------------------------------------------------------------ */

async function handleSetupExtraButton(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  const id = interaction.customId || '';
  const guild = interaction.guild;

  if (id === 'sxts_back') {
    return interaction.update({ ...typeSelectView(guild) });
  }

  if (id.startsWith('sxts_clear_')) {
    const category = decodeURIComponent(id.slice('sxts_clear_'.length));
    setTicketStaff(guild.id, category, []);
    return interaction.update({ content: '🗑️ Tüm yetkili roller temizlendi.', ...roleSelectView(guild, category) });
  }

  if (id === 'sxprot_toggle') {
    const cfg = getProfanityConfig(guild.id);
    const enabled = cfg.enabled === false;
    setProfanityConfig(guild.id, { ...cfg, enabled });
    return interaction.update({
      content: enabled ? '✅ Koruma filtresi açıldı.' : '⛔ Koruma filtresi kapatıldı.',
      ...protectionView(guild),
    });
  }

  if (id === 'sxprot_message') {
    return openProtectionMessageModal(interaction);
  }

  if (id === 'sxprot_test') {
    return openProtectionTestModal(interaction);
  }

  if (id === 'sxpun_edit') {
    return openAutoPunishEditModal(interaction);
  }

  if (id === 'sxwarn_edit') {
    return openWarningEditModal(interaction);
  }

  if (id === 'sxpun_toggle') {
    const cfg = getAutoPunishConfig(guild.id);
    const enabled = cfg.enabled === false;
    setAutoPunishConfig(guild.id, { ...cfg, enabled });
    return interaction.update({
      content: enabled ? '✅ Otomatik ceza sistemi açıldı.' : '⛔ Otomatik ceza sistemi kapatıldı.',
      ...autoPunishView(guild),
    });
  }

  return interaction.reply({
    embeds: [error({ title: 'Bilinmeyen Buton', description: `\`${id}\` desteklenmiyor.` })],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Select yönlendiricisi (sx... menüleri)
 * ------------------------------------------------------------------ */

async function handleSetupExtraSelect(interaction) {
  if (!requireStaff(interaction)) return permissionDenied(interaction);
  const id = interaction.customId || '';
  const guild = interaction.guild;

  if (id === 'sxts_type') {
    const category = interaction.values[0];
    return interaction.update({ ...roleSelectView(guild, category) });
  }

  if (id.startsWith('sxts_roles_')) {
    const category = decodeURIComponent(id.slice('sxts_roles_'.length));
    setTicketStaff(guild.id, category, interaction.values);
    return interaction.update({
      content: `✅ **${category}** için ${interaction.values.length} yetkili rol kaydedildi.`,
      ...roleSelectView(guild, category),
    });
  }

  if (id === 'sxprot_duration') {
    const minutes = Number(interaction.values[0]) || 10;
    const cfg = getProfanityConfig(guild.id);
    setProfanityConfig(guild.id, { ...cfg, muteMinutes: minutes });
    return interaction.update({
      content: `✅ Susturma süresi **${minutes} dakika** olarak ayarlandı.`,
      ...protectionView(guild),
    });
  }

  return interaction.reply({
    embeds: [error({ title: 'Bilinmeyen Menü', description: `\`${id}\` desteklenmiyor.` })],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Koruma filtresi uyarı mesajı modalı
 * ------------------------------------------------------------------ */

async function openProtectionMessageModal(interaction) {
  const cfg = getProfanityConfig(interaction.guild.id);
  const modalId = 'sxprot_msg_modal';
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Koruma Filtresi — Uyarı Mesajı');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxprot_msg_text')
        .setLabel('Kullanıcıya gösterilecek mesaj')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
        .setValue((cfg.message || '').slice(0, 1000))
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
    return; // zaman aşımı / iptal
  }

  const text = (submitted.fields.getTextInputValue('sxprot_msg_text') || '').trim();
  if (!text) {
    return submitted.reply({
      embeds: [error({ title: 'Boş Mesaj', description: 'Mesaj boş olamaz.' })],
      ephemeral: true,
    });
  }

  const fresh = getProfanityConfig(submitted.guild.id);
  setProfanityConfig(submitted.guild.id, { ...fresh, message: text });

  return submitted.reply({
    embeds: [success({ title: '✅ Mesaj Güncellendi', description: 'Koruma filtresi uyarı mesajı kaydedildi.' })],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Koruma filtresi test modalı
 * ------------------------------------------------------------------ */

async function openProtectionTestModal(interaction) {
  const modalId = 'sxprot_test_modal';
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Koruma Filtresi — Test');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxprot_test_text')
        .setLabel('Test edilecek mesaj')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
        .setPlaceholder('Örnek: ataturk orospu cocugu')
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
    return;
  }

  const text = (submitted.fields.getTextInputValue('sxprot_test_text') || '').trim();
  const result = analyze(text);

  if (result.violated) {
    return submitted.reply({
      embeds: [
        warning({
          title: '🧪 Test Sonucu: FİLTRELENİR',
          description: 'Bu mesaj koruma filtresi tarafından **ihlal** olarak değerlendirilir.',
          fields: [
            { name: 'Kategori', value: result.category || '-', inline: true },
            { name: 'Hedef Değer', value: result.value || '-', inline: true },
            { name: 'Tespit Edilen', value: result.profanity || '-', inline: true },
            { name: 'Mesaj', value: text.slice(0, 1000) || '-' },
          ],
        }),
      ],
      ephemeral: true,
    });
  }

  return submitted.reply({
    embeds: [
      success({
        title: '🧪 Test Sonucu: FİLTRELENMEZ',
        description: 'Bu mesaj koruma filtresi tarafından **ihlal** sayılmaz.',
        fields: [{ name: 'Mesaj', value: text.slice(0, 1000) || '-' }],
      }),
    ],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Otomatik ceza kademeleri düzenleme modalı
 * ------------------------------------------------------------------ */

async function openAutoPunishEditModal(interaction) {
  const cfg = getAutoPunishConfig(interaction.guild.id);
  const ladderText = (cfg.ladder || []).map((s) => `${s.count}=${s.minutes}`).join('\n');

  const modalId = 'sxpun_edit_modal';
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Otomatik Ceza — Kademeler');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxpun_ladder')
        .setLabel('Kademeler — her satır: uyarı=mute(dk)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true)
        .setValue(ladderText)
        .setPlaceholder('3=10\n5=30\n10=120\n15=720')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxpun_ban')
        .setLabel('Ban eşiği (uyarı sayısı)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(4)
        .setRequired(true)
        .setValue(String(cfg.banAt))
        .setPlaceholder('20')
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
    return;
  }

  const ladderRaw = submitted.fields.getTextInputValue('sxpun_ladder') || '';
  const banRaw = (submitted.fields.getTextInputValue('sxpun_ban') || '').trim();

  const ladder = [];
  for (const line of ladderRaw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = /^(\d+)\s*[=:;,\s]\s*(\d+)$/.exec(t);
    if (!m) {
      return submitted.reply({
        embeds: [
          error({
            title: 'Geçersiz Satır',
            description: `\`${t}\` biçimi hatalı. Beklenen: \`uyarı=mute_dakika\`. Örnek: \`3=10\``,
          }),
        ],
        ephemeral: true,
      });
    }
    const count = Number(m[1]);
    const minutes = Number(m[2]);
    if (count < 1 || minutes < 1) {
      return submitted.reply({
        embeds: [error({ title: 'Geçersiz Değer', description: 'Uyarı sayısı ve süre en az 1 olmalı.' })],
        ephemeral: true,
      });
    }
    ladder.push({ count, minutes });
  }

  if (!ladder.length) {
    return submitted.reply({
      embeds: [error({ title: 'Boş Kademe', description: 'En az bir kademe girmelisiniz.' })],
      ephemeral: true,
    });
  }

  ladder.sort((a, b) => a.count - b.count);

  const banAt = Number(banRaw);
  if (!Number.isInteger(banAt) || banAt < 1) {
    return submitted.reply({
      embeds: [error({ title: 'Geçersiz Ban Eşiği', description: 'Ban eşiği en az 1 olan bir tam sayı olmalı.' })],
      ephemeral: true,
    });
  }

  const maxTier = ladder[ladder.length - 1].count;
  if (banAt <= maxTier) {
    return submitted.reply({
      embeds: [
        error({
          title: 'Tutarsız Eşik',
          description: `Ban eşiği son kademeden büyük olmalı (en az **${maxTier + 1}**).`,
        }),
      ],
      ephemeral: true,
    });
  }

  const fresh = getAutoPunishConfig(submitted.guild.id);
  setAutoPunishConfig(submitted.guild.id, { ...fresh, ladder, banAt });

  const summary = ladder.map((s) => `• ${s.count} uyarı → ${s.minutes} dk mute`).join('\n');
  return submitted.reply({
    embeds: [
      success({
        title: '✅ Kademeler Güncellendi',
        description: 'Otomatik ceza kademeleri kaydedildi.',
        fields: [
          { name: 'Kademeler', value: summary },
          { name: 'Ban Eşiği', value: `${banAt} uyarı`, inline: true },
        ],
      }),
    ],
    ephemeral: true,
  });
}

/* ------------------------------------------------------------------ *
 * Uyarı sistemi (geçerlilik + boost) düzenleme modalı
 * ------------------------------------------------------------------ */

async function openWarningEditModal(interaction) {
  const cfg = getWarningConfig(interaction.guild.id);

  const modalId = 'sxwarn_edit_modal';
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Uyarı Sistemi & Boost Ayarları');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxwarn_days')
        .setLabel('Uyarı geçerlilik süresi (gün)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(4)
        .setRequired(true)
        .setValue(String(cfg.expiryDays))
        .setPlaceholder('15')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxwarn_half')
        .setLabel('Boost\'ta süre yarıya insin mi? (evet/hayır)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(5)
        .setRequired(true)
        .setValue(cfg.boosterHalf ? 'evet' : 'hayır')
        .setPlaceholder('evet')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sxwarn_clear')
        .setLabel('Kaçıncı boost\'ta uyarılar sıfırlansın')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(3)
        .setRequired(true)
        .setValue(String(cfg.boostClear))
        .setPlaceholder('2')
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
    return;
  }

  const daysRaw = (submitted.fields.getTextInputValue('sxwarn_days') || '').trim();
  const halfRaw = (submitted.fields.getTextInputValue('sxwarn_half') || '').trim().toLowerCase();
  const clearRaw = (submitted.fields.getTextInputValue('sxwarn_clear') || '').trim();

  const days = Number(daysRaw);
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    return submitted.reply({
      embeds: [error({ title: 'Geçersiz Süre', description: 'Geçerlilik süresi 1 ile 3650 gün arasında olmalı.' })],
      ephemeral: true,
    });
  }

  const clear = Number(clearRaw);
  if (!Number.isInteger(clear) || clear < 1 || clear > 100) {
    return submitted.reply({
      embeds: [error({ title: 'Geçersiz Boost Eşiği', description: 'Boost sıfırlama eşiği 1 ile 100 arasında bir tam sayı olmalı.' })],
      ephemeral: true,
    });
  }

  const yes = ['evet', 'e', 'yes', 'y', 'true', '1', 'açık', 'acik', 'on'];
  const no = ['hayır', 'hayir', 'h', 'no', 'n', 'false', '0', 'kapalı', 'kapali', 'off'];
  let boosterHalf;
  if (yes.includes(halfRaw)) boosterHalf = true;
  else if (no.includes(halfRaw)) boosterHalf = false;
  else {
    return submitted.reply({
      embeds: [error({ title: 'Geçersiz Değer', description: 'İkinci alana **evet** ya da **hayır** yazın.' })],
      ephemeral: true,
    });
  }

  const fresh = getWarningConfig(submitted.guild.id);
  setWarningConfig(submitted.guild.id, { ...fresh, expiryDays: days, boosterHalf, boostClear: clear });

  return submitted.reply({
    embeds: [
      success({
        title: '✅ Uyarı Sistemi Güncellendi',
        description: 'Yeni ayarlar kaydedildi.',
        fields: [
          { name: 'Geçerlilik Süresi', value: `${days} gün`, inline: true },
          { name: 'Boost\'ta Süre Yarıya', value: boosterHalf ? 'Evet' : 'Hayır', inline: true },
          { name: 'Boost\'ta Sıfırlama', value: `${clear}. boost`, inline: true },
        ],
      }),
    ],
    ephemeral: true,
  });
}

module.exports = {
  handleTicketStaff,
  handleProtection,
  handleAutoPunish,
  handleWarnings,
  handleSetupExtraButton,
  handleSetupExtraSelect,
};
