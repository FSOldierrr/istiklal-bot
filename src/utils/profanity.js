'use strict';

/**
 * İstiklal Bot — Koruma Filtresi
 * ------------------------------------------------------------------
 * Milli değerlere (Atatürk, Türk milleti, vatan, bayrak, şehit, cumhuriyet,
 * İstiklal ...) ve dini değerlere (Allah, Kur'an, peygamber, İslam, ezan ...)
 * yönelik küfür/hakaret içeren mesajları tespit eder.
 *
 * Tespit mantığı:
 *   1) Mesajda korunan bir değer geçiyor mu? (milli veya dini)
 *   2) Aynı mesajda küfür/hakaret geçiyor mu?
 *   3) İkisi birlikteyse -> ihlal. Mesaj silinir, üye susturulur, log atılır.
 *
 * Amaç: "vatan" gibi tek başına geçen masum kelimeleri değil, yalnızca
 * bu değerlere yönelik hakareti yakalamak. Bu yüzden iki koşul birlikte aranır.
 */

const { getProfanityConfig } = require('../database/db');
const { warning } = require('./embeds');
const { notifySameMessage } = require('./warnNotify');

// ------------------------------------------------------------------
// Ayar (tek yerden yönetilir)
// ------------------------------------------------------------------
const CONFIG = {
  // Susturma süresi (ms) — varsayılan 10 dakika
  muteDurationMs: 10 * 60 * 1000,
  // Aynı üyeye art arda ceza yazmamak için bekleme (ms)
  cooldownMs: 30 * 1000,
  // İhlal mesajı kanaldan kaç ms sonra silinsin
  noticeDeleteMs: 10 * 1000,
  // Log kanalına yazılsın mı
  logEnabled: true,
  // Suçluya DM olarak gönderilecek caydırıcı mesaj.
  // Not: Bilinçli olarak aşağılayıcı/küfürlü değildir. Üslubu buradan değiştirebilirsin.
  offenderMessage: [
    'Milli ve dini değerlerimize yönelik hakaret içeren bir mesaj gönderdiniz.',
    "Bu davranış İstiklal'in hiçbir sunucusunda kabul edilmez.",
    'Bu nedenle susturuldunuz.',
  ].join('\n'),
};

// ------------------------------------------------------------------
// Kelime listeleri (normalize edilmiş / küçük harf / aksansız karşılıkları)
// ------------------------------------------------------------------
const PROFANITY = [
  'orospu', 'oruspu', 'orospu cocugu', 'oç', 'oc',
  'siktir', 'sikeyim', 'sikerim', 'sikik', 'sikis',
  'amk', 'amq', 'aq', 'pic', 'piç',
  'yavsak', 'serefsiz', 'got', 'göt',
  'yarrak', 'yarak', 'pezevenk', 'kahpe', 'kahbe',
  'surtuk', 'pust', 'pusht', 'ibne', 'godos', 'gavat',
  'aptal', 'salak', 'gerizekali', 'beyinsiz', 'angut',
  'hain', 'soysuz', 'namussuz', 'rezil', 'alcak', 'alçak', 'sapik',
];

const MILLI_VALUES = [
  'ataturk', 'mustafa kemal', 'kemal',
  'turk[a-z]{0,4}', 'turkiye',
  'vatan[a-z]{0,5}', 'millet[a-z]{0,5}', 'bayrak[a-z]{0,5}',
  'sehit[a-z]{0,6}', 'gazi[a-z]{0,4}', 'istiklal',
  'cumhuriyet[a-z]{0,5}', 'meclis[a-z]{0,5}', 'asker[a-z]{0,5}',
  'komutan[a-z]{0,5}', 'devlet[a-z]{0,5}',
  'ordu(?:muz|su|lar)?', 'ulus(?:umuz|lar)?',
  'hilal', 'ayyildiz', 'kizilelma', 'turan', 'mavi vatan',
];

const DINI_VALUES = [
  'allah[a-z]{0,5}', 'kuran[a-z]{0,4}', 'peygamber[a-z]{0,6}',
  'muhammed[a-z]{0,4}', 'islam[a-z]{0,4}', 'musluman[a-z]{0,5}',
  'din(?:i|e|in|imiz|ler|lerimize)?', 'iman[a-z]{0,5}',
  'ezan[a-z]{0,3}', 'cami[a-z]{0,4}', 'namaz[a-z]{0,5}',
  'oruc[a-z]{0,4}', 'kabe', 'melek[a-z]{0,4}', 'cennet[a-z]{0,4}', 'cehennem[a-z]{0,4}',
  'sevap[a-z]{0,4}', 'gunah[a-z]{0,4}', 'dua(?:si|sina|ya|miz|lar)?', 'helal[a-z]{0,4}',
  'haram[a-z]{0,4}', 'cuma[a-z]{0,4}', 'bayram[a-z]{0,5}', 'ayet[a-z]{0,4}',
  'hadis[a-z]{0,4}', 'mescid[a-z]{0,4}', 'hac(?:ca|ci|a|imiz)?', 'umre', 'kible', 'abdest',
];

// Kaçamak yazımları (a.m.k / a m k) yakalamak için bitişik arama listesi.
// Yalnızca ayırt edici (yanlış eşleşme riski düşük) küfürler burada.
const PROFANITY_COMPACT = [
  'amk', 'amq', 'orospu', 'siktir', 'sikeyim', 'sikerim', 'sikik', 'sikis',
  'yarrak', 'yarak', 'pezevenk', 'serefsiz', 'yavsak', 'kahpe', 'gavat',
];

