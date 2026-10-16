'use strict';

/**
 * İstiklal Bot — Ticket Transkripti (index.html)
 * ------------------------------------------------------------------
 * Bir ticket kanalının tüm sohbet geçmişini ve analizini tek dosyalık,
 * bağımsız bir index.html olarak üretir. Çıktı hem kapatılan kullanıcıya
 * DM olarak hem de log kanalına gönderilir.
 */

const { analyze } = require('./profanity');

const COLORS = {
  bg: '#1e1f22',
  panel: '#2b2d31',
  panel2: '#313338',
  border: '#3f4147',
  text: '#dbdee1',
  muted: '#949ba4',
  accent: '#5865f2',
  green: '#2ecc71',
  red: '#e74c3c',
  yellow: '#f1c40f',
};

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkify(text) {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function formatDate(value) {
  if (value == null) return '—';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

function humanDuration(fromMs, toMs) {
  const ms = Math.max(0, toMs - fromMs);
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [];
  if (d) parts.push(`${d} gün`);
  if (h) parts.push(`${h} saat`);
  parts.push(`${m} dakika`);
  return parts.join(' ');
}

async function fetchAllMessages(channel, max = 2000) {
  const collected = [];
  let lastId = null;
  while (collected.length < max) {
    const options = { limit: Math.min(100, max - collected.length) };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  return collected.reverse();
}

function memberName(guild, id) {
  const member = guild?.members?.cache?.get(id);
  if (member) return member.user.username;
  const user = guild?.client?.users?.cache?.get(id);
  return user ? user.username : id;
}

/**
 * HTML transkripti üretir.
 * @param {TextChannel} channel - Ticket kanalı
 * @param {Object} ticket - Veritabanı ticket kaydı
 * @param {Object} closer - Ticketi kapatan (User veya GuildMember)
 * @returns {Promise<Buffer>}
 */
async function generateTicketHtml(channel, ticket, closer) {
  const guild = channel.guild;
  const messages = await fetchAllMessages(channel);

  // --- Analiz ---
  const authorCounts = new Map(); // id -> { name, count, bot }
  let humanCount = 0;
  let botCount = 0;
  let attachmentCount = 0;
  let embedCount = 0;
  let linkCount = 0;
  let flaggedCount = 0;

  for (const msg of messages) {
    const isBot = msg.author?.bot;
    if (isBot) botCount += 1;
    else humanCount += 1;

    const key = msg.author?.id || 'unknown';
    const entry = authorCounts.get(key) || {
      name: msg.author ? msg.author.username : 'Bilinmeyen',
      count: 0,
      bot: !!isBot,
    };
    entry.count += 1;
    authorCounts.set(key, entry);

    attachmentCount += msg.attachments?.size || 0;
    embedCount += msg.embeds?.length || 0;
    linkCount += (msg.content?.match(/https?:\/\//g) || []).length;
    if (!isBot && msg.content && analyze(msg.content).violated) flaggedCount += 1;
  }

  const participants = [...authorCounts.values()].sort((a, b) => b.count - a.count);
  const openedMs = new Date(ticket.created_at).getTime();
  const closedMs = ticket.closed_at ? new Date(ticket.closed_at).getTime() : Date.now();

  const number = String(ticket.ticket_number ?? ticket.id ?? 0).padStart(4, '0');
  const ownerId = ticket.owner_id;
  const ownerName = memberName(guild, ownerId);
  const closerName = closer ? closer.username || closer.user?.username || String(closer) : 'Bilinmiyor';
  const claimedName = ticket.claimed_by ? memberName(guild, ticket.claimed_by) : null;

  // --- Mesaj satırları ---
  const messageRows = messages
    .map((msg) => {
      const bot = msg.author?.bot;
      const name = escapeHtml(msg.author ? msg.author.username : 'Bilinmeyen');
      const avatar = msg.author?.displayAvatarURL
        ? msg.author.displayAvatarURL({ extension: 'png', size: 64 })
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      const time = formatDate(msg.createdTimestamp);

      const attachments = [...(msg.attachments?.values() || [])]
        .map(
          (a) =>
            `<a class="attach" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(
              a.name || 'dosya'
            )}</a>`
        )
        .join(' ');

      const embeds = (msg.embeds || [])
        .map((e) => `<div class="embed-note">🔗 ${escapeHtml(e.title || 'Embed içerik')}</div>`)
        .join('');

      const body = msg.content ? `<div class="content">${linkify(msg.content).replace(/\n/g, '<br>')}</div>` : '';
      const flag = !bot && msg.content && analyze(msg.content).violated;
      const flagBadge = flag ? '<span class="flag">⚠️ filtre eşleşmesi</span>' : '';

      return `
        <div class="msg${bot ? ' bot' : ''}">
          <img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="bubble">
            <div class="meta">
              <span class="author${bot ? ' botname' : ''}">${name}${bot ? ' <span class="tagbot">BOT</span>' : ''}</span>
              <span class="time">${escapeHtml(time)}</span>
              ${flagBadge}
            </div>
            ${body}
            ${attachments}
            ${embeds}
          </div>
        </div>`;
    })
    .join('\n');

  const participantRows = participants
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.name)}${p.bot ? ' 🤖' : ''}</td><td class="num">${p.count}</td></tr>`
    )
    .join('\n');

  const analysis = {
    total: messages.length,
    humanCount,
    botCount,
    participantCount: participants.length,
    attachmentCount,
    embedCount,
    linkCount,
    flaggedCount,
    duration: humanDuration(openedMs, closedMs),
  };

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>İstiklal • Ticket #${number} Transkripti</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: ${COLORS.bg}; color: ${COLORS.text};
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 900px; margin: 0 auto; }
  .header {
    background: linear-gradient(135deg, ${COLORS.accent}, #4752c4);
    border-radius: 12px; padding: 24px; color: #fff; margin-bottom: 20px;
  }
  .header h1 { margin: 0 0 6px; font-size: 1.5rem; }
  .header .sub { opacity: .9; font-size: .9rem; }
  .badges { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  .badge {
    background: rgba(0,0,0,.25); padding: 4px 12px; border-radius: 20px;
    font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .5px;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card {
    background: ${COLORS.panel}; border: 1px solid ${COLORS.border};
    border-radius: 10px; padding: 14px 16px;
  }
  .card .label { color: ${COLORS.muted}; font-size: .72rem; text-transform: uppercase; letter-spacing: .5px; }
  .card .value { font-size: .95rem; margin-top: 4px; word-break: break-word; }
  h2 { font-size: 1.05rem; margin: 24px 0 12px; color: #fff; }
  table { width: 100%; border-collapse: collapse; background: ${COLORS.panel}; border-radius: 10px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid ${COLORS.border}; font-size: .9rem; }
  th { background: ${COLORS.panel2}; color: ${COLORS.muted}; font-size: .75rem; text-transform: uppercase; letter-spacing: .5px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .stats span { display: inline-block; margin-right: 14px; margin-bottom: 8px; }
  .stats b { color: #fff; }
  .chat { display: flex; flex-direction: column; gap: 14px; }
  .msg { display: flex; gap: 12px; align-items: flex-start; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px; background: ${COLORS.panel2}; }
  .bubble { background: ${COLORS.panel}; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 10px 14px; flex: 1; min-width: 0; }
  .msg.bot .bubble { border-color: ${COLORS.accent}; }
  .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .author { font-weight: 600; color: #fff; }
  .botname { color: #a5b3ff; }
  .tagbot { background: ${COLORS.accent}; color: #fff; font-size: .6rem; padding: 1px 6px; border-radius: 4px; vertical-align: middle; }
  .time { color: ${COLORS.muted}; font-size: .75rem; }
  .flag { color: ${COLORS.red}; font-size: .72rem; font-weight: 600; }
  .content { white-space: pre-wrap; word-break: break-word; }
  .attach { display: inline-block; margin-top: 6px; margin-right: 8px; color: ${COLORS.accent}; font-size: .85rem; }
  .embed-note { margin-top: 6px; color: ${COLORS.muted}; font-size: .82rem; }
  .footer { text-align: center; color: ${COLORS.muted}; font-size: .8rem; margin-top: 30px; padding-top: 16px; border-top: 1px solid ${COLORS.border}; }
  .empty { color: ${COLORS.muted}; text-align: center; padding: 30px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>🎫 Ticket #${number}</h1>
    <div class="sub">${escapeHtml(guild.name)} — sohbet geçmişi ve analiz raporu</div>
    <div class="badges">
      <span class="badge">${escapeHtml(ticket.category || 'Kategori')}</span>
      <span class="badge">${escapeHtml(ticket.status === 'closed' ? 'Kapalı' : ticket.status || 'Açık')}</span>
      <span class="badge">${messages.length} mesaj</span>
    </div>
  </div>

  <div class="grid">
    <div class="card"><div class="label">Sahip</div><div class="value">${escapeHtml(ownerName)} (${escapeHtml(ownerId)})</div></div>
    <div class="card"><div class="label">Kapatan</div><div class="value">${escapeHtml(closerName)}</div></div>
    <div class="card"><div class="label">Üstlenen</div><div class="value">${claimedName ? escapeHtml(claimedName) : 'Yok'}</div></div>
    <div class="card"><div class="label">Açılış</div><div class="value">${escapeHtml(formatDate(ticket.created_at))}</div></div>
    <div class="card"><div class="label">Kapanış</div><div class="value">${escapeHtml(formatDate(ticket.closed_at || Date.now()))}</div></div>
    <div class="card"><div class="label">Süre</div><div class="value">${escapeHtml(analysis.duration)}</div></div>
  </div>

  <h2>📊 Analiz</h2>
  <div class="card stats">
    <span>Toplam mesaj: <b>${analysis.total}</b></span>
    <span>İnsan: <b>${analysis.humanCount}</b></span>
    <span>Bot: <b>${analysis.botCount}</b></span>
    <span>Katılımcı: <b>${analysis.participantCount}</b></span>
    <span>Ek dosya: <b>${analysis.attachmentCount}</b></span>
    <span>Bağlantı: <b>${analysis.linkCount}</b></span>
    <span>Filtre eşleşmesi: <b style="color:${analysis.flaggedCount ? COLORS.red : COLORS.green}">${analysis.flaggedCount}</b></span>
  </div>

  <h2>👥 Katılımcılar</h2>
  ${
    participantRows
      ? `<table><thead><tr><th>Kullanıcı</th><th class="num">Mesaj</th></tr></thead><tbody>${participantRows}</tbody></table>`
      : '<div class="card empty">Katılımcı bulunamadı.</div>'
  }

  <h2>💬 Sohbet Geçmişi</h2>
  <div class="chat">
    ${messageRows || '<div class="card empty">Bu ticketta hiç mesaj yok.</div>'}
  </div>

  <div class="footer">İstiklal Bot • Ticket Transkripti • ${escapeHtml(formatDate(Date.now()))}</div>
</div>
</body>
</html>`;

  return Buffer.from(html, 'utf8');
}

module.exports = { generateTicketHtml };