// ------------------------------------------------------------------
// Normalizasyon + eşleştirme
// ------------------------------------------------------------------
function normalize(text) {
  let t = String(text || '').toLowerCase();
  // Aksan/şapka ve Türkçe karakterleri sadeleştir
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u');
  // Leetspeak / klavye kaçamakları
  t = t
    .replace(/[4@]/g, 'a').replace(/[1!|]/g, 'i').replace(/3/g, 'e')
    .replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/8/g, 'b').replace(/9/g, 'g');
  return t;
}

// Kelime arası ayraçları boşluğa çevirir -> (^| )kelime( |$)
function toSpaced(norm) {
  return ` ${norm.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

// Tüm ayraçları siler -> bitişik yazım/kaçamak yakalama (s i k t i r)
function toCompact(norm) {
  return norm.replace(/[^a-z0-9]+/g, '');
}

const PROFANITY_SPACED_RE = new RegExp(`(?:^| )(?:${PROFANITY.join('|')})(?= |$)`);
const PROFANITY_COMPACT_RE = new RegExp(PROFANITY_COMPACT.join('|'));
const MILLI_RE = new RegExp(`(?:^| )(?:${MILLI_VALUES.join('|')})(?= |$)`);
const DINI_RE = new RegExp(`(?:^| )(?:${DINI_VALUES.join('|')})(?= |$)`);

function matchProfanity(norm) {
  const spaced = toSpaced(norm);
  const spacedMatch = spaced.match(PROFANITY_SPACED_RE);
  if (spacedMatch) return spacedMatch[0].trim();

  const compact = toCompact(norm);
  const compactMatch = compact.match(PROFANITY_COMPACT_RE);
  if (compactMatch) return compactMatch[0];

  return null;
}

function matchProtected(norm) {
  const spaced = toSpaced(norm);
  const milli = spaced.match(MILLI_RE);
  if (milli) return { category: 'milli değerler', value: milli[0].trim() };
  const dini = spaced.match(DINI_RE);
  if (dini) return { category: 'dini değerler', value: dini[0].trim() };
  return null;
}

/**
 * Metni analiz eder.
 * @returns {{violated: boolean, category?: string, value?: string, profanity?: string}}
 */
function analyze(text) {
  const norm = normalize(text);
  const prot = matchProtected(norm);
  if (!prot) return { violated: false };
  const prof = matchProfanity(norm);
  if (!prof) return { violated: false };
  return { violated: true, category: prot.category, value: prot.value, profanity: prof };
}

// ------------------------------------------------------------------
// Ceza uygulama (event tarafından çağrılır)
// ------------------------------------------------------------------
const lastPunish = new Map();

async function applyProtection(message, client) {
  if (!message.guild || message.author?.bot || !message.member) return;
  const content = message.content || '';
  if (!content) return;

  // Sunucuya özel yapılandırma (kapalıysa hiç çalışma)
  const cfg = getProfanityConfig(message.guild.id);
  if (cfg.enabled === false) return;

  const result = analyze(content);
  if (!result.violated) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = lastPunish.get(key) || 0;
  if (now - last < CONFIG.cooldownMs) return;
  lastPunish.set(key, now);

  const muteDurationMs = Math.max(1, Number(cfg.muteMinutes) || 10) * 60 * 1000;

  // 1) İhlal mesajını sil
  await message.delete().catch(() => {});

  // 2) Üyeyi sustur
  let muted = false;
  try {
    if (message.member.moderatable) {
      await message.member.timeout(
        muteDurationMs,
        `Milli/dini değerlere hakaret (${result.category}: ${result.value})`
      );
      muted = true;
    }
  } catch (err) {
    console.error('[koruma] Susturma başarısız:', err.message);
  }

  const minutes = Math.round(muteDurationMs / 60000);

  // 3) Aynı mesaj: kullanıcıya DM + belirlenen log kanalına
  const protectEmbed = warning({
    title: 'Koruma Filtresi',
    emoji: '🛡️',
    description: `${cfg.message || CONFIG.offenderMessage}\n\n**Cezanız:** ${minutes} dakika susturulma`,
    fields: [
      { name: '👤 Hakkında', value: `${message.author} \`${message.author.id}\``, inline: true },
      { name: '📌 Kanal', value: `<#${message.channel.id}>`, inline: true },
      { name: '🏷️ Kategori', value: result.category, inline: true },
      { name: '🎯 Hedef Değer', value: result.value, inline: true },
      { name: '🚫 Tespit Edilen', value: result.profanity, inline: true },
      { name: '⚖️ Uygulanan', value: muted ? `${minutes} dk susturma` : 'Susturma uygulanamadı', inline: true },
      { name: '📝 Mesaj', value: content.slice(0, 1024) || '*boş*', inline: false },
    ],
  });

  await notifySameMessage(message.client || client, message.guild, message.author.id, protectEmbed);

  // 4) Kanala kısa bir uyarı gönder (sonra silinir)
  const notice = await message.channel
    .send({
      embeds: [
        warning({
          title: 'Koruma Filtresi Devrede',
          emoji: '⛔',
          description: muted
            ? `${message.author} **${result.category}**e yönelik hakaret içerdiği için **${minutes} dakika** susturuldu.`
            : `${message.author} tarafından **${result.category}**e yönelik hakaret içeren mesaj silindi. (Susturma uygulanamadı.)`,
        }),
      ],
    })
    .catch(() => null);
  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), CONFIG.noticeDeleteMs).unref?.();
  }
}

module.exports = { CONFIG, analyze, normalize, applyProtection };
